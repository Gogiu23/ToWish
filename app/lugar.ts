export type Lugar = { nombre: string; lat: number; lng: number };
export type ResultadoLugar = Lugar & { detalle: string };

const valido = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

// Hosts de Google Maps que aceptamos (también para seguir redirecciones en el servidor)
// El dominio de Google tiene que terminar ahí: google.com, google.es, google.co.uk, google.com.ar (nunca google.com.evil.com)
export const esHostGoogle = (host: string) =>
  /^(maps\.app\.goo\.gl|goo\.gl|((www|maps|consent)\.)?google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2}))$/.test(host);

/**
 * Saca coordenadas (y nombre si lo hay) de un link largo de Google Maps.
 * Si solo trae texto (?q=Nombre), devuelve lat/lng NaN para geocodificarlo luego.
 */
export function leerLinkGoogle(href: string): Lugar | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!esHostGoogle(url.hostname)) return null;

  let texto = url.pathname;
  try {
    texto = decodeURIComponent(texto);
  } catch {} // un % mal formado no debe romper la lectura
  texto = texto.replace(/\+/g, " ");
  const enRuta = texto.match(/\/(?:place|search)\/([^/@]+)/)?.[1]?.trim() ?? "";
  const q = (url.searchParams.get("q") ?? url.searchParams.get("query") ?? url.searchParams.get("destination") ?? "").trim();

  // Por orden de precisión: !3d!4d = el sitio exacto; ?q=lat,lng; @lat,lng = centro de la vista
  const exacto = texto.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
  const enQ = q.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  // /maps/search/41.37,+2.15 (lo que sale de los links cortos del móvil)
  const coordsRuta = enRuta.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  const nombre = coordsRuta ? "" : enRuta;
  const vista = texto.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  const coords = exacto ?? coordsRuta ?? enQ ?? vista;

  if (coords) {
    const lat = Number(coords[1]);
    const lng = Number(coords[2]);
    if (!valido(lat, lng)) return null;
    // Sin nombre: "" y el servidor busca el sitio más cercano
    return { nombre: nombre || (!enQ && q) || "", lat, lng };
  }
  const soloTexto = nombre || q;
  return soloTexto ? { nombre: soloTexto, lat: NaN, lng: NaN } : null;
}

type ResultadoOSM = { name?: string; display_name: string; lat: string; lon: string };

// ponytail: Nominatim es gratis pero limitado (1 petición/s, sin autocompletar al teclear); si se queda corto, Google Places con API key
export async function buscarLugares(q: string, idioma: string, init?: RequestInit): Promise<ResultadoLugar[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({ q, format: "jsonv2", limit: "5", "accept-language": idioma }).toString();
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  const datos: ResultadoOSM[] = await r.json();
  return datos
    .map((d) => ({ nombre: d.name || d.display_name, detalle: d.display_name, lat: Number(d.lat), lng: Number(d.lon) }))
    .filter((d) => valido(d.lat, d.lng));
}

// Nombre del sitio en esas coordenadas (para links que solo traen lat,lng)
export async function nombreCercano(lat: number, lng: number, idioma: string, init?: RequestInit) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.search = new URLSearchParams({ lat: String(lat), lon: String(lng), format: "jsonv2", zoom: "18", "accept-language": idioma }).toString();
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  const d: Partial<ResultadoOSM> = await r.json();
  return d.name || d.display_name?.split(",").slice(0, 2).join(",").trim() || "";
}

// Abre Google Maps con la ruta hasta el sitio (en el móvil abre la app)
export const urlRuta = (l: Lugar) => `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`;

/** Teselas de OpenStreetMap que cubren un mapa de `lado` px centrado en el punto. */
export function teselas(lat: number, lng: number, lado: number, zoom = 15) {
  const n = 2 ** zoom;
  const rad = (lat * Math.PI) / 180;
  // Posición del punto en píxeles del mapa mundial a este zoom (proyección Web Mercator)
  const px = ((lng + 180) / 360) * n * 256;
  const py = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n * 256;
  const x0 = px - lado / 2;
  const y0 = py - lado / 2;
  const res = [];
  for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + lado) / 256); tx++)
    for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + lado) / 256); ty++)
      res.push({
        src: `https://tile.openstreetmap.org/${zoom}/${((tx % n) + n) % n}/${ty}.png`,
        left: Math.round(tx * 256 - x0),
        top: Math.round(ty * 256 - y0),
      });
  return res;
}
