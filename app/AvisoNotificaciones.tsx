"use client";

import type { Models } from "appwrite";
import { useEffect, useState } from "react";
import type { Textos } from "./i18n";
import { activarNotificaciones, estadoNotificaciones } from "./notificaciones";

// Una vez por persona y dispositivo: si ya dijo que sí o que no, no se vuelve a preguntar
const clave = (usuario: Models.User) => `towish-avisos-${usuario.$id}`;

function yaVisto(usuario: Models.User) {
  try {
    return localStorage.getItem(clave(usuario)) === "visto";
  } catch {
    return false;
  }
}

/**
 * Cartel para activar los avisos de mensajes, la primera vez que se entra en un dispositivo.
 * El permiso del navegador solo se pide al pulsar «Activar»: las webs que lo piden de golpe acaban
 * bloqueadas para siempre. `esperar`: mientras está el cartel de instalar, este no sale (nunca los dos).
 */
export default function AvisoNotificaciones({ t, usuario, esperar }: { t: Textos; usuario: Models.User; esperar: boolean }) {
  const [puede, setPuede] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (yaVisto(usuario)) return;
    let vivo = true;
    // Solo si este dispositivo puede recibir avisos y aún no los tiene (el iPhone sin instalar sale como "instalar")
    estadoNotificaciones(usuario).then((e) => vivo && setPuede(e === "desactivadas"));
    return () => {
      vivo = false;
    };
  }, [usuario]);

  function cerrar() {
    try {
      localStorage.setItem(clave(usuario), "visto");
    } catch {}
    setPuede(false);
  }

  async function activar() {
    setOcupado(true);
    try {
      await activarNotificaciones(usuario); // "activadas" o "bloqueadas": en ambos casos, no se insiste
      cerrar();
    } catch {
      setPuede(false); // sin red o suscripción fallida: ahora no, y se vuelve a ofrecer otro día
    } finally {
      setOcupado(false);
    }
  }

  if (!puede || esperar) return null;

  return (
    <aside className="instalar sobre-pestanas avisos" role="dialog" aria-labelledby="avisos-titulo">
      <svg className="icono-avisos" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Zm4 9.5a2 2 0 0 0 4 0" />
      </svg>
      <div className="instalar-texto">
        <strong id="avisos-titulo">{t.avisosTitulo}</strong>
        <span>{t.avisosTexto}</span>
      </div>
      <div className="instalar-botones">
        <button className="pildora" onClick={cerrar} disabled={ocupado}>
          {t.ahoraNo}
        </button>
        <button className="anadir" onClick={activar} disabled={ocupado}>
          {t.activarNotif}
        </button>
      </div>
    </aside>
  );
}
