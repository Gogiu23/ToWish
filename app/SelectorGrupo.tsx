"use client";

import { useEffect, useRef, useState } from "react";
import FormGrupo from "./FormGrupo";
import type { Grupo } from "./grupos";
import type { Textos } from "./i18n";

const ICONO_GRUPO =
  "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.3c1.8.9 3 2.9 3 5.7";

type Props = {
  grupos: Grupo[];
  grupo: Grupo;
  t: Textos;
  onGrupo: (id: string) => void;
  onGrupoNuevo: (id: string) => void;
};

/** La píldora con el nombre del grupo: al tocarla, un menú para cambiar de grupo o crear / unirse a otro. */
export default function SelectorGrupo({ grupos, grupo, t, onGrupo, onGrupoNuevo }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [nuevo, setNuevo] = useState(false); // formulario de crear / unirse a la vista
  const caja = useRef<HTMLDivElement>(null);

  function cerrar() {
    setAbierto(false);
    setNuevo(false);
  }

  // Se cierra al tocar fuera o con Esc
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) cerrar();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  return (
    <div className="selector-grupo" ref={caja}>
      <button
        className="badge badge-grupo"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`${grupo.nombre} · ${t.cambiarGrupo}`}
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={ICONO_GRUPO} />
        </svg>
        <span>{grupo.nombre}</span>
        <svg className="flecha" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {abierto && (
        <div className="menu-grupos" role="menu">
          {grupos.map((g) => (
            <button
              key={g.id}
              role="menuitemradio"
              aria-checked={g.id === grupo.id}
              className={g.id === grupo.id ? "actual" : ""}
              onClick={() => {
                onGrupo(g.id);
                cerrar();
              }}
            >
              <span className="menu-grupo-nombre">{g.nombre}</span>
              <small>{g.miembros.map((m) => m.nombre).join(", ")}</small>
              {g.id === grupo.id && (
                <span className="marca" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          ))}
          {nuevo ? (
            <FormGrupo
              t={t}
              onListo={(id) => {
                cerrar();
                onGrupoNuevo(id);
              }}
            />
          ) : (
            <button role="menuitem" className="menu-nuevo" onClick={() => setNuevo(true)}>
              + {t.otroGrupo}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
