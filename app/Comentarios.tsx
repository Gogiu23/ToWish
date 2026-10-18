"use client";

import { Channel, ID, Models, Permission, Query, RealtimeResponseEvent, Role } from "appwrite";
import { useEffect, useRef, useState } from "react";
import { BD, db, realtime } from "./appwrite";
import { cerrarConAnimacion } from "./dialogo";
import type { Idioma, Textos } from "./i18n";

export type Comentario = { id: string; planId: string; texto: string; autor: string; autorId: string; creado: string };

const C = { databaseId: BD, tableId: "comentarios" };

const aComentario = (r: Models.DefaultRow): Comentario => ({
  id: r.$id,
  planId: r.planId,
  texto: r.texto,
  autor: r.autor,
  autorId: r.autorId,
  creado: r.$createdAt,
});

const upsert = (cs: Comentario[], c: Comentario) =>
  cs.some((x) => x.id === c.id) ? cs.map((x) => (x.id === c.id ? c : x)) : [...cs, c];

/**
 * Todos los comentarios, al día por Realtime, para poder enseñar el contador en cada tarjeta.
 * ponytail: carga hasta 1000 de golpe; con muchos más, pedir solo los del plan abierto y contar en servidor
 */
export function useComentarios(activo: boolean) {
  const [comentarios, setComentarios] = useState<Comentario[]>([]);

  useEffect(() => {
    if (!activo) return;
    const cargar = () =>
      db
        .listRows({ ...C, queries: [Query.orderAsc("$createdAt"), Query.limit(1000)] })
        .then((r) => setComentarios(r.rows.map(aComentario)))
        .catch(() => {});
    cargar();
    const sub = realtime.subscribe(
      Channel.tablesdb(BD).table(C.tableId).row(),
      (ev: RealtimeResponseEvent<Models.DefaultRow>) => {
        const c = aComentario(ev.payload);
        if (ev.events.some((e) => e.endsWith(".delete"))) setComentarios((cs) => cs.filter((x) => x.id !== c.id));
        else setComentarios((cs) => upsert(cs, c));
      },
    );
    window.addEventListener("focus", cargar);
    return () => {
      window.removeEventListener("focus", cargar);
      sub.then((s) => s.unsubscribe());
    };
  }, [activo]);

  const anadir = (c: Comentario) => setComentarios((cs) => upsert(cs, c));
  return { comentarios, anadir };
}

type Props = {
  plan: { id: string; texto: string } | null; // null = cerrado
  comentarios: Comentario[]; // solo los de este plan
  usuario: Models.User;
  t: Textos;
  idioma: Idioma;
  onAnadido: (c: Comentario) => void;
  onCerrar: () => void;
};

// El "post" abierto: el plan arriba, sus comentarios y una caja para escribir. <dialog> nativo: Esc y foco gratis
export default function Comentarios({ plan, comentarios, usuario, t, idioma, onAnadido, onCerrar }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (plan && !d?.open) d?.showModal();
    if (!plan) cerrarConAnimacion(d);
  }, [plan]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const tx = texto.trim();
    if (!tx || !plan) return;
    setTexto("");
    setError("");
    try {
      const r = await db.createRow({
        ...C,
        rowId: ID.unique(),
        data: { planId: plan.id, texto: tx, autor: usuario.name, autorId: usuario.$id },
        // Leer: todos (permiso de la tabla). Editar y borrar: solo quien lo escribió
        permissions: [Permission.update(Role.user(usuario.$id)), Permission.delete(Role.user(usuario.$id))],
      });
      onAnadido(aComentario(r));
    } catch (err) {
      setTexto(tx); // que no se pierda lo escrito
      setError((err as Error).message);
    }
  }

  const fecha = (iso: string) =>
    new Intl.DateTimeFormat(idioma, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

  return (
    <dialog
      ref={ref}
      className="post"
      onClose={onCerrar}
      // Clic en el fondo oscuro (el propio <dialog>, no su contenido) = cerrar
      onClick={(e) => e.target === ref.current && cerrarConAnimacion(ref.current)}
      // Esc: en vez de cerrarse de golpe, la misma animación
      onCancel={(e) => {
        e.preventDefault();
        cerrarConAnimacion(ref.current);
      }}
    >
      {plan && (
        <>
          <header className="post-cabecera">
            <p className="post-plan">{plan.texto}</p>
            <button className="cerrar" aria-label={t.cerrar} onClick={() => cerrarConAnimacion(ref.current)}>
              ✕
            </button>
          </header>

          <h2>{t.comentarios}</h2>
          {comentarios.length === 0 ? (
            <p className="vacio">{t.sinComentarios}</p>
          ) : (
            <ul className="lista-comentarios">
              {comentarios.map((c) => (
                <li key={c.id} className={c.autorId === usuario.$id ? "mio" : "suyo"}>
                  <small>
                    <strong>{c.autor}</strong> · <time dateTime={c.creado}>{fecha(c.creado)}</time>
                  </small>
                  <p>{c.texto}</p>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="vacio">{error}</p>}

          <form className="escribir-comentario" onSubmit={enviar}>
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={t.escribeComentario}
              aria-label={t.escribeComentario}
              maxLength={1000}
              enterKeyHint="send"
            />
            <button className="anadir" type="submit" disabled={!texto.trim()}>
              {t.enviar}
            </button>
          </form>
        </>
      )}
    </dialog>
  );
}
