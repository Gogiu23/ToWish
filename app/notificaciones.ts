import { Permission, Role, type Models } from "appwrite";
import { BD, db } from "./appwrite";

// Pública: va en el navegador. La privada solo la tiene la función de Appwrite que envía los avisos.
const VAPID_PUBLICA = "BFnJcytO5Vva86RL23cpM1mryKER5VU0V7GNpiIRCImbQf2wINclrn5msN9yPNw8MQZAibfRuHK3FcXoQeFil0I";
const S = { databaseId: BD, tableId: "suscripciones" };

export type EstadoNotificaciones = "activadas" | "desactivadas" | "bloqueadas" | "instalar" | "no-soportadas";

export function registrarServiceWorker() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

export async function estadoNotificaciones(): Promise<EstadoNotificaciones> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // En el iPhone solo hay push si la app está en la pantalla de inicio
    return /iPhone|iPad|iPod/.test(navigator.userAgent) ? "instalar" : "no-soportadas";
  }
  if (Notification.permission === "denied") return "bloqueadas";
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) ? "activadas" : "desactivadas";
}

// Mismo dispositivo = mismo id de fila (no se duplica al activar dos veces)
async function idDe(endpoint: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 36);
}

// La clave VAPID va como bytes, no como texto base64url
function bytesDe(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Pide permiso (tiene que ser tras un toque del usuario), se suscribe y lo guarda en Appwrite. */
export async function activarNotificaciones(usuario: Models.User): Promise<EstadoNotificaciones> {
  if ((await Notification.requestPermission()) !== "granted") return "bloqueadas";
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDe(VAPID_PUBLICA) }));
  const { endpoint, keys } = sub.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) throw new Error("Suscripción incompleta");
  try {
    await db.createRow({
      ...S,
      rowId: await idDe(endpoint),
      data: { userId: usuario.$id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      // Solo el dueño la ve; la función de Appwrite la lee con su propia clave de servidor
      permissions: [Permission.read(Role.user(usuario.$id)), Permission.delete(Role.user(usuario.$id))],
    });
  } catch (e) {
    if ((e as { code?: number }).code !== 409) throw e; // 409 = ya estaba guardada
  }
  return "activadas";
}

/** Al desactivarlas o al cerrar sesión: que este dispositivo deje de recibir avisos de esta cuenta. */
export async function desactivarNotificaciones() {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await db.deleteRow({ ...S, rowId: await idDe(sub.endpoint) }).catch(() => {});
  await sub.unsubscribe();
}
