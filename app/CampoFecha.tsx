"use client";

import { useState } from "react";
import { aFecha, aISO, celdasDelMes, hoyISO } from "./fechas";
import type { Textos } from "./i18n";

export const ICONO_CALENDARIO = "M7 3v3m10-3v3M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm-1 4h16";
const FLECHA_IZQ = "M15 5l-7 7 7 7";
const FLECHA_DER = "M9 5l7 7-7 7";

const sumarDias = (iso: string, n: number) => {
  const d = aFecha(iso)!;
  d.setDate(d.getDate() + n);
  return aISO(d);
};

/** El sábado de este fin de semana (si hoy ya es sábado o domingo, hoy). */
function finde(hoy: string) {
  const dia = aFecha(hoy)!.getDay(); // 0 domingo … 6 sábado
  return dia === 0 || dia === 6 ? hoy : sumarDias(hoy, 6 - dia);
}

type Props = { valor: string; onCambio: (v: string) => void; t: Textos; idioma?: string };

/**
 * Fecha en la que se quiere hacer el plan (opcional), con un selector propio: atajos (hoy, mañana, este finde)
 * y un mini calendario. `valor`: AAAA-MM-DD o "" si no hay fecha.
 */
export default function CampoFecha({ valor, onCambio, t, idioma = "es" }: Props) {
  const hoy = hoyISO();
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState(() => {
    const d = aFecha(valor || hoy)!;
    return { anio: d.getFullYear(), mes: d.getMonth() };
  });

  function abrir() {
    const d = aFecha(valor || hoy)!; // se abre en el mes de la fecha elegida (o en el actual)
    setMes({ anio: d.getFullYear(), mes: d.getMonth() });
    setAbierto(true);
  }

  function elegir(iso: string) {
    onCambio(iso);
    setAbierto(false);
  }

  const moverMes = (delta: number) =>
    setMes(({ anio, mes }) => {
      const d = new Date(anio, mes + delta, 1);
      return { anio: d.getFullYear(), mes: d.getMonth() };
    });

  // "sáb, 25 oct" (y el año solo si no es el actual)
  const larga = (iso: string) =>
    new Intl.DateTimeFormat(idioma, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: iso.slice(0, 4) === hoy.slice(0, 4) ? undefined : "numeric",
    }).format(aFecha(iso)!);
  const titulo = new Intl.DateTimeFormat(idioma, { month: "long", year: "numeric" }).format(new Date(mes.anio, mes.mes, 1));
  const diasSemana = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(idioma, { weekday: "narrow" }).format(new Date(2024, 0, 1 + i)), // 1-1-2024 fue lunes
  );
  const atajos = [
    { texto: t.hoy, iso: hoy },
    { texto: t.manana, iso: sumarDias(hoy, 1) },
    { texto: t.finde, iso: finde(hoy) },
  ];

  if (abierto)
    return (
      <div
        className="selector-fecha"
        role="dialog"
        aria-label={t.fecha}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation(); // cierra solo el selector, no el diálogo de editar
            e.preventDefault();
            setAbierto(false);
          }
        }}
      >
        <div className="sf-atajos">
          {atajos.map((a) => (
            <button type="button" key={a.texto} aria-pressed={valor === a.iso} onClick={() => elegir(a.iso)}>
              {a.texto}
            </button>
          ))}
        </div>

        <div className="sf-cabecera">
          <button type="button" className="sf-flecha" aria-label={t.mesAnterior} onClick={() => moverMes(-1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={FLECHA_IZQ} />
            </svg>
          </button>
          <strong aria-live="polite">{titulo}</strong>
          <button type="button" className="sf-flecha" aria-label={t.mesSiguiente} onClick={() => moverMes(1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={FLECHA_DER} />
            </svg>
          </button>
        </div>

        <div className="sf-semana" aria-hidden="true">
          {diasSemana.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        {/* key: al cambiar de mes la cuadrícula se vuelve a montar y entra con su animación */}
        <div className="sf-dias" key={`${mes.anio}-${mes.mes}`}>
          {celdasDelMes(mes.anio, mes.mes).map((c) => (
            <button
              type="button"
              key={c.iso}
              className={`sf-dia${c.delMes ? "" : " fuera"}${c.iso === hoy ? " hoy" : ""}${c.iso < hoy ? " pasado" : ""}`}
              aria-pressed={c.iso === valor}
              aria-label={larga(c.iso)}
              onClick={() => elegir(c.iso)}
            >
              {c.dia}
            </button>
          ))}
        </div>

        <div className="sf-pie">
          <button type="button" className="pildora" onClick={() => setAbierto(false)}>
            {t.cancelar}
          </button>
        </div>
      </div>
    );

  if (valor)
    return (
      <div className="fecha-elegida">
        <button type="button" className="fecha-elegida-texto" onClick={abrir} aria-label={`${t.fecha}: ${larga(valor)}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={ICONO_CALENDARIO} />
          </svg>
          <span>{valor === hoy ? t.hoy : larga(valor)}</span>
        </button>
        <button type="button" className="fecha-quitar" aria-label={t.quitarFecha} title={t.quitarFecha} onClick={() => onCambio("")}>
          ✕
        </button>
      </div>
    );

  return (
    <button type="button" className="poner-lugar" onClick={abrir}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="icono-fecha">
        <path d={ICONO_CALENDARIO} />
      </svg>
      {t.anadirFecha}
    </button>
  );
}
