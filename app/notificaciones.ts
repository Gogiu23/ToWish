import { Permission, Role, type Models } from "appwrite";
import { BD, db, funciones } from "./appwrite";

// Pública: va en el navegador. La privada solo la tiene la función de Appwrite que envía los avisos.
const VAPID_PUBLICA = "BFnJcytO5Vva86RL23cpM1mryKER5VU0V7GNpiIRCImbQf2wINclrn5msN9yPNw8MQZAibfRuHK3FcXoQeFil0I";
const S = { databaseId: BD, tableId: "suscripciones" };

export type EstadoNotificaciones = "activadas" | "desactivadas" | "bloqueadas" | "instalar" | "no-soportadas";

export function registrarServiceWorker() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

/** Si este dispositivo recibe los avisos de esta cuenta (en el mismo móvil puede haber varias cuentas). */
export async function estadoNotificaciones(usuario: Models.User): Promise<EstadoNotificaciones> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // En el iPhone solo hay push si la app está en la pantalla de inicio
    return /iPhone|iPad|iPod/.test(navigator.userAgent) ? "instalar" : "no-soportadas";
  }
  if (Notification.permission === "denied") return "bloqueadas";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return "desactivadas";
  // La suscripción del navegador es una para todo el móvil; la fila de cada cuenta dice si esa cuenta la usa
  for (const id of await idsDe(sub.endpoint, usuario)) {
    if (await db.getRow({ ...S, rowId: id }).then(() => true, () => false)) return "activadas";
  }
  return "desactivadas";
}

const hash36 = async (texto: string) => {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 36);
};

// Mismo dispositivo y cuenta = mismo id de fila (no se duplica al activar dos veces). Va con la cuenta: en un móvil
// con varias cuentas, cada una tiene su fila. Antes era solo el dispositivo: ese id viejo se sigue borrando.
const idDe = (endpoint: string, usuario: Models.User) => hash36(`${endpoint}|${usuario.$id}`);
const idsDe = async (endpoint: string, usuario: Models.User) => [await idDe(endpoint, usuario), await hash36(endpoint)];

// La clave VAPID va como bytes, no como texto base64url
function bytesDe(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// El idioma de la app: los avisos se escriben en este idioma (lo guarda page.tsx)
function idiomaActual() {
  try {
    return localStorage.getItem("towish-idioma") || "es";
  } catch {
    return "es";
  }
}

// Guarda la suscripción de este dispositivo en Appwrite, con el idioma en que quiere los avisos
async function guardar(usuario: Models.User, sub: PushSubscription, idioma: string) {
  const { endpoint, keys } = sub.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) throw new Error("Suscripción incompleta");
  await db.createRow({
    ...S,
    rowId: await idDe(endpoint, usuario),
    data: { userId: usuario.$id, endpoint, p256dh: keys.p256dh, auth: keys.auth, idioma },
    // Solo el dueño la ve; la función de Appwrite la lee con su propia clave de servidor
    permissions: [Permission.read(Role.user(usuario.$id)), Permission.delete(Role.user(usuario.$id))],
  });
}

/** Pide permiso (tiene que ser tras un toque del usuario), se suscribe y lo guarda en Appwrite. */
export async function activarNotificaciones(usuario: Models.User): Promise<EstadoNotificaciones> {
  if ((await Notification.requestPermission()) !== "granted") return "bloqueadas";
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDe(VAPID_PUBLICA) }));
  const idioma = idiomaActual();
  try {
    await guardar(usuario, sub, idioma);
  } catch (e) {
    if ((e as { code?: number }).code !== 409) throw e; // 409 = ya estaba guardada
  }
  marcarIdioma(usuario, idioma);
  return "activadas";
}

// Qué idioma tiene guardado la suscripción de este dispositivo (para no rehacerla en cada visita)
const claveIdioma = (usuario: Models.User) => `towish-avisos-v2-${usuario.$id}`; // v2: fila por cuenta
function marcarIdioma(usuario: Models.User, idioma: string) {
  try {
    localStorage.setItem(claveIdioma(usuario), idioma);
  } catch {}
}

/**
 * Si este dispositivo tiene los avisos activados y su suscripción está en otro idioma (o es de antes de que se
 * guardara el idioma), se vuelve a guardar con el actual. La fila no se puede editar (solo leer y borrar), así
 * que se borra y se crea de nuevo.
 */
export async function sincronizarIdiomaAvisos(usuario: Models.User, idioma: string) {
  try {
    if (localStorage.getItem(claveIdioma(usuario)) === idioma) return;
    if (!("serviceWorker" in navigator) || Notification.permission !== "granted") return;
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (!sub) return;
    // Solo si esta cuenta ya tenía los avisos en este móvil (si otra cuenta los tiene, esta no se apunta sola)
    const ids = await idsDe(sub.endpoint, usuario);
    let teniaAvisos = false;
    for (const id of ids) teniaAvisos = (await db.deleteRow({ ...S, rowId: id }).then(() => true, () => false)) || teniaAvisos;
    if (teniaAvisos) await guardar(usuario, sub, idioma);
    marcarIdioma(usuario, idioma);
  } catch {} // sin red: se intenta en la próxima visita
}

/** Pide al servidor que avise al grupo de tu "me gusta" a un plan (él comprueba que lo has dado de verdad). */
export function avisarLikePlan(plan: string) {
  funciones
    .createExecution({ functionId: "avisar-mensaje", body: JSON.stringify({ accion: "like-plan", plan }), async: true })
    .catch(() => {}); // si falla, solo se pierde el aviso
}

/**
 * Al desactivarlas, cerrar sesión o eliminar la cuenta: este dispositivo deja de recibir los avisos de esta cuenta.
 * La suscripción del navegador se queda: puede que otra cuenta del mismo móvil la siga usando.
 */
export async function desactivarNotificaciones(usuario: Models.User) {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  for (const id of await idsDe(sub.endpoint, usuario)) await db.deleteRow({ ...S, rowId: id }).catch(() => {});
}
