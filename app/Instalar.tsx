"use client";

import { useEffect, useState } from "react";
import type { Textos } from "./i18n";

// Chrome/Edge: evento propio para instalar la PWA (no está en los tipos de TypeScript)
type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// beforeinstallprompt puede llegar antes de que React monte: lo guardamos desde que se carga el módulo
let eventoGuardado: EventoInstalar | null = null;
const avisar = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // sin esto Chrome enseña su propia barra; usamos la nuestra
    eventoGuardado = e as EventoInstalar;
    avisar.forEach((f) => f());
  });
}

const CLAVE = "towish-instalar"; // "visto": ya se enseñó una vez en este dispositivo

type Modo = "boton" | "iphone" | "mac" | null;

function yaVisto() {
  try {
    return localStorage.getItem(CLAVE) === "visto";
  } catch {
    return false;
  }
}

function instalada() {
  return matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

// Safari no tiene beforeinstallprompt: en iPhone y en Mac solo podemos explicar cómo se hace
function modoSafari(): Modo {
  const ua = navigator.userAgent;
  const esSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|Edg\//.test(ua);
  if (/iPhone|iPad|iPod/.test(ua)) return esSafari ? "iphone" : null;
  if (/Macintosh/.test(ua) && esSafari) return navigator.maxTouchPoints > 0 ? "iphone" : "mac"; // iPad se presenta como Mac
  return null;
}

/** La primera vez que se entra, propone instalar ToWish como app (escritorio o pantalla de inicio). */
export default function Instalar({ t, conPestanas, onMostrado }: { t: Textos; conPestanas: boolean; onMostrado?: (v: boolean) => void }) {
  const [modo, setModo] = useState<Modo>(null);

  // Avisa de si el cartel está a la vista (otros carteles esperan a que se vaya)
  useEffect(() => onMostrado?.(!!modo), [modo, onMostrado]);

  useEffect(() => {
    if (yaVisto() || instalada()) return;
    const conBoton = () => setModo("boton");
    if (eventoGuardado) conBoton();
    else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- navigator solo existe tras montar
      setModo(modoSafari());
      avisar.add(conBoton);
    }
    const alInstalar = () => cerrar();
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      avisar.delete(conBoton);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  function cerrar() {
    try {
      localStorage.setItem(CLAVE, "visto");
    } catch {}
    setModo(null);
  }

  async function instalar() {
    if (!eventoGuardado) return cerrar();
    await eventoGuardado.prompt();
    await eventoGuardado.userChoice.catch(() => {});
    eventoGuardado = null; // solo se puede usar una vez
    cerrar();
  }

  if (!modo) return null;

  return (
    <aside className={`instalar${conPestanas ? " sobre-pestanas" : ""}`} role="dialog" aria-labelledby="instalar-titulo">
      {/* eslint-disable-next-line @next/next/no-img-element -- icono pequeño y local; next/image no aporta nada aquí */}
      <img src="/web-app-manifest-192x192.png" alt="" width={48} height={48} />
      <div className="instalar-texto">
        <strong id="instalar-titulo">{t.instalarTitulo}</strong>
        <span>{modo === "iphone" ? t.instalarIphone : modo === "mac" ? t.instalarMac : t.instalarTexto}</span>
      </div>
      <div className="instalar-botones">
        {modo === "boton" ? (
          <>
            <button className="pildora" onClick={cerrar}>
              {t.ahoraNo}
            </button>
            <button className="anadir" onClick={instalar}>
              {t.instalar}
            </button>
          </>
        ) : (
          <button className="anadir" onClick={cerrar}>
            {t.entendido}
          </button>
        )}
      </div>
    </aside>
  );
}
