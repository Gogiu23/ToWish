// Service worker de ToWish: solo notificaciones push (sin caché offline a propósito:
// así nunca se queda una versión vieja de la app guardada en el móvil)

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Lo envía la función de Appwrite "avisar-mensaje": { title, body, url, tag }
// (mensajes del chat, planes nuevos y "me gusta"; el tag agrupa o sustituye los avisos del mismo tipo)
self.addEventListener("push", (event) => {
  const datos = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(datos.title || "ToWish", {
      body: datos.body || "",
      icon: "/web-app-manifest-192x192.png",
      badge: "/icon.png",
      tag: datos.tag || "chat",
      renotify: true,
      data: { url: datos.url || "/?vista=chat" },
    }),
  );
});

// Al tocarla: si la app ya está abierta, se enfoca y va al grupo (y al chat si era un mensaje); si no, se abre ahí
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/?vista=chat", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
      if (abierta) {
        const q = new URL(url).searchParams;
        abierta.postMessage({ vista: q.get("vista") || "planes", grupo: q.get("grupo") });
        return abierta.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
