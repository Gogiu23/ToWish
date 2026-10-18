"use client";

import { useRef, useState } from "react";

const UMBRAL_DERECHA = 0.35; // fracción del ancho para borrar (sale volando)
const UMBRAL_IZQUIERDA = 60; // px para responder (vuelve a su sitio)
const TOPE_IZQUIERDA = 110; // no se arrastra más allá: es solo un gesto

type Accion = { etiqueta: string; accion: () => void };

type Props = {
  className: string;
  claseFila?: string;
  derecha?: Accion; // deslizar a la derecha (borrar)
  izquierda?: Accion; // deslizar a la izquierda (responder)
  children: React.ReactNode;
};

/**
 * Elemento que se desliza con el dedo o el ratón. El scroll vertical sigue siendo del navegador
 * (touch-action: pan-y); solo un gesto claramente horizontal, y en una dirección con acción, lo mueve.
 * Con teclado: Supr = derecha, R = izquierda.
 */
export default function Deslizable({ className, claseFila = "", derecha, izquierda, children }: Props) {
  const elemento = useRef<HTMLDivElement>(null);
  const gesto = useRef<{ x: number; y: number; direccion: "derecha" | "izquierda" | null } | null>(null);
  const [dx, setDx] = useState(0);
  // El estado puede ir un render por detrás si el dedo se suelta muy rápido; la ref, nunca
  const dxActual = useRef(0);
  const [arrastrando, setArrastrando] = useState(false);
  const mover = (x: number) => {
    dxActual.current = x;
    setDx(x);
  };

  function soltar() {
    const ancho = elemento.current?.offsetWidth ?? 1;
    const d = gesto.current?.direccion;
    if (d === "derecha" && derecha && dxActual.current > ancho * UMBRAL_DERECHA) {
      mover(ancho + 40); // sale por la derecha y luego se borra
      setTimeout(derecha.accion, 200);
    } else {
      if (d === "izquierda" && izquierda && dxActual.current < -UMBRAL_IZQUIERDA) izquierda.accion();
      mover(0);
    }
    gesto.current = null;
    setArrastrando(false);
  }

  return (
    <li className={`deslizable ${claseFila}`}>
      {derecha && (
        <div className="fondo-accion fondo-borrar" aria-hidden="true" style={{ opacity: Math.min(1, Math.max(0, dx) / 60) }}>
          {derecha.etiqueta}
        </div>
      )}
      {izquierda && (
        <div className="fondo-accion fondo-responder" aria-hidden="true" style={{ opacity: Math.min(1, Math.max(0, -dx) / 50) }}>
          {izquierda.etiqueta}
        </div>
      )}
      <div
        ref={elemento}
        className={`${className}${arrastrando ? " arrastrando" : ""}`}
        tabIndex={0}
        aria-keyshortcuts={[derecha && "Delete", izquierda && "R"].filter(Boolean).join(" ") || undefined}
        style={{ transform: `translateX(${dx}px)`, transition: arrastrando ? "none" : undefined }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (derecha && (e.key === "Delete" || e.key === "Backspace")) derecha.accion();
          if (izquierda && e.key.toLowerCase() === "r") izquierda.accion();
        }}
        onPointerDown={(e) => {
          // Empezar sobre un checkbox, enlace o botón no arrastra: deja que hagan su clic
          if (e.button !== 0 || (e.target as HTMLElement).closest("input, a, button")) return;
          gesto.current = { x: e.clientX, y: e.clientY, direccion: null };
        }}
        onPointerMove={(e) => {
          const g = gesto.current;
          if (!g) return;
          const mx = e.clientX - g.x;
          const my = e.clientY - g.y;
          if (g.direccion === null && Math.hypot(mx, my) > 8) {
            const horizontal = Math.abs(mx) > Math.abs(my);
            const direccion = mx > 0 ? "derecha" : "izquierda";
            const tieneAccion = direccion === "derecha" ? derecha : izquierda;
            if (!horizontal || !tieneAccion) return void (gesto.current = null); // era scroll o sin acción
            g.direccion = direccion;
            e.currentTarget.setPointerCapture(e.pointerId);
            setArrastrando(true);
          }
          if (g.direccion === "derecha") mover(Math.max(0, mx));
          if (g.direccion === "izquierda") mover(Math.max(-TOPE_IZQUIERDA, Math.min(0, mx)));
        }}
        onPointerUp={soltar}
        onPointerCancel={() => {
          gesto.current = null;
          setArrastrando(false);
          mover(0);
        }}
      >
        {children}
      </div>
    </li>
  );
}
