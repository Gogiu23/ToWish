"use client";

import { CATEGORIAS, type Categoria } from "./categorias";
import type { Textos } from "./i18n";

/** Fichas para elegir la categoría de un plan (opcional: tocar la elegida la quita). */
export default function CampoCategoria({
  valor,
  onCambio,
  t,
}: {
  valor: Categoria | null;
  onCambio: (c: Categoria | null) => void;
  t: Textos;
}) {
  return (
    <div className="campo-categoria" role="radiogroup" aria-label={t.categoria}>
      {CATEGORIAS.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={valor === c.id}
          onClick={() => onCambio(valor === c.id ? null : c.id)}
        >
          <span aria-hidden="true">{c.emoji}</span>
          {t.categorias[c.id]}
        </button>
      ))}
    </div>
  );
}
