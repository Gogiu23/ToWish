import { Client, Presences, Query, TablesDB } from "node-appwrite";
import webpush from "web-push";

const BD = "nuestra-lista";

// Se dispara al crearse un mensaje (evento tablesdb.nuestra-lista.tables.mensajes.rows.*.create)
// y manda una notificación push a los dispositivos del otro. Nadie puede ejecutarla a mano.
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

  const { rows } = await db.listRows({
    databaseId: BD,
    tableId: "suscripciones",
    queries: [Query.notEqual("userId", m.autorId), Query.limit(100)],
  });

  // Quien tiene la app abierta ya ve el mensaje en directo: no le molestamos con un aviso
  const conectados = new Set(
    (await presencias.list().catch(() => ({ presences: [] }))).presences.map((p) => p.userId),
  );

  const texto = m.texto.length > 140 ? `${m.texto.slice(0, 139)}…` : m.texto;
  const aviso = JSON.stringify({ title: m.autor, body: texto, url: "/?vista=chat" });

  let enviadas = 0;
  await Promise.all(
    rows
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
