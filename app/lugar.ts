export type Lugar = { nombre: string; lat: number; lng: number };
export type ResultadoLugar = Lugar & { detalle: string };

export const PIN = "M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z";

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

type RasgoPhoton = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    state?: string;
    country?: string;
  };
};

type ResultadoGeoapify = {
  lat: number;
  lon: number;
  name?: string;
  address_line1?: string;
  address_line2?: string;
};

// Clave pública de Geoapify (va en el navegador; en Geoapify está limitada a nuestro dominio).
// Se pone como variable de entorno en Netlify y en .env.local; sin ella se usa Photon.
const CLAVE_GEOAPIFY = process.env.NEXT_PUBLIC_GEOAPIFY_KEY;

/**
 * Sugerencias mientras se escribe: calles con número, comercios, monumentos, ciudades…
 * Con clave, Geoapify (buena calidad de direcciones, en el idioma de la app); sin ella, Photon.
 * "cerca": da prioridad a lo que está cerca de ese punto.
 */
// Búsquedas ya hechas: al borrar una letra (o repetir) las sugerencias salen al momento
const yaSugeridos = new Map<string, ResultadoLugar[]>();

export async function sugerirLugares(
  q: string,
  idioma: string,
  cerca?: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<ResultadoLugar[]> {
  const clave = `${idioma}|${cerca?.lat},${cerca?.lng}|${q.toLowerCase()}`;
  const guardado = yaSugeridos.get(clave);
  if (guardado) return guardado;
  const rs = await (CLAVE_GEOAPIFY ? sugerirConGeoapify(q, idioma, cerca, signal) : sugerirConPhoton(q, cerca, signal));
  yaSugeridos.set(clave, rs);
  return rs;
}

async function sugerirConGeoapify(q: string, idioma: string, cerca?: { lat: number; lng: number }, signal?: AbortSignal) {
  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.search = new URLSearchParams({ text: q, apiKey: CLAVE_GEOAPIFY!, lang: idioma, limit: "6", format: "json" }).toString();
  if (cerca) url.searchParams.set("bias", `proximity:${cerca.lng},${cerca.lat}`);
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Geoapify ${r.status}`);
  const { results = [] }: { results?: ResultadoGeoapify[] } = await r.json();
  // address_line1: "Calle de Alcalá, 50" o el nombre del sitio; address_line2: "28014 Madrid, España"
  return results
    .map((d) => ({ nombre: d.address_line1 || d.name || "", detalle: d.address_line2 ?? "", lat: d.lat, lng: d.lon }))
    .filter((d) => d.nombre && valido(d.lat, d.lng));
}

// Photon (Komoot, datos de OpenStreetMap): sin clave y pensado para autocompletar, pero con
// direcciones con número de calidad irregular. Se usa si no hay clave de Geoapify.
async function sugerirConPhoton(q: string, cerca?: { lat: number; lng: number }, signal?: AbortSignal) {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "6");
  url.searchParams.set("lang", "default"); // nombres locales (sin esto, Photon los da en inglés)
  if (cerca) {
    url.searchParams.set("lat", String(cerca.lat));
    url.searchParams.set("lon", String(cerca.lng));
  }
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Photon ${r.status}`);
  const { features }: { features: RasgoPhoton[] } = await r.json();
  const vistos = new Set<string>();
  return features.flatMap((f): ResultadoLugar[] => {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    const calle = [p.street, p.housenumber].filter(Boolean).join(" ");
    const nombre = p.name || calle || p.city || "";
    const detalle = [p.name ? calle : "", [p.postcode, p.city].filter(Boolean).join(" "), p.country]
      .filter((x) => x && x !== nombre)
      .join(", ");
    const clave = `${nombre}|${detalle}`;
    if (!nombre || !valido(lat, lng) || vistos.has(clave)) return []; // Photon a veces repite el mismo sitio
    vistos.add(clave);
    return [{ nombre, detalle, lat, lng }];
  });
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
