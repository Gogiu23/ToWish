"use client";

import { useState } from "react";
import { ICONO_CALENDARIO } from "./CampoFecha";
import { aFecha, celdasDelMes, fechaLarga, hoyISO } from "./fechas";
import type { Idioma, Textos } from "./i18n";

type PlanCalendario = { id: string; texto: string; hecho: boolean; fecha?: string; lugar?: { nombre: string } };

type Props = {
  planes: PlanCalendario[];
  idioma: Idioma;
  t: Textos;
  /** Asigna el plan a un día (AAAA-MM-DD) o le quita la fecha (null). */
  onFecha: (id: string, fecha: string | null) => Promise<void>;
};

const FLECHA_IZQ = "M15 5l-7 7 7 7";
const FLECHA_DER = "M9 5l7 7-7 7";
const MAX_PUNTOS = 3;

/** Calendario mensual con los planes que tienen fecha, y un panel del día elegido para asignar o quitar fechas. */
export default function Calendario({ planes, idioma, t, onFecha }: Props) {
  const hoy = hoyISO();
  const [mes, setMes] = useState(() => {
    const h = aFecha(hoy)!;
    return { anio: h.getFullYear(), mes: h.getMonth() };
  });
  const [elegido, setElegido] = useState(hoy);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null); // plan que se está guardando

  // Planes por día, y los que aún no tienen fecha
  const porDia = new Map<string, PlanCalendario[]>();
  const sinFecha: PlanCalendario[] = [];
  for (const p of planes) {
    if (p.fecha && aFecha(p.fecha)) porDia.set(p.fecha, [...(porDia.get(p.fecha) ?? []), p]);
    else sinFecha.push(p);
  }

  const moverMes = (delta: number) =>
    setMes(({ anio, mes }) => {
      const d = new Date(anio, mes + delta, 1);
      return { anio: d.getFullYear(), mes: d.getMonth() };
    });

  function irAHoy() {
    const h = aFecha(hoy)!;
    setMes({ anio: h.getFullYear(), mes: h.getMonth() });
    setElegido(hoy);
  }

  async function asignar(id: string, fecha: string | null) {
    setOcupado(id);
    setError("");
    try {
      await onFecha(id, fecha);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  const titulo = new Intl.DateTimeFormat(idioma, { month: "long", year: "numeric" }).format(new Date(mes.anio, mes.mes, 1));
  // 1 de enero de 2024 fue lunes: de ahí salen los nombres de los días, en el idioma de la persona
  const diasSemana = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(idioma, { weekday: "short" }).format(new Date(2024, 0, 1 + i)),
  );
  const delElegido = porDia.get(elegido) ?? [];

  return (
    <section className="calendario" aria-label={t.calendario}>
      <header className="calendario-cabecera">
        <button className="cal-flecha" aria-label={t.mesAnterior} onClick={() => moverMes(-1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={FLECHA_IZQ} />
          </svg>
        </button>
        <h2 aria-live="polite">{titulo}</h2>
        <button className="cal-flecha" aria-label={t.mesSiguiente} onClick={() => moverMes(1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={FLECHA_DER} />
          </svg>
        </button>
      </header>

      <div className="cal-semana" aria-hidden="true">
        {diasSemana.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      {/* key: al cambiar de mes la cuadrícula se vuelve a montar y entra con su animación */}
      <div className="cal-cuadricula" key={`${mes.anio}-${mes.mes}`}>
        {celdasDelMes(mes.anio, mes.mes).map((c) => {
          const delDia = porDia.get(c.iso) ?? [];
          return (
            <button
              key={c.iso}
              className={`cal-dia${c.delMes ? "" : " fuera"}${c.iso === hoy ? " hoy" : ""}${c.iso === elegido ? " elegido" : ""}`}
              aria-pressed={c.iso === elegido}
              aria-label={`${fechaLarga(c.iso, idioma)}${delDia.length ? ` · ${t.planesDelDia(delDia.length)}` : ""}`}
              onClick={() => setElegido(c.iso)}
            >
              <span className="cal-numero">{c.dia}</span>
              <span className="cal-puntos" aria-hidden="true">
                {delDia.slice(0, MAX_PUNTOS).map((p) => (
                  <i key={p.id} className={p.hecho ? "hecho" : "pendiente"} />
                ))}
                {delDia.length > MAX_PUNTOS && <b>+</b>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="cal-leyenda">
        <span aria-hidden="true">
          <i className="pendiente" /> {t.filtros.pendientes}
        </span>
        <span aria-hidden="true">
          <i className="hecho" /> {t.filtros.hechos}
        </span>
        <button className="cal-hoy" onClick={irAHoy}>
          {t.hoy}
        </button>
      </div>

      <section className="cal-dia-panel" aria-live="polite">
        <h3>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={ICONO_CALENDARIO} />
          </svg>
          {fechaLarga(elegido, idioma)}
        </h3>

        {delElegido.length === 0 ? (
          <p className="cal-vacio">{t.nadaEseDia}</p>
        ) : (
          <ul className="cal-lista">
            {delElegido.map((p) => (
              <li key={p.id} className={p.hecho ? "hecho" : ""}>
                <span className="cal-plan">
                  <strong>{p.texto}</strong>
                  {p.lugar && <small>{p.lugar.nombre}</small>}
                </span>
                <button
                  className="cal-quitar"
                  aria-label={t.quitarDelDia}
                  title={t.quitarDelDia}
                  disabled={ocupado === p.id}
                  onClick={() => asignar(p.id, null)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {sinFecha.length > 0 && (
          <details className="cal-sin-fecha">
            <summary>{t.sinFecha(sinFecha.length)}</summary>
            <ul className="cal-lista">
              {sinFecha.map((p) => (
                <li key={p.id} className={p.hecho ? "hecho" : ""}>
                  <span className="cal-plan">
                    <strong>{p.texto}</strong>
                    {p.lugar && <small>{p.lugar.nombre}</small>}
                  </span>
                  <button className="pildora cal-poner" disabled={ocupado === p.id} onClick={() => asignar(p.id, elegido)}>
                    {t.ponerEsteDia}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}

        {error && (
          <p className="aviso" role="alert">
            {error}
          </p>
        )}
      </section>
    </section>
  );
}
