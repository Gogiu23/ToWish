import type { NextConfig } from "next";
import { ENDPOINT } from "./app/proyecto";

// Política de contenido: la página solo puede cargar y conectarse a lo que está en esta lista. Si algún día se colara
// código ajeno (XSS), no podría sacar datos a otro sitio ni cargar scripts de fuera.
// Cada origen tiene su motivo; si se añade un servicio nuevo a la app, hay que añadirlo aquí.
const appwrite = new URL(ENDPOINT).host; // fra.cloud.appwrite.io
const CSP = [
  "default-src 'self'",
  // 'unsafe-inline': Next mete scripts y estilos en línea al servir las páginas (sin nonces); lo de fuera sigue bloqueado
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // Teselas del mapa y del globo (OpenStreetMap y Esri); data:/blob: para las nubes pintadas en canvas y three.js
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://server.arcgisonline.com",
  "media-src 'self'",
  "font-src 'self' data:",
  // Appwrite (datos y tiempo real por WebSocket), buscadores de sitios y teselas por si three-globe las pide con fetch
  `connect-src 'self' https://${appwrite} wss://${appwrite} https://api.geoapify.com https://photon.komoot.io https://nominatim.openstreetmap.org https://tile.openstreetmap.org https://server.arcgisonline.com`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // HTTPS siempre durante 2 años (el sitio solo se sirve por HTTPS)
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // La app no usa cámara, micrófono, ubicación del dispositivo ni pagos: que nadie (ni código ajeno) los pida
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
          // En desarrollo Next necesita eval y conexiones propias (recarga en caliente): la política solo va en producción
          ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: CSP }] : []),
        ],
      },
      {
        // El service worker nunca se cachea: así los móviles siempre tienen la última versión
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
