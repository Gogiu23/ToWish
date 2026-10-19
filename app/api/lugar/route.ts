import type { NextRequest } from "next/server";
import { buscarLugares, esHostGoogle, leerLinkGoogle, nombreCercano } from "../../lugar";

const NOMINATIM: RequestInit = { headers: { "User-Agent": "ToWish/0.1 (lista de deseos personal)" } };
const conTiempo = () => ({ ...NOMINATIM, signal: AbortSignal.timeout(5000) });

// Los links cortos que comparte el móvil (maps.app.goo.gl/…) no llevan coordenadas: hay que seguir
// la redirección, y el navegador no puede por CORS. Solo seguimos saltos a hosts de Google.
export async function GET(req: NextRequest) {
  const idioma = req.nextUrl.searchParams.get("idioma") ?? "es";
  let actual: URL;
  try {
    actual = new URL(req.nextUrl.searchParams.get("url") ?? "");
  } catch {
    return Response.json({ error: "link" }, { status: 400 });
  }

  for (let saltos = 0; saltos < 6; saltos++) {
    if (actual.protocol !== "https:" || !esHostGoogle(actual.hostname))
      return Response.json({ error: "link" }, { status: 400 });

    // En la UE Google mete una página de cookies; el destino real va en ?continue=
    const sigue = actual.hostname.startsWith("consent.") && actual.searchParams.get("continue");
    if (sigue) {
      actual = new URL(sigue);
      continue;
    }

    const lugar = leerLinkGoogle(actual.href);
    if (lugar && Number.isFinite(lugar.lat)) {
      const coords = `${lugar.lat.toFixed(5)}, ${lugar.lng.toFixed(5)}`;
      const nombre = lugar.nombre || (await nombreCercano(lugar.lat, lugar.lng, idioma, conTiempo()).catch(() => "")) || coords;
      return Response.json({ ...lugar, nombre });
    }
    if (lugar) {
      // Solo trae nombre (?q=Coliseo): lo buscamos en OpenStreetMap
      const [primero] = await buscarLugares(lugar.nombre, idioma, conTiempo()).catch(() => []);
      return primero
        ? Response.json({ nombre: lugar.nombre, lat: primero.lat, lng: primero.lng })
        : Response.json({ error: "sin-resultados" }, { status: 422 });
    }

    const r = await fetch(actual, { redirect: "manual", signal: AbortSignal.timeout(5000) }).catch(() => null);
    const destino = r?.headers.get("location");
    if (!destino) break;
    actual = new URL(destino, actual);
  }
  return Response.json({ error: "link" }, { status: 422 });
}
