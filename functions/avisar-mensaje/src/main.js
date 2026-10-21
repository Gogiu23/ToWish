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

// Se dispara al crearse un mensaje (evento tablesdb.nuestra-lista.tables.mensajes.rows.*.create)
// y manda una notificación push a los dispositivos de los demás del grupo. Nadie puede ejecutarla a mano.
export default async function avisarMensaje({ req, res, log, error }) {
  const m = req.bodyJson ?? {};
  if (!m.autorId || !m.texto) return res.json({ enviadas: 0, motivo: "no es un mensaje" });

  // Clave de servidor que Appwrite crea para cada ejecución (con los permisos de la función)
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers["x-appwrite-key"]);
  const db = new TablesDB(client);
  const presencias = new Presences(client);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

  // Solo a los del grupo del mensaje (menos quien lo escribe)
  if (!m.grupo) return res.json({ enviadas: 0, motivo: "mensaje sin grupo" });
  const equipos = new Teams(client);
  const [equipo, { memberships }] = await Promise.all([
    equipos.get({ teamId: m.grupo }),
    equipos.listMemberships({ teamId: m.grupo, queries: [Query.limit(100)] }),
  ]).catch(() => [null, { memberships: [] }]);
  // Los datos del mensaje los escribe quien lo manda: sin esta comprobación, alguien podría mandar un mensaje
  // diciendo que es de un grupo ajeno y llenarlo de avisos falsos. Hay que ser miembro del grupo al que se avisa.
  if (!equipo || !memberships.some((x) => x.userId === m.autorId)) {
    error(`mensaje rechazado: el autor no es del grupo`);
    return res.json({ enviadas: 0, motivo: "autor ajeno al grupo" });
  }
  // Si Appwrite dice quién disparó el evento, tiene que ser quien firma el mensaje (no vale hacerse pasar por otro)
  const disparador = req.headers["x-appwrite-user-id"];
  if (disparador && disparador !== m.autorId) {
    error(`mensaje rechazado: lo disparó otra cuenta`);
    return res.json({ enviadas: 0, motivo: "autor falso" });
  }
  log(`cabeceras recibidas: ${Object.keys(req.headers).filter((h) => h.startsWith("x-appwrite") && h !== "x-appwrite-key").join(",")}`);
  const destinatarios = memberships.map((x) => x.userId).filter((id) => id !== m.autorId);
  if (!destinatarios.length) return res.json({ enviadas: 0 });
  const { rows } = await db.listRows({
    databaseId: BD,
    tableId: "suscripciones",
    queries: [Query.equal("userId", destinatarios), Query.limit(100)],
  });

  // Quien tiene la app abierta ya ve el mensaje en directo: no le molestamos con un aviso
  const conectados = new Set(
    (await presencias.list().catch(() => ({ presences: [] }))).presences.map((p) => p.userId),
  );

  const texto = m.texto.length > 140 ? `${m.texto.slice(0, 139)}…` : m.texto;
  // Con varios grupos, el título dice de cuál es; al tocarlo se abre el chat de ese grupo
  const aviso = JSON.stringify({ title: `${m.autor} · ${equipo.name}`, body: texto, url: `/?vista=chat&grupo=${m.grupo}` });

  // Suscripciones con una dirección que no es de un servicio push de verdad: se borran y no se les envía nada
  const validas = [];
  for (const s of rows) {
    if (endpointPermitido(s.endpoint)) validas.push(s);
    else {
      error(`suscripción descartada (dirección no permitida)`);
      await db.deleteRow({ databaseId: BD, tableId: "suscripciones", rowId: s.$id }).catch(() => {});
    }
  }

  let enviadas = 0;
  await Promise.all(
    validas
      .filter((s) => !conectados.has(s.userId))
      .map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, aviso, {
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

  log(`avisos enviados: ${enviadas}`);
  return res.json({ enviadas });
}
