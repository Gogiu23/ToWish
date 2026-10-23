import { Client, Presences, Query, TablesDB, Teams } from "node-appwrite";
import webpush from "web-push";

const BD = "nuestra-lista";

// Cada dispositivo guarda su "endpoint" (la dirección del servicio push de su navegador) y este servidor le hace una
// petición. Sin esta lista, alguien con cuenta podría guardar la dirección de cualquier web y usar el servidor para
// hacerle peticiones (SSRF). Solo valen los servicios de Chrome/Android, Firefox, Safari y Edge.
const PUSH_PERMITIDOS =
  /^(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)?push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)$/;

function endpointPermitido(texto) {
  try {
    const u = new URL(texto);
    return u.protocol === "https:" && !u.port && !u.username && !u.password && PUSH_PERMITIDOS.test(u.hostname);
  } catch {
    return false;
  }
}

const corto = (t, n = 140) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

// Textos de los avisos en el idioma de cada dispositivo (el que tenía la app al activar los avisos)
const TEXTOS = {
  es: {
    plan: (t) => `Nuevo plan: ${t}`,
    likePlan: (n, t) => `A ${n} le ha gustado «${t}»`,
    likeComentario: (n, t) => `A ${n} le ha gustado tu comentario: «${t}»`,
  },
  ru: {
    plan: (t) => `Новый план: ${t}`,
    likePlan: (n, t) => `${n}: нравится «${t}»`,
    likeComentario: (n, t) => `${n}: нравится ваш комментарий «${t}»`,
  },
  it: {
    plan: (t) => `Nuovo piano: ${t}`,
    likePlan: (n, t) => `A ${n} piace «${t}»`,
    likeComentario: (n, t) => `A ${n} piace il tuo commento: «${t}»`,
  },
};

/**
 * Avisos push del grupo. Se dispara:
 *  - por evento de Appwrite al crearse un mensaje, un plan o un "me gusta" a un comentario;
 *  - desde la app (llamada de un usuario) al dar "me gusta" a un plan: el evento de esa actualización no dice qué
 *    cambió, así que la app lo pide y aquí se comprueba que el "me gusta" está de verdad en el plan.
 * Nunca avisa a quien hizo la acción ni a quien tiene la app abierta (ya lo ve en directo).
 */
export default async function avisar({ req, res, log, error }) {
  // Clave de servidor que Appwrite crea para cada ejecución (con los permisos de la función)
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers["x-appwrite-key"]);
  const db = new TablesDB(client);
  const equipos = new Teams(client);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

  const disparo = req.headers["x-appwrite-trigger"]; // "event" o "http"
  const evento = req.headers["x-appwrite-event"] ?? "";
  const quien = req.headers["x-appwrite-user-id"]; // la cuenta que hizo la acción (la pone Appwrite, no el cliente)
  const datos = req.bodyJson ?? {};
  const fila = (tabla, id) => db.getRow({ databaseId: BD, tableId: tabla, rowId: id }).catch(() => null);

  // Grupo y sus miembros; quien hace la acción tiene que ser de ese grupo (si no, no se avisa a nadie)
  async function grupoDe(teamId) {
    if (!teamId || !quien) return null;
    const [equipo, { memberships }] = await Promise.all([
      equipos.get({ teamId }),
      equipos.listMemberships({ teamId, queries: [Query.limit(100)] }),
    ]).catch(() => [null, { memberships: [] }]);
    const yo = memberships.find((m) => m.userId === quien);
    return equipo && yo ? { nombre: equipo.name, miembros: memberships, yo } : null;
  }

  let aviso; // { destinatarios, url, tag, titulo, cuerpo(textos) }

  if (disparo === "event" && evento.includes(".tables.mensajes.")) {
    // Quien firma el mensaje tiene que ser quien lo escribió de verdad, y del grupo al que se avisa
    if (!datos.texto || datos.autorId !== quien) return res.json({ enviadas: 0, motivo: "autor falso o sin texto" });
    const g = await grupoDe(datos.grupo);
    if (!g) return res.json({ enviadas: 0, motivo: "autor ajeno al grupo" });
    aviso = {
      destinatarios: g.miembros.map((m) => m.userId),
      url: `/?vista=chat&grupo=${datos.grupo}`,
      tag: `chat-${datos.grupo}`, // varios mensajes seguidos se agrupan
      titulo: `${datos.autor} · ${g.nombre}`,
      cuerpo: () => corto(datos.texto),
    };
  } else if (disparo === "event" && evento.includes(".tables.planes.")) {
    const g = await grupoDe(datos.grupo);
    if (!g || !datos.texto) return res.json({ enviadas: 0, motivo: "plan ajeno al grupo" });
    aviso = {
      destinatarios: g.miembros.map((m) => m.userId),
      url: `/?grupo=${datos.grupo}`,
      tag: `plan-${datos.$id}`,
      titulo: `${g.yo.userName || datos.quien} · ${g.nombre}`,
      cuerpo: (t) => t.plan(corto(datos.texto)),
    };
  } else if (disparo === "event" && evento.includes(".tables.reacciones.")) {
    if (datos.userId !== quien) return res.json({ enviadas: 0, motivo: "reacción ajena" });
    const g = await grupoDe(datos.grupo);
    const comentario = g && (await fila("comentarios", datos.comentarioId));
    if (!comentario || comentario.grupo !== datos.grupo) return res.json({ enviadas: 0, motivo: "comentario ajeno" });
    aviso = {
      destinatarios: [comentario.autorId], // solo a quien escribió el comentario
      url: `/?grupo=${datos.grupo}`,
      tag: `like-comentario-${comentario.$id}-${quien}`, // quitar y volver a dar: se sustituye, no se acumula
      titulo: g.nombre,
      cuerpo: (t) => t.likeComentario(g.yo.userName, corto(comentario.texto, 80)),
    };
  } else if (disparo === "http" && datos.accion === "like-plan") {
    const plan = await fila("planes", String(datos.plan ?? ""));
    const g = plan && (await grupoDe(plan.grupo));
    if (!g || !(plan.likes ?? []).includes(quien)) return res.json({ enviadas: 0, motivo: "sin me gusta" });
    aviso = {
      destinatarios: g.miembros.map((m) => m.userId),
      url: `/?grupo=${plan.grupo}`,
      tag: `like-plan-${plan.$id}-${quien}`,
      titulo: g.nombre,
      cuerpo: (t) => t.likePlan(g.yo.userName, corto(plan.texto, 80)),
    };
  } else {
    return res.json({ enviadas: 0, motivo: "nada que avisar" });
  }

  const destinatarios = [...new Set(aviso.destinatarios)].filter((id) => id && id !== quien);
  if (!destinatarios.length) return res.json({ enviadas: 0 });
  const { rows } = await db.listRows({
    databaseId: BD,
    tableId: "suscripciones",
    queries: [Query.equal("userId", destinatarios), Query.limit(100)],
  });

  // Quien tiene la app abierta ya lo ve en directo: no le molestamos con un aviso
  const conectados = new Set(
    (await new Presences(client).list().catch(() => ({ presences: [] }))).presences.map((p) => p.userId),
  );

  let enviadas = 0;
  await Promise.all(
    rows.map(async (s) => {
      // Suscripciones con una dirección que no es de un servicio push de verdad: se borran y no se les envía nada
      if (!endpointPermitido(s.endpoint)) {
        error("suscripción descartada (dirección no permitida)");
        return db.deleteRow({ databaseId: BD, tableId: "suscripciones", rowId: s.$id }).catch(() => {});
      }
      if (conectados.has(s.userId)) return;
      const t = TEXTOS[s.idioma] ?? TEXTOS.es;
      const carga = JSON.stringify({ title: aviso.titulo, body: aviso.cuerpo(t), url: aviso.url, tag: aviso.tag });
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, {
          TTL: 60 * 60, // si el móvil está apagado, el aviso espera hasta 1 hora
        });
        enviadas++;
      } catch (e) {
        // 404/410: el navegador ya no tiene esa suscripción (app desinstalada, permiso quitado…)
        if (e.statusCode === 404 || e.statusCode === 410)
          await db.deleteRow({ databaseId: BD, tableId: "suscripciones", rowId: s.$id }).catch(() => {});
        else error(`push ${e.statusCode ?? ""}: ${e.body ?? e.message}`);
      }
    }),
  );

  log(`${disparo} ${evento || datos.accion}: avisos enviados ${enviadas}`);
  return res.json({ enviadas });
}
