"use client";

import { useEffect, useRef, useState } from "react";
import { account } from "./appwrite";
import type { Idioma, Textos } from "./i18n";
import { buscarLugares, PIN, sugerirLugares, type Lugar, type ResultadoLugar } from "./lugar";

type Props = {
  lugar: Lugar | null;
  onLugar: (l: Lugar | null) => void;
  cercaDe?: Lugar; // las sugerencias priorizan lo cercano a este sitio
  idioma: Idioma;
  t: Textos;
};

/** Elegir un lugar: sugerencias mientras escribes, búsqueda o link de Google Maps. Sirve para añadir y para editar. */
export default function SelectorLugar({ lugar, onLugar, cercaDe, idioma, t }: Props) {
  const [abierto, setAbierto] = useState(false); // buscador visible
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ResultadoLugar[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState("");
  const peticion = useRef(0); // número de la última búsqueda de sugerencias lanzada
  const enseñada = useRef(0); // y de la que se está enseñando

  function elegir(l: Lugar) {
    onLugar({ nombre: l.nombre.slice(0, 200), lat: l.lat, lng: l.lng });
    setResultados([]);
    setBusqueda("");
    setAviso("");
  }

  function quitar() {
    onLugar(null);
    setAbierto(false);
    setResultados([]);
    setBusqueda("");
    setAviso("");
  }

  // Sugerencias en tiempo real (como Google) a partir de 3 letras. Los links de Google Maps van por Enter.
  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 3 || /^https?:\/\//i.test(q)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- vaciar sugerencias al borrar el texto
      setResultados([]);
      return;
    }
    // Geoapify tarda 0,5-3 s: no se cancelan las peticiones al seguir escribiendo (así las sugerencias
    // se van actualizando por el camino); solo se descarta una respuesta más vieja que la ya enseñada
    const n = ++peticion.current;
    const espera = setTimeout(() => {
      sugerirLugares(q, idioma, cercaDe)
        .then((rs) => {
          if (n < enseñada.current) return;
          enseñada.current = n;
          setResultados(rs);
          setAviso(rs.length ? "" : t.sinResultados);
        })
        .catch(() => {}); // sin red: se queda lo anterior
    }, 150);
    return () => clearTimeout(espera);
  }, [busqueda, idioma, cercaDe?.lat, cercaDe?.lng, t.sinResultados]); // eslint-disable-line react-hooks/exhaustive-deps

  // Un link de Google Maps va al servidor (puede ser corto y hay que seguir la redirección); el resto se busca en OSM
  async function buscar() {
    const q = busqueda.trim();
    if (!q || buscando) return;
    setBuscando(true);
    setAviso("");
    setResultados([]);
    try {
      if (/^https?:\/\//i.test(q)) {
        const { jwt } = await account.createJWT(); // la ruta del servidor exige sesión
        const r = await fetch(`/api/lugar?url=${encodeURIComponent(q)}&idioma=${idioma}`, { headers: { "x-appwrite-jwt": jwt } });
        const d = await r.json();
        if (r.ok) elegir(d);
        else setAviso(d.error === "sin-resultados" ? t.sinResultados : t.linkNoValido);
      } else {
        const rs = await buscarLugares(q, idioma);
        if (rs.length) setResultados(rs);
        else setAviso(t.sinResultados);
      }
    } catch {
      setAviso(t.sinResultados);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <>
      {lugar ? (
        <div className="lugar-elegido">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={PIN} />
          </svg>
          <span>{lugar.nombre}</span>
          <button type="button" aria-label={t.quitarLugar} onClick={quitar}>
            ✕
          </button>
        </div>
      ) : abierto ? (
        <div className="buscador">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            // Enter: la primera sugerencia; si es un link de Google Maps (o aún no hay), se busca. No guarda el formulario
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (resultados[0] && !/^https?:\/\//i.test(busqueda.trim())) elegir(resultados[0]);
                else buscar();
              }
            }}
            placeholder={t.buscarLugar}
            aria-label={t.buscarLugar}
            autoComplete="off" // las sugerencias son las nuestras, no el historial del navegador
            autoFocus
          />
          <button type="button" className="pildora" onClick={buscar} disabled={buscando}>
            {buscando ? t.buscando : t.buscar}
          </button>
        </div>
      ) : (
        <button type="button" className="poner-lugar" onClick={() => setAbierto(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={PIN} />
          </svg>
          {t.anadirLugar}
        </button>
      )}

      {resultados.length > 0 && (
        <ul className="resultados">
          {resultados.map((r) => (
            <li key={`${r.lat},${r.lng},${r.nombre}`}>
              <button type="button" onClick={() => elegir(r)}>
                <strong>{r.nombre}</strong>
                <small>{r.detalle}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {aviso && (
        <p className="aviso" role="status">
          {aviso}
        </p>
      )}
    </>
  );
}
