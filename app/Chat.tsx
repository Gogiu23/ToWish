"use client";

import { Channel, ID, Models, Permission, Query, RealtimeResponseEvent, Role } from "appwrite";
import { useEffect, useRef, useState } from "react";
import { BD, db, presencias, realtime } from "./appwrite";
import { useBorradoDiferido } from "./borrado";
import Deslizable from "./Deslizable";
import type { Idioma, Textos } from "./i18n";

type Cita = { id: string; autor: string; texto: string };
type Mensaje = { id: string; texto: string; autor: string; autorId: string; creado: string; respondeA?: Cita };

const M = { databaseId: BD, tableId: "mensajes" };

const aMensaje = (r: Models.DefaultRow): Mensaje => ({
  id: r.$id,
  texto: r.texto,
  autor: r.autor,
  autorId: r.autorId,
  creado: r.$createdAt,
  // Copia del mensaje citado: se sigue viendo aunque el original se borre
  respondeA: r.respondeA ? { id: r.respondeA, autor: r.respondeAutor ?? "", texto: r.respondeTexto ?? "" } : undefined,
});

const ordenar = (ms: Mensaje[]) => [...ms].sort((a, b) => a.creado.localeCompare(b.creado));

const upsert = (ms: Mensaje[], m: Mensaje) =>
  ms.some((x) => x.id === m.id) ? ms.map((x) => (x.id === m.id ? m : x)) : [...ms, m];

type Props = {
  usuario: Models.User;
  t: Textos;
  idioma: Idioma;
  visible: boolean;
  onNoLeido: () => void;
};

// Sigue montado aunque estés en Planes (solo se oculta): así llegan los mensajes y se cuentan los no leídos
export default function Chat({ usuario, t, idioma, visible, onNoLeido }: Props) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [conectados, setConectados] = useState<Record<string, string>>({}); // userId → nombre
  const [respondiendo, setRespondiendo] = useState<Mensaje | null>(null);
  const caja = useRef<HTMLInputElement>(null);
  const borrado = useBorradoDiferido<Mensaje>({
    borrar: (m) => db.deleteRow({ ...M, rowId: m.id }),
    restaurar: (m) => setMensajes((ms) => ordenar(upsert(ms, m))),
    onError: (e) => setError(e.message),
  });
  const { esPendiente } = borrado;
  const visibleAhora = useRef(visible);
  const avisar = useRef(onNoLeido);
  useEffect(() => {
    visibleAhora.current = visible;
    avisar.current = onNoLeido;
  });

  useEffect(() => {
    const cargar = () =>
      db
        .listRows({ ...M, queries: [Query.orderDesc("$createdAt"), Query.limit(100)] })
        .then((r) => setMensajes(r.rows.map(aMensaje).reverse().filter((m) => !esPendiente(m.id))))
        .catch((e) => setError(e.message));
    cargar();

    const sub = realtime.subscribe(
      Channel.tablesdb(BD).table(M.tableId).row(),
      (ev: RealtimeResponseEvent<Models.DefaultRow>) => {
        const m = aMensaje(ev.payload);
        if (ev.events.some((e) => e.endsWith(".delete"))) return setMensajes((ms) => ms.filter((x) => x.id !== m.id));
        if (esPendiente(m.id)) return;
        setMensajes((ms) => upsert(ms, m));
        const nuevoDelOtro = m.autorId !== usuario.$id && ev.events.some((e) => e.endsWith(".create"));
        if (nuevoDelOtro && !visibleAhora.current) avisar.current();
      },
    );

    // Presencia ligada al WebSocket: el SDK la reenvía al reconectar y desaparece al cerrar la app
    realtime.upsertPresence({
      presenceId: usuario.$id,
      status: "online",
      permissions: [Permission.read(Role.users())],
      metadata: { nombre: usuario.name },
    });
    const leerPresencias = () =>
      presencias
        .list()
        .then((r) =>
          setConectados(
            Object.fromEntries(r.presences.map((p) => [p.userId, (p.metadata as { nombre?: string })?.nombre ?? ""])),
          ),
        )
        .catch(() => {});
    leerPresencias();
    const subPresencias = realtime.subscribe(Channel.presences(), leerPresencias);

    // Al volver a la pestaña: el móvil en reposo corta el WebSocket y se pierden eventos
    const alVolver = () => {
      cargar();
      leerPresencias();
    };
    window.addEventListener("focus", alVolver);
    return () => {
      window.removeEventListener("focus", alVolver);
      sub.then((s) => s.unsubscribe());
      subPresencias.then((s) => s.unsubscribe());
    };
  }, [usuario, esPendiente]);

  // Siempre mostrando lo último (la caja de escribir es fija: se baja la página entera)
  useEffect(() => {
    if (visible) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [mensajes.length, visible, respondiendo]);

  function responder(m: Mensaje) {
    setRespondiendo(m);
    caja.current?.focus();
  }

  function borrar(m: Mensaje) {
    setMensajes((ms) => ms.filter((x) => x.id !== m.id));
    if (respondiendo?.id === m.id) setRespondiendo(null);
    borrado.programar(m);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const tx = texto.trim();
    if (!tx) return;
    const cita = respondiendo;
    setTexto("");
    setRespondiendo(null);
    setError("");
    try {
      const r = await db.createRow({
        ...M,
        rowId: ID.unique(),
        data: {
          texto: tx,
          autor: usuario.name,
          autorId: usuario.$id,
          ...(cita && { respondeA: cita.id, respondeAutor: cita.autor, respondeTexto: cita.texto.slice(0, 200) }),
        },
        // Leer: todos (permiso de la tabla). Editar y borrar: solo quien lo escribió
        permissions: [Permission.update(Role.user(usuario.$id)), Permission.delete(Role.user(usuario.$id))],
      });
      setMensajes((ms) => upsert(ms, aMensaje(r)));
    } catch (err) {
      setTexto(tx); // que no se pierda lo escrito
      setRespondiendo(cita);
      setError((err as Error).message);
    }
  }

  const hoy = new Date().toDateString();
  const hora = (iso: string) => {
    const d = new Date(iso);
    const opciones: Intl.DateTimeFormatOptions =
      d.toDateString() === hoy ? { timeStyle: "short" } : { dateStyle: "short", timeStyle: "short" };
    return new Intl.DateTimeFormat(idioma, opciones).format(d);
  };
  const otros = Object.entries(conectados).filter(([id]) => id !== usuario.$id);

  return (
    <section className={`chat${respondiendo ? " respondiendo" : ""}`} hidden={!visible}>
      <header className="chat-cabecera">
        <h2>{t.chat}</h2>
        <div className="conectados">
          {otros.length ? (
            otros.map(([id, nombre]) => (
              <span key={id} className="conectado">
                <i className="punto" aria-hidden="true" />
                {nombre} · {t.enLinea}
              </span>
            ))
          ) : (
            <span className="nadie">{t.nadieConectado}</span>
          )}
        </div>
      </header>

      {mensajes.length === 0 ? (
        <p className="vacio">{t.sinMensajes}</p>
      ) : (
        <ul className="mensajes">
          {mensajes.map((m) => {
            const mio = m.autorId === usuario.$id;
            return (
              <Deslizable
                key={m.id}
                claseFila={mio ? "mio" : "suyo"}
                className={`burbuja ${mio ? "mio" : "suyo"}`}
                // Borrar solo los tuyos (Appwrite tampoco te dejaría con los de ella)
                derecha={mio ? { etiqueta: t.borrarCorto, accion: () => borrar(m) } : undefined}
                izquierda={{ etiqueta: t.responder, accion: () => responder(m) }}
              >
                {m.respondeA && (
                  <blockquote className="cita">
                    <strong>{m.respondeA.autor}</strong>
                    <span>{m.respondeA.texto}</span>
                  </blockquote>
                )}
                <p>{m.texto}</p>
                <small>
                  {!mio && `${m.autor} · `}
                  <time dateTime={m.creado}>{hora(m.creado)}</time>
                </small>
              </Deslizable>
            );
          })}
        </ul>
      )}

      {error && <p className="vacio">{error}</p>}

      {borrado.aviso && (
        <div className="deshacer sobre-escribir" role="status">
          <span>{t.mensajeBorrado}</span>
          <button onClick={borrado.deshacer}>{t.deshacer}</button>
        </div>
      )}

      <form className="escribir" onSubmit={enviar}>
        {respondiendo && (
          <div className="respondiendo-a">
            <div>
              <strong>{t.respondiendoA(respondiendo.autor)}</strong>
              <span>{respondiendo.texto}</span>
            </div>
            <button type="button" aria-label={t.cancelarRespuesta} onClick={() => setRespondiendo(null)}>
              ✕
            </button>
          </div>
        )}
        <div className="fila-escribir">
          <input
            ref={caja}
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t.escribeMensaje}
            aria-label={t.escribeMensaje}
            maxLength={2000}
            enterKeyHint="send"
          />
          <button className="anadir" type="submit" disabled={!texto.trim()}>
            {t.enviar}
          </button>
        </div>
      </form>
    </section>
  );
}
