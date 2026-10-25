"use client";

import { useEffect, useRef, useState } from "react";
import { cerrarConAnimacion } from "./dialogo";
import CampoCategoria from "./CampoCategoria";
import CampoFecha from "./CampoFecha";
import type { Categoria } from "./categorias";
import type { Idioma, Textos } from "./i18n";
import type { Lugar } from "./lugar";
import SelectorLugar from "./SelectorLugar";

type Plan = { id: string; texto: string; lugar?: Lugar; fecha?: string; categoria?: Categoria };

type Props = {
  plan: Plan | null; // null = cerrado
  cercaDe?: Lugar;
  idioma: Idioma;
  t: Textos;
  onGuardar: (id: string, texto: string, lugar: Lugar | null, fecha: string, categoria: Categoria | null) => Promise<void>;
  onCerrar: () => void;
};

/** Hoja para cambiar el texto de un plan y añadirle, cambiarle o quitarle el lugar. */
export default function EditarPlan({ plan, cercaDe, idioma, t, onGuardar, onCerrar }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [texto, setTexto] = useState("");
  const [lugar, setLugar] = useState<Lugar | null>(null);
  const [fecha, setFecha] = useState("");
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (plan && !d?.open) {
      setTexto(plan.texto);
      setLugar(plan.lugar ?? null);
      setFecha(plan.fecha ?? "");
      setCategoria(plan.categoria ?? null);
      setError("");
      d?.showModal();
    }
    if (!plan) cerrarConAnimacion(d);
  }, [plan]);

  const cerrar = () => cerrarConAnimacion(ref.current);
  const cambiado = !!plan && (texto.trim() !== plan.texto || lugar?.lat !== plan.lugar?.lat || lugar?.lng !== plan.lugar?.lng || fecha !== (plan.fecha ?? "") || categoria !== (plan.categoria ?? null));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const tx = texto.trim();
    if (!plan || !tx || !cambiado) return;
    setGuardando(true);
    setError("");
    try {
      await onGuardar(plan.id, tx, lugar, fecha, categoria);
      cerrar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="post editar"
      onClose={onCerrar}
      onClick={(e) => e.target === ref.current && cerrar()} // clic en el fondo oscuro = cerrar
      onCancel={(e) => {
        e.preventDefault();
        cerrar();
      }}
    >
      {plan && (
        <>
          <header className="post-cabecera">
            <h2 className="editar-titulo">{t.editarPlan}</h2>
            <button className="cerrar" aria-label={t.cerrar} onClick={cerrar}>
              ✕
            </button>
          </header>
          <form className="editar-form" onSubmit={guardar}>
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={t.placeholder}
              aria-label={t.nuevoPlan}
              maxLength={500}
              required
            />
            <SelectorLugar
              // Si se abre otro plan, el selector empieza de cero (buscador cerrado y sin restos)
              key={plan.id}
              lugar={lugar}
              onLugar={setLugar}
              cercaDe={cercaDe}
              idioma={idioma}
              t={t}
            />
            <CampoFecha valor={fecha} onCambio={setFecha} t={t} idioma={idioma} />
            <CampoCategoria valor={categoria} onCambio={setCategoria} t={t} />
            {error && (
              <p className="aviso" role="alert">
                {error}
              </p>
            )}
            <div className="botones-cuenta">
              <button type="button" className="pildora" onClick={cerrar} disabled={guardando}>
                {t.cancelar}
              </button>
              <button type="submit" className="anadir" disabled={!texto.trim() || !cambiado || guardando}>
                {t.guardar}
              </button>
            </div>
          </form>
        </>
      )}
    </dialog>
  );
}
