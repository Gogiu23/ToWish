"use client";

import type { GlobeInstance } from "globe.gl";
import { useEffect, useRef, useState } from "react";
import type { Textos } from "./i18n";
import { urlRuta } from "./lugar";
import { pintarNube } from "./nubes";

export type LugarEnMundo = { id: string; texto: string; hecho: boolean; nombre: string; lat: number; lng: number };

const PIN = "M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z";
const BANDERA = "M6 22V3m0 1h12l-2.5 4.5L18 13H6";
// Altura de cámara al tocar un marcador (radios terrestres): unos 4 km, nivel de calle
const ALTURA_VUELO = 0.0006;
const DURACION_VUELO = 2200;
const ICONO_MAPS =
  "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"; // flecha "abrir fuera"
// Por debajo de esta altura de cámara (en radios terrestres) ya se distinguen ciudades: mapa; por encima, satélite
const ALTURA_MAPA = 0.35;
// Capas de nubes: posición (x, y), hacia dónde se desvían al pasar (dx, dy), cercanía (s: más de 1 =
// más cerca de la cámara) y retraso (r, ms). Centro denso, anillo intermedio y anillo exterior
const NUBES: { x: number; y: number; dx: number; dy: number; s: number; r: number }[] = [
  { x: 0, y: 0, dx: 0, dy: -10, s: 1.3, r: 0 },
  { x: -12, y: -8, dx: -60, dy: -40, s: 1.15, r: 20 },
  { x: 14, y: 10, dx: 60, dy: 45, s: 1.2, r: 35 },
  { x: -26, y: -20, dx: -95, dy: -70, s: 1, r: 60 },
  { x: 28, y: -16, dx: 100, dy: -60, s: 0.95, r: 30 },
  { x: -22, y: 24, dx: -90, dy: 85, s: 1.05, r: 90 },
  { x: 24, y: 26, dx: 95, dy: 90, s: 1.1, r: 45 },
  { x: 0, y: -32, dx: 10, dy: -110, s: 0.9, r: 70 },
  { x: 0, y: 34, dx: -10, dy: 110, s: 0.95, r: 55 },
  { x: -38, y: 0, dx: -120, dy: 5, s: 0.9, r: 80 },
  { x: 40, y: 4, dx: 120, dy: -5, s: 0.9, r: 65 },
  { x: -32, y: -34, dx: -100, dy: -110, s: 0.8, r: 110 },
  { x: 32, y: -34, dx: 105, dy: -105, s: 0.8, r: 100 },
  { x: -32, y: 36, dx: -105, dy: 110, s: 0.85, r: 120 },
  { x: 34, y: 36, dx: 105, dy: 110, s: 0.85, r: 95 },
  // Anillo exterior: tapa bordes y esquinas ahora que cubren toda la pantalla
  { x: -58, y: -10, dx: -140, dy: -20, s: 0.9, r: 130 },
  { x: 58, y: 12, dx: 140, dy: 20, s: 0.9, r: 115 },
  { x: -10, y: -58, dx: -20, dy: -140, s: 0.9, r: 125 },
  { x: 12, y: 58, dx: 20, dy: 140, s: 0.9, r: 105 },
  { x: -55, y: -55, dx: -130, dy: -130, s: 0.85, r: 140 },
  { x: 55, y: -55, dx: 130, dy: -130, s: 0.85, r: 135 },
  { x: -55, y: 55, dx: -130, dy: 130, s: 0.85, r: 150 },
  { x: 55, y: 55, dx: 130, dy: 130, s: 0.85, r: 145 },
];

// Tiempos de las fases de nubes (en ms): lo que tarda la más lenta en cubrir y en despejarse
// (las duraciones, 800 y 1100 ms, están en globals.css: "Caída a través de las nubes")
const COBERTURA_MS = 800 + Math.max(...NUBES.map((n) => n.r)) + 30;
const DESPEJE_MS = 1100 + Math.max(...NUBES.map((n) => n.r / 2)) + 50;

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Resuelve cuando dejan de llegar teselas nuevas de ese servidor (350 ms sin ninguna), con un
// mínimo de 500 ms (que dé tiempo a pedirlas) y un máximo de 3 s (si la red va lenta, no se queda tapado)
function teselasListas(servidor: string) {
  return new Promise<void>((resolver) => {
    const inicio = performance.now();
    let ultima = inicio;
    const obs = new PerformanceObserver((lista) => {
      if (lista.getEntries().some((e) => e.name.includes(servidor))) ultima = performance.now();
    });
    obs.observe({ type: "resource" });
    const mirar = setInterval(() => {
      const ahora = performance.now();
      if ((ahora - inicio > 500 && ahora - ultima > 350) || ahora - inicio > 3000) {
        clearInterval(mirar);
        obs.disconnect();
        resolver();
      }
    }, 100);
  });
}

const TESELA_MAPA = (x: number, y: number, nivel: number) => `https://tile.openstreetmap.org/${nivel}/${x}/${y}.png`;
const TESELA_SATELITE = (x: number, y: number, nivel: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${nivel}/${y}/${x}`;

// Pin (pendiente) o banderita (hecho). Al tocarlo: vuela hasta allí y abre un popup con el sitio,
// el plan y un enlace a Google Maps. Los textos van con textContent: nunca se interpretan como HTML.
function marcador(l: LugarEnMundo, t: Textos, alElegir: (l: LugarEnMundo, el: HTMLElement) => void) {
  const el = document.createElement("div");
  el.className = `marcador${l.hecho ? " hecho" : ""}`;
  el.innerHTML = `
    <button type="button" class="marcador-pin"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${l.hecho ? BANDERA : PIN}"/></svg></button>
    <div class="marcador-popup" role="dialog">
      <div class="marcador-popup-texto"><strong></strong><small></small></div>
      <a class="marcador-maps" target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONO_MAPS}"/></svg>
      </a>
    </div>`;
  const pin = el.querySelector("button")!;
  pin.setAttribute("aria-label", `${l.nombre} · ${l.texto} · ${l.hecho ? t.mundoHecho : t.mundoPendiente}`);
  el.querySelector("strong")!.textContent = l.nombre || l.texto;
  el.querySelector("small")!.textContent = l.nombre ? l.texto : "";
  const enlace = el.querySelector("a")!;
  enlace.href = urlRuta(l);
  enlace.setAttribute("aria-label", t.abrirEnMaps);
  enlace.title = t.abrirEnMaps;
  pin.addEventListener("click", (e) => {
    e.stopPropagation();
    alElegir(l, el);
  });
  el.querySelector(".marcador-popup")!.addEventListener("click", (e) => e.stopPropagation());
  return el;
}

/** Tarjeta con la Tierra en 3D: se gira arrastrando y se hace zoom; un marcador por cada plan con lugar. */
export default function Mundo({ lugares, t }: { lugares: LugarEnMundo[]; t: Textos }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const globo = useRef<GlobeInstance | null>(null);
  const nubes = useRef<HTMLDivElement>(null);
  const modoMapa = useRef(false);
  const transicion = useRef(0); // cada transición nueva invalida la anterior
  const elegir = useRef<(l: LugarEnMundo, el: HTMLElement) => void>(() => {});
  const volando = useRef(false); // vuelo de cámara en marcha (hacia un marcador o a la vista inicial)
  const volverAlInicio = useRef<() => void>(() => {});
  const [listo, setListo] = useState(false);
  const ultimos = useRef(lugares);
  const textos = useRef(t);
  useEffect(() => {
    ultimos.current = lugares;
    textos.current = t;
  });

  // Cada nube es distinta (ruido fractal con su semilla); se pintan una vez, cuando el navegador está libre
  useEffect(() => {
    const pintar = () => nubes.current?.querySelectorAll("canvas").forEach((c, i) => pintarNube(c, 7 + i * 31));
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(pintar);
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(pintar, 200);
    return () => clearTimeout(id);
  }, []);

  // Al acercar se atraviesan las nubes (vienen hacia ti y se abren); al alejar, lo contrario.
  // Tres fases: 1) las nubes cubren la pantalla; 2) tapado, se cambia el estilo y se espera a que
  // lleguen las teselas nuevas; 3) se despejan, y debajo ya está el mapa (o el satélite) completo.
  async function pasarNubes(acercando: boolean, cambiar: () => void) {
    const capa = nubes.current;
    if (!capa || matchMedia("(prefers-reduced-motion: reduce)").matches) return cambiar();
    const yo = ++transicion.current;
    const vigente = () => transicion.current === yo;
    const fase = (f: string) => {
      capa.dataset.fase = "";
      void capa.offsetWidth; // reinicia las animaciones aunque se repita la misma fase
      capa.dataset.sentido = acercando ? "acercando" : "alejando";
      capa.dataset.fase = f;
    };

    fase("cubrir");
    await esperar(COBERTURA_MS);
    if (!vigente()) return;
    const listas = teselasListas(acercando ? "tile.openstreetmap.org" : "arcgisonline.com");
    cambiar();
    await listas;
    if (!vigente()) return;
    fase("despejar");
    await esperar(DESPEJE_MS);
    if (vigente()) capa.dataset.fase = "";
  }

  // Solo se descarga y arranca three.js cuando la tarjeta está cerca de verse
  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    let cancelado = false;
    let redimensionar: ResizeObserver | undefined;
    const observador = new IntersectionObserver(
      async ([entrada]) => {
        if (!entrada.isIntersecting || globo.current) return;
        observador.disconnect();
        const { default: Globe } = await import("globe.gl");
        if (cancelado) return;
        const g = new Globe(el, { rendererConfig: { alpha: true, antialias: true } })
          // Mapa por teselas (como Google Maps): al acercar se descarga más detalle de esa zona.
          // De lejos (países, continentes) foto de satélite de Esri; de cerca, OpenStreetMap con ciudades
          // y nombres. Los dos sin clave, citándolos (ver pie).
          // ponytail: uso ligero según sus normas; si algún día hay mucho tráfico, un proveedor con clave (MapTiler, Stadia)
          .globeTileEngineUrl(TESELA_SATELITE)
          // Al cruzar la altura, cambia el estilo de todo el globo tapado por nubes que luego se apartan
          .onZoom(({ altitude }) => {
            // Durante un vuelo hacia un marcador la cámara también avisa de que se mueve; si se
            // reaccionara aquí, se cancelaría el vuelo a medias (el estilo ya lo gestiona el vuelo)
            if (volando.current) return;
            const mapa = altitude < ALTURA_MAPA;
            if (mapa === modoMapa.current) return;
            modoMapa.current = mapa;
            // Con las nubes tapando: nueva función de teselas, se vacía la caché (si no, las teselas que ya
            // estaban en pantalla seguirían en el estilo anterior) y se mueve la cámara una fracción
            // imperceptible, porque el globo solo vuelve a pedir teselas cuando la cámara se mueve
            pasarNubes(mapa, () => cambiarEstilo(mapa, true));
          })
          .globeTileEngineMaxLevel(19)
          .backgroundColor("rgba(0,0,0,0)")
          .atmosphereColor("#a2d2ff")
          .width(el.clientWidth)
          .height(el.clientHeight)
          .htmlLat("lat")
          .htmlLng("lng")
          .htmlAltitude(0) // a ras del suelo: con altura, al acercarse y mirar de lado el pin se desplazaba
          .htmlElement((d) => marcador(d as LugarEnMundo, textos.current, (l, m) => elegir.current(l, m)))
          .htmlElementsData(ultimos.current);
        // Color de fondo del globo mientras llegan las teselas de un zoom nuevo (por defecto, negro)
        (g.globeMaterial() as unknown as { color: { set: (c: string) => void } }).color.set("#d6e4ee");
        // Satélite ↔ mapa. "empujar": mover la cámara una fracción para que pida las teselas nuevas
        // (no hace falta durante un vuelo, que ya la está moviendo)
        function cambiarEstilo(mapa: boolean, empujar: boolean) {
          g.globeTileEngineUrl(mapa ? TESELA_MAPA : TESELA_SATELITE).globeTileEngineClearCache();
          if (empujar) empujarCamara();
        }
        function empujarCamara() {
          const pov = g.pointOfView();
          g.pointOfView({ ...pov, altitude: pov.altitude * 1.0001 });
        }
        // Al tocar un marcador: popup abierto (solo uno) y vuelo con zoom máximo hasta allí.
        // El vuelo no pasa por onZoom, así que si estaba en satélite se cambia a mapa aquí, con nubes.
        // Cambiar las teselas a mitad de vuelo lo detiene, así que las nubes empiezan de forma que
        // cubren justo cuando la cámara llega: entonces se cambia a mapa, se espera y se despeja.
        const girarSolo = !matchMedia("(prefers-reduced-motion: reduce)").matches;
        const volarA = (pov: { lat: number; lng: number; altitude: number }, mapa: boolean) => {
          g.controls().autoRotate = false;
          volando.current = true;
          setTimeout(() => {
            volando.current = false;
            empujarCamara(); // por si las teselas cambiaron justo cuando la cámara se paraba (se quedaría en negro)
            if (!mapa) g.controls().autoRotate = girarSolo; // en la vista lejana vuelve a girar solo
          }, DURACION_VUELO + 100);
          g.pointOfView(pov, DURACION_VUELO);
          if (modoMapa.current !== mapa) {
            modoMapa.current = mapa;
            setTimeout(() => pasarNubes(mapa, () => cambiarEstilo(mapa, !volando.current)), Math.max(0, DURACION_VUELO - COBERTURA_MS));
          }
        };
        const cerrarPopups = (salvo?: Element) =>
          el.querySelectorAll(".marcador.abierto").forEach((m) => m !== salvo && m.classList.remove("abierto"));
        elegir.current = (l, m) => {
          cerrarPopups(m);
          m.classList.add("abierto");
          volarA({ lat: l.lat, lng: l.lng, altitude: ALTURA_VUELO }, true);
        };
        // Tocar fuera de un marcador cierra el popup
        el.addEventListener("click", () => el.querySelectorAll(".marcador.abierto").forEach((m) => m.classList.remove("abierto")));
        const primero = ultimos.current[0];
        const inicio = { lat: primero?.lat ?? 40, lng: primero?.lng ?? 0, altitude: 2.2 };
        g.pointOfView(inicio);
        volverAlInicio.current = () => {
          cerrarPopups();
          volarA(inicio, false);
        };
        const controles = g.controls();
        controles.autoRotate = girarSolo;
        controles.autoRotateSpeed = 0.4;
        // globe.gl recalcula zoomSpeed en cada movimiento (√altura · 0,5); este manejador va después
        // del suyo y lo deja a la mitad, porque así cada gesto acercaba demasiado
        controles.addEventListener("change", () => (controles.zoomSpeed *= 0.5));
        controles.addEventListener("start", () => (controles.autoRotate = false)); // al tocarlo, deja de girar solo
        redimensionar = new ResizeObserver(() => g.width(el.clientWidth).height(el.clientHeight));
        redimensionar.observe(el);
        globo.current = g;
        setListo(true);
      },
      { rootMargin: "200px" },
    );
    observador.observe(el);
    return () => {
      cancelado = true;
      observador.disconnect();
      redimensionar?.disconnect();
      globo.current?._destructor();
      globo.current = null;
      el.innerHTML = "";
    };
  }, []);

  // Si cambian los planes (nuevo, hecho, borrado), se actualizan los marcadores
  const clave = lugares.map((l) => `${l.id}:${l.hecho ? 1 : 0}:${l.texto}`).join("|");
  useEffect(() => {
    globo.current?.htmlElementsData(ultimos.current);
  }, [clave, listo]);

  return (
    <>
      <section className="tarjeta-mundo" aria-label={t.mundo}>
        <header>
          <h2>{t.mundo}</h2>
          <span className="leyenda">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="leyenda-pin">
              <path d={PIN} />
            </svg>
            {t.mundoPendiente}
            <svg viewBox="0 0 24 24" aria-hidden="true" className="leyenda-bandera">
              <path d={BANDERA} />
            </svg>
            {t.mundoHecho}
          </span>
        </header>
        <div className="globo-marco">
          <div ref={contenedor} className="globo-3d" />
          <div ref={nubes} className="nubes" aria-hidden="true">
            <div className="bruma" />
            {NUBES.map((n, i) => (
              <canvas
                key={i}
                className="nube"
                style={
                  {
                    "--x": `${n.x}%`,
                    "--y": `${n.y}%`,
                    "--dx": `${n.dx}%`,
                    "--dy": `${n.dy}%`,
                    "--s": n.s,
                    "--r": `${n.r}ms`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        </div>
        {lugares.length === 0 && <p className="mundo-vacio">{t.mundoVacio}</p>}
        <p className="atribucion">
          Imagen ©{" "}
          <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">
            Esri
          </a>{" "}
          · ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            OpenStreetMap
          </a>
        </p>
      </section>

      {/* Panel bajo la tarjeta: volver volando a la vista inicial (todo el globo) */}
      <div className="panel-mundo">
        <button className="pildora" onClick={() => volverAlInicio.current()}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
          </svg>
          {t.vistaInicial}
        </button>
      </div>
    </>
  );
}
