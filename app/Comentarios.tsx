"use client";

import { Channel, ID, Models, Permission, Query, RealtimeResponseEvent, Role } from "appwrite";
import { useEffect, useRef, useState } from "react";
import { BD, db, realtime } from "./appwrite";
import { useBorradoDiferido } from "./borrado";
import { cerrarConAnimacion } from "./dialogo";
import type { Idioma, Textos } from "./i18n";

export type Comentario = {
  id: string;
  planId: string;
  texto: string;
  autor: string;
  autorId: string;
  creado: string;
  editado: boolean;
};
// Un "me gusta" de una persona a un comentario (una fila por reacción: solo su dueña puede quitarla)
export type Reaccion = { id: string; comentarioId: string; userId: string };

const C = { databaseId: BD, tableId: "comentarios" };
const R = { databaseId: BD, tableId: "reacciones" };

const aComentario = (r: Models.DefaultRow): Comentario => ({
  id: r.$id,
  planId: r.planId,
  texto: r.texto,
  autor: r.autor,
  autorId: r.autorId,
  creado: r.$createdAt,
  editado: r.$updatedAt !== r.$createdAt, // la fila solo se actualiza al editar el texto
});

const aReaccion = (r: Models.DefaultRow): Reaccion => ({ id: r.$id, comentarioId: r.comentarioId, userId: r.userId });

const ordenar = (cs: Comentario[]) => [...cs].sort((a, b) => a.creado.localeCompare(b.creado));
const upsert = <T extends { id: string }>(xs: T[], x: T) =>
  xs.some((y) => y.id === x.id) ? xs.map((y) => (y.id === x.id ? x : y)) : [...xs, x];

/**
 * Comentarios y reacciones del grupo, al día por Realtime (para enseñar los contadores en cada tarjeta),
 * con las acciones: añadir, editar, borrar (con deshacer) y dar o quitar "me gusta".
 * ponytail: carga hasta 1000 comentarios de golpe; con muchos más, pedir solo los del plan abierto
 */
export function useComentarios(grupo: string | null) {
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [reacciones, setReacciones] = useState<Reaccion[]>([]);
  const [error, setError] = useState("");
  // Borrado diferido: el comentario desaparece ya, pero solo se borra si no se deshace en 5 s
  const borrado = useBorradoDiferido<Comentario>({
    borrar: (c) => db.deleteRow({ ...C, rowId: c.id }),
    restaurar: (c) => setComentarios((cs) => ordenar(upsert(cs, c))),
    onError: (e) => setError(e.message),
  });
  const { esPendiente } = borrado;

  useEffect(() => {
    if (!grupo) return;
    const cargar = () => {
      db.listRows({ ...C, queries: [Query.equal("grupo", grupo), Query.orderAsc("$createdAt"), Query.limit(1000)] })
        .then((r) => setComentarios(r.rows.map(aComentario).filter((c) => !esPendiente(c.id))))
        .catch(() => {});
      db.listRows({ ...R, queries: [Query.equal("grupo", grupo), Query.limit(5000)] })
        .then((r) => setReacciones(r.rows.map(aReaccion)))
        .catch(() => {});
    };
    cargar();
    const subComentarios = realtime.subscribe(
      Channel.tablesdb(BD).table(C.tableId).row(),
      (ev: RealtimeResponseEvent<Models.DefaultRow>) => {
        if (ev.payload.grupo !== grupo) return; // de otro de tus grupos
        const c = aComentario(ev.payload);
        if (ev.events.some((e) => e.endsWith(".delete"))) setComentarios((cs) => cs.filter((x) => x.id !== c.id));
        else if (!esPendiente(c.id)) setComentarios((cs) => upsert(cs, c));
      },
    );
    const subReacciones = realtime.subscribe(
      Channel.tablesdb(BD).table(R.tableId).row(),
      (ev: RealtimeResponseEvent<Models.DefaultRow>) => {
        if (ev.payload.grupo !== grupo) return;
        const r = aReaccion(ev.payload);
        if (ev.events.some((e) => e.endsWith(".delete"))) setReacciones((rs) => rs.filter((x) => x.id !== r.id));
        else setReacciones((rs) => upsert(rs, r));
      },
    );
    window.addEventListener("focus", cargar);
    return () => {
      window.removeEventListener("focus", cargar);
      subComentarios.then((s) => s.unsubscribe());
      subReacciones.then((s) => s.unsubscribe());
    };
  }, [grupo, esPendiente]);

  const anadir = (c: Comentario) => setComentarios((cs) => upsert(cs, c));

  /** Cambia el texto (solo su autor: lo garantizan los permisos de la fila). */
  async function editar(c: Comentario, texto: string) {
    const r = await db.updateRow({ ...C, rowId: c.id, data: { texto } });
    setComentarios((cs) => upsert(cs, aComentario(r)));
  }

  function borrar(c: Comentario) {
    setComentarios((cs) => cs.filter((x) => x.id !== c.id));
    borrado.programar(c);
  }

  /** Da o quita tu "me gusta". Se ve al momento; si Appwrite lo rechaza, vuelve como estaba. */
  async function reaccionar(comentarioId: string, userId: string) {
    if (!grupo) return;
    const mia = reacciones.find((r) => r.comentarioId === comentarioId && r.userId === userId);
    if (mia) {
      if (mia.id.startsWith("tmp-")) return; // todavía guardándose
      setReacciones((rs) => rs.filter((r) => r.id !== mia.id));
      try {
        await db.deleteRow({ ...R, rowId: mia.id });
      } catch (e) {
        setReacciones((rs) => upsert(rs, mia));
        setError((e as Error).message);
      }
      return;
    }
    const temporal: Reaccion = { id: `tmp-${ID.unique()}`, comentarioId, userId };
    setReacciones((rs) => [...rs, temporal]);
    try {
      const r = await db.createRow({
        ...R,
        rowId: ID.unique(),
        data: { comentarioId, userId, grupo },
        // Leer: los del grupo. Quitarla: solo quien la dio
        permissions: [Permission.read(Role.team(grupo)), Permission.delete(Role.user(userId))],
      });
      setReacciones((rs) => upsert(rs.filter((x) => x.id !== temporal.id), aReaccion(r)));
    } catch (e) {
      setReacciones((rs) => rs.filter((x) => x.id !== temporal.id));
      // 409: ya habías dado "me gusta" desde otro dispositivo; no es un error que enseñar
      if ((e as { code?: number }).code !== 409) setError((e as Error).message);
    }
  }

  return {
    comentarios,
    reacciones,
    error,
    anadir,
    editar,
    borrar,
    reaccionar,
    avisoBorrado: borrado.aviso,
    deshacer: borrado.deshacer,
  };
}

export type DatosComentarios = ReturnType<typeof useComentarios>;

type Props = {
  plan: { id: string; texto: string } | null; // null = cerrado
  datos: DatosComentarios; // todos los del grupo: aquí se filtran los de este plan
  usuario: Models.User;
  grupo: string;
  t: Textos;
  idioma: Idioma;
  onCerrar: () => void;
};

const ICONO_EDITAR = "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Zm9.5-13.5 4 4";
const ICONO_BORRAR = "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3";
const ICONO_CORAZON =
  "M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.1 3.6 4.5 7.1 4.5c2 0 3.5 1.1 4.9 2.9 1.4-1.8 2.9-2.9 4.9-2.9 3.5 0 5.6 3.6 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2Z";

// El "post" abierto: el plan arriba, sus comentarios y una caja para escribir. <dialog> nativo: Esc y foco gratis
export default function Comentarios({ plan, datos, usuario, grupo, t, idioma, onCerrar }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  // Edición de un comentario propio: cuál y con qué texto
  const [editando, setEditando] = useState<string | null>(null);
  const [textoEdicion, setTextoEdicion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const comentarios = plan ? datos.comentarios.filter((c) => c.planId === plan.id) : [];

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
        data: { planId: plan.id, texto: tx, autor: usuario.name, autorId: usuario.$id, grupo },
        // Leer: los del grupo. Editar y borrar: solo quien lo escribió
        permissions: [
          Permission.read(Role.team(grupo)),
          Permission.update(Role.user(usuario.$id)),
          Permission.delete(Role.user(usuario.$id)),
        ],
      });
      datos.anadir(aComentario(r));
    } catch (err) {
      setTexto(tx); // que no se pierda lo escrito
      setError((err as Error).message);
    }
  }

  function empezarEdicion(c: Comentario) {
    setEditando(c.id);
    setTextoEdicion(c.texto);
    setError("");
  }

  async function guardarEdicion(e: React.FormEvent, c: Comentario) {
    e.preventDefault();
    const tx = textoEdicion.trim();
    if (!tx || tx === c.texto) return setEditando(null); // sin cambios: es como cancelar
    setGuardando(true);
    try {
      await datos.editar(c, tx);
      setEditando(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
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
      // Esc: si se está editando un comentario, solo cancela la edición; si no, cierra con la misma animación
      onCancel={(e) => {
        e.preventDefault();
        if (editando) setEditando(null);
        else cerrarConAnimacion(ref.current);
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
              {comentarios.map((c) => {
                const mio = c.autorId === usuario.$id;
                // Una persona = un "me gusta" (si llegara duplicado por Realtime + respuesta, no cuenta doble)
                const quienes = new Set(datos.reacciones.filter((r) => r.comentarioId === c.id).map((r) => r.userId));
                const meGusta = quienes.has(usuario.$id);
                return (
                  <li key={c.id} className={mio ? "mio" : "suyo"}>
                    <small>
                      <strong>{c.autor}</strong> · <time dateTime={c.creado}>{fecha(c.creado)}</time>
                      {c.editado && ` · ${t.editado}`}
                    </small>
                    {editando === c.id ? (
                      <form className="editar-comentario" onSubmit={(e) => guardarEdicion(e, c)}>
                        <input
                          type="text"
                          value={textoEdicion}
                          onChange={(e) => setTextoEdicion(e.target.value)}
                          aria-label={t.editarComentario}
                          maxLength={1000}
                          autoFocus
                        />
                        <div className="botones-cuenta">
                          <button type="button" className="pildora" onClick={() => setEditando(null)} disabled={guardando}>
                            {t.cancelar}
                          </button>
                          <button type="submit" className="anadir" disabled={!textoEdicion.trim() || guardando}>
                            {t.guardar}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p>{c.texto}</p>
                    )}
                    {editando !== c.id && (
                      <div className="acciones-comentario">
                        <button
                          className={`accion me-gusta${meGusta ? " activo" : ""}`}
                          aria-label={t.meGusta}
                          aria-pressed={meGusta}
                          onClick={() => datos.reaccionar(c.id, usuario.$id)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d={ICONO_CORAZON} />
                          </svg>
                          {quienes.size > 0 && <span>{quienes.size}</span>}
                        </button>
                        {mio && (
                          <>
                            <button className="accion" aria-label={t.editarComentario} title={t.editarComentario} onClick={() => empezarEdicion(c)}>
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d={ICONO_EDITAR} />
                              </svg>
                            </button>
                            <button className="accion" aria-label={t.borrarComentario} title={t.borrarComentario} onClick={() => datos.borrar(c)}>
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d={ICONO_BORRAR} />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {(error || datos.error) && <p className="vacio">{error || datos.error}</p>}

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
          {datos.avisoBorrado && (
            // Dentro del diálogo: lo de fuera queda por debajo del fondo oscuro del <dialog> modal
            <div className="deshacer en-hoja" role="status">
              <span>{t.comentarioBorrado}</span>
              <button onClick={datos.deshacer}>{t.deshacer}</button>
            </div>
          )}
        </>
      )}
    </dialog>
  );
}
