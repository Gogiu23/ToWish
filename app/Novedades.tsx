"use client";

import { useRef } from "react";
import { cerrarConAnimacion } from "./dialogo";
import type { Textos } from "./i18n";

const ESTRELLA = "M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z";

/** Botón arriba a la derecha que abre un popup con las novedades (las más nuevas primero). */
export default function Novedades({ t, version }: { t: Textos; version: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cerrar = () => cerrarConAnimacion(ref.current);
  const lista = [...t.listaNovedades].reverse();

  return (
    <>
      <button className="abrir-novedades" aria-label={t.novedades} onClick={() => ref.current?.showModal()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={ESTRELLA} />
        </svg>
      </button>

      <dialog
        ref={ref}
        className="novedades-popup"
        aria-labelledby="novedades-titulo"
        onClick={(e) => e.target === ref.current && cerrar()} // clic en el fondo = cerrar
        onCancel={(e) => {
          e.preventDefault();
          cerrar();
        }}
      >
        <div className="novedades-cabecera">
          <h2 id="novedades-titulo">{t.novedades}</h2>
          <button className="cerrar" aria-label={t.cerrar} onClick={cerrar}>
            ✕
          </button>
        </div>
        <ul>
          {lista.map((n, i) => (
            <li key={n} style={{ "--i": i } as React.CSSProperties}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={ESTRELLA} />
              </svg>
              {n}
            </li>
          ))}
        </ul>
        <p className="version">
          {t.version} {version}
        </p>
      </dialog>
    </>
  );
}
