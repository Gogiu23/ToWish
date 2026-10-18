"use client";

import type { Models } from "appwrite";
import { useEffect, useRef, useState } from "react";
import pkg from "../package.json";
import { cerrarConAnimacion } from "./dialogo";
import { TEXTOS, type Idioma, type Textos } from "./i18n";
import {
  activarNotificaciones,
  desactivarNotificaciones,
  estadoNotificaciones,
  type EstadoNotificaciones,
} from "./notificaciones";

type Props = {
  t: Textos;
  idioma: Idioma;
  onIdioma: (i: Idioma) => void;
  usuario: Models.User | null;
  onSalir: () => void;
};

export default function Lateral({ t, idioma, onIdioma, usuario, onSalir }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  // Cierre animado: se desliza hacia fuera y, al acabar la animación, se cierra de verdad
  const cerrar = () => cerrarConAnimacion(ref.current);
  const [notif, setNotif] = useState<EstadoNotificaciones | null>(null);
  const [cambiando, setCambiando] = useState(false);

  useEffect(() => {
    if (usuario) estadoNotificaciones().then(setNotif);
  }, [usuario]);

  async function alternarNotificaciones() {
    if (!usuario) return;
    setCambiando(true);
    try {
      if (notif === "activadas") {
        await desactivarNotificaciones();
        setNotif("desactivadas");
      } else setNotif(await activarNotificaciones(usuario));
    } catch {
      setNotif(await estadoNotificaciones());
    } finally {
      setCambiando(false);
    }
  }

  const textoNotif: Record<EstadoNotificaciones, string> = {
    activadas: t.notifActivadas,
    desactivadas: t.notifDesactivadas,
    bloqueadas: t.notifBloqueadas,
    instalar: t.notifInstalar,
    "no-soportadas": t.notifNoSoportadas,
  };

  return (
    <>
      <button className="abrir-menu" aria-label={t.menu} onClick={() => ref.current?.showModal()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {/* Clic en el fondo oscuro (el propio <dialog>, no su contenido) = cerrar */}
      <dialog
        ref={ref}
        className="lateral"
        onClick={(e) => e.target === ref.current && cerrar()}
        // Esc: en vez de cerrarse de golpe, la misma animación
        onCancel={(e) => {
          e.preventDefault();
          cerrar();
        }}
      >
        <div className="lateral-cabecera">
          <span className="lateral-titulo">ToWish</span>
          <button className="cerrar" aria-label={t.cerrar} onClick={cerrar}>
            ✕
          </button>
        </div>

        {usuario && (
          <section>
            <h2>{t.ajustes}</h2>
            <p className="cuenta">
              <strong>{usuario.name}</strong>
              <br />
              {usuario.email}
            </p>
            <button
              className="pildora"
              onClick={() => {
                cerrar();
                onSalir();
              }}
            >
              {t.salir}
            </button>
          </section>
        )}

        {usuario && notif && (
          <section>
            <h2>{t.notificaciones}</h2>
            <p className="cuenta">{textoNotif[notif]}</p>
            {(notif === "activadas" || notif === "desactivadas") && (
              <button className="pildora" aria-pressed={notif === "activadas"} disabled={cambiando} onClick={alternarNotificaciones}>
                {notif === "activadas" ? t.desactivarNotif : t.activarNotif}
              </button>
            )}
          </section>
        )}

        <section>
          <h2>{t.idioma}</h2>
          <div className="opciones">
            {(Object.keys(TEXTOS) as Idioma[]).map((i) => (
              <button key={i} lang={i} aria-pressed={idioma === i} onClick={() => onIdioma(i)}>
                {TEXTOS[i].nombreIdioma}
              </button>
            ))}
          </div>
        </section>

        <section className="seccion-novedades">
          <h2>{t.novedades}</h2>
          <ul className="novedades">
            {t.listaNovedades.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>

        <p className="version">
          {t.version} {pkg.version}
        </p>
      </dialog>
    </>
  );
}
