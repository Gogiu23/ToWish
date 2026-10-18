"use client";

import { Channel, ID, Models, Operator, Query, RealtimeResponseEvent } from "appwrite";
import { account, BD, db, realtime } from "./appwrite";
import { useEffect, useRef, useState } from "react";
import { useBorradoDiferido } from "./borrado";
import Chat from "./Chat";
import Comentarios, { useComentarios, type Comentario } from "./Comentarios";
import Deslizable from "./Deslizable";
import { TEXTOS, type Idioma, type Textos } from "./i18n";
import Lateral from "./Lateral";
import { desactivarNotificaciones, registrarServiceWorker } from "./notificaciones";
import { buscarLugares, teselas, urlRuta, type Lugar, type ResultadoLugar } from "./lugar";
import { formatearTiempo } from "./tiempo";

type Plan = { id: string; texto: string; quien: string; hecho: boolean; creado: string; likes: string[]; lugar?: Lugar };
type Filtro = "todos" | "pendientes" | "hechos";

const T = { databaseId: BD, tableId: "planes" };

const aPlan = (r: Models.DefaultRow): Plan => ({
  id: r.$id,
  texto: r.texto,
  quien: r.quien,
  hecho: r.hecho ?? false,
  creado: r.$createdAt,
  likes: [...new Set<string>(r.likes ?? [])],
  lugar: r.lat != null && r.lng != null ? { nombre: r.lugar ?? "", lat: r.lat, lng: r.lng } : undefined,
});

const ordenar = (ps: Plan[]) => [...ps].sort((a, b) => b.creado.localeCompare(a.creado));

// Inserta o reemplaza por id: el mismo plan puede llegar por Realtime y por la respuesta HTTP, en cualquier orden
const upsert = (ps: Plan[], p: Plan) =>
  ps.some((x) => x.id === p.id) ? ps.map((x) => (x.id === p.id ? p : x)) : [p, ...ps];

const CLAVE_IDIOMA = "towish-idioma";

// Preferencia por dispositivo: cada uno ve la app en su idioma
function idiomaGuardado(): Idioma {
  try {
    const i = localStorage.getItem(CLAVE_IDIOMA);
    if (i && i in TEXTOS) return i as Idioma;
  } catch {}
  return "es";
}

// Fondo del login: se encadenan en bucle. Intercalados para que no vayan seguidos dos parecidos.
const VIDEOS = ["dolomitas", "golcuk", "nubes", "otono", "castillo", "niebla", "bosque"];

const FUNDIDO = 0.8; // segundos de transición entre vídeos (igual que en globals.css)

// Dos <video> superpuestos: mientras uno se ve, el otro ya tiene cargado el siguiente.
// Al final de cada vídeo, el siguiente arranca y se funde encima: nunca hay un hueco vacío.
function Fondo() {
  const [capas, setCapas] = useState([0, 1]); // qué vídeo tiene cargado cada capa
  const [activa, setActiva] = useState(0);
  const videos = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)];
  const fundiendo = useRef(false);
  // Con "reducir movimiento" activado, solo la imagen fija (y no se descarga ningún vídeo)
  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Sin autoPlay: si no, la capa oculta empezaría sola cada vez que se le cambia el vídeo
  useEffect(() => {
    videos[0].current?.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo el primero, al montar
  }, []);

  function siguiente() {
    if (fundiendo.current) return;
    fundiendo.current = true;
    const otra = 1 - activa;
    videos[otra].current?.play().catch(() => {});
    setActiva(otra);
    // Cuando termina el fundido, la capa que se ha ido carga el vídeo que viene después
    setTimeout(() => {
      setCapas((c) => {
        const n = [...c];
        n[activa] = (c[otra] + 1) % VIDEOS.length;
        return n;
      });
      fundiendo.current = false;
    }, FUNDIDO * 1000);
  }

  return (
    <div className="fondo" aria-hidden="true">
      {!quieto &&
        capas.map((v, capa) => (
          <video
            key={capa}
            ref={videos[capa]}
            className={capa === activa ? "activo" : undefined}
            src={`/videos/${VIDEOS[v]}.mp4`}
            poster={v === 0 ? "/videos/dolomitas.jpg" : undefined}
            preload="auto"
            muted
            playsInline
            onTimeUpdate={(e) => {
              const t = e.currentTarget;
              if (capa === activa && t.duration - t.currentTime <= FUNDIDO) siguiente();
            }}
            onEnded={() => capa === activa && siguiente()} // por si timeupdate no llega a tiempo
          />
        ))}
    </div>
  );
}

const PIN = "M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z";
const LADO_MAPA = 72;

// Cuadradito con el mapa (teselas de OpenStreetMap) y el pin en el centro; abre la ruta en Google Maps
function MiniMapa({ lugar, etiqueta }: { lugar: Lugar; etiqueta: string }) {
  return (
    <a className="minimapa" href={urlRuta(lugar)} target="_blank" rel="noopener noreferrer" aria-label={etiqueta}>
      <span className="mapa" style={{ width: LADO_MAPA, height: LADO_MAPA }}>
        {teselas(lugar.lat, lugar.lng, LADO_MAPA).map((t) => (
          // eslint-disable-next-line @next/next/no-img-element -- teselas externas diminutas; next/image las pasaría por nuestro servidor
          <img key={t.src} src={t.src} alt="" width={256} height={256} loading="lazy" style={{ left: t.left, top: t.top }} />
        ))}
        <svg className="pin" viewBox="0 0 24 24" aria-hidden="true">
          <path d={PIN} />
        </svg>
        <span className="osm">© OpenStreetMap</span>
      </span>
    </a>
  );
}

// "3 días y 2 horas deseando hacerlo": se calcula al cargar y al volver a la pestaña, no en vivo
function Deseando({ desde, idioma, t }: { desde: string; idioma: Idioma; t: Textos }) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const alVolver = () => document.visibilityState === "visible" && setAhora(new Date());
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, []);
  const tiempo = formatearTiempo(new Date(desde), ahora, idioma);
  return <small className="deseando">{tiempo ? t.deseando(tiempo) : t.recien}</small>;
}

const ESTRELLA = "M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z";

function Cabecera({ badge, children }: { badge: string; children: React.ReactNode }) {
  return (
    <header className="cabecera">
      <svg className="destello d1" viewBox="0 0 24 24" aria-hidden="true">
        <path d={ESTRELLA} />
      </svg>
      <svg className="destello d2" viewBox="0 0 24 24" aria-hidden="true">
        <path d={ESTRELLA} />
      </svg>
      <span className="badge">{badge}</span>
      <h1>ToWish</h1>
      <p className="sub">{children}</p>
    </header>
  );
}

export default function Home() {
  const [usuario, setUsuario] = useState<Models.User | null>(null);
  const [cargado, setCargado] = useState(false);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [texto, setTexto] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [error, setError] = useState("");
  const [idioma, setIdioma] = useState<Idioma>("es");
  const [conLugar, setConLugar] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ResultadoLugar[]>([]);
  const [lugar, setLugar] = useState<Lugar | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [avisoLugar, setAvisoLugar] = useState("");
  // Borrado diferido: el plan desaparece ya, pero solo se borra en Appwrite si no se deshace en 5 s
  const borrado = useBorradoDiferido<Plan>({
    borrar: (p) => db.deleteRow({ ...T, rowId: p.id }),
    restaurar: (p) => setPlanes((ps) => ordenar(upsert(ps, p))),
    onError: (e) => setError(e.message),
  });
  const { esPendiente } = borrado;
  const [vista, setVista] = useState<"planes" | "chat">("planes");
  const [noLeidos, setNoLeidos] = useState(0);
  const [planAbierto, setPlanAbierto] = useState<Plan | null>(null);
  const { comentarios, anadir: anadirComentario } = useComentarios(!!usuario);
  const porPlan: Record<string, Comentario[]> = {};
  for (const c of comentarios) (porPlan[c.planId] ??= []).push(c);
  const t = TEXTOS[idioma];

  useEffect(() => {
    account
      .get()
      .then(setUsuario)
      .catch(() => {})
      .finally(() => setCargado(true));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leer localStorage solo tras montar evita el desajuste de hidratación
    setIdioma(idiomaGuardado());
  }, []);

  useEffect(() => {
    document.documentElement.lang = idioma;
  }, [idioma]);

  // PWA y avisos: al tocar una notificación se llega al chat (por la URL o, si ya estaba abierta, por mensaje del SW)
  useEffect(() => {
    registrarServiceWorker();
    const url = new URL(location.href);
    if (url.searchParams.get("vista") === "chat") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leer la URL solo tras montar evita el desajuste de hidratación
      setVista("chat");
      url.searchParams.delete("vista");
      history.replaceState(null, "", url);
    }
    const alMensaje = (e: MessageEvent) => e.data?.vista === "chat" && setVista("chat");
    navigator.serviceWorker?.addEventListener("message", alMensaje);
    return () => navigator.serviceWorker?.removeEventListener("message", alMensaje);
  }, []);

  function cambiarIdioma(i: Idioma) {
    setIdioma(i);
    try {
      localStorage.setItem(CLAVE_IDIOMA, i);
    } catch {}
  }

  useEffect(() => {
    if (!usuario) return;
    const cargar = () =>
      db
        .listRows({ ...T, queries: [Query.orderDesc("$createdAt"), Query.limit(500)] })
        .then((r) => setPlanes(r.rows.map(aPlan).filter((p) => !esPendiente(p.id))))
        .catch((e) => setError(e.message));
    cargar();
    // Realtime: cambios del otro al instante
    const sub = realtime.subscribe(
      Channel.tablesdb(T.databaseId).table(T.tableId).row(),
      (ev: RealtimeResponseEvent<Models.DefaultRow>) => {
        const p = aPlan(ev.payload);
        if (ev.events.some((e) => e.endsWith(".delete")))
          setPlanes((ps) => ps.filter((x) => x.id !== p.id));
        else if (!esPendiente(p.id)) setPlanes((ps) => upsert(ps, p));
      },
    );
    // Al volver a la pestaña recargamos: el móvil en reposo corta el WebSocket y se pierden eventos
    window.addEventListener("focus", cargar);
    return () => {
      window.removeEventListener("focus", cargar);
      sub.then((s) => s.unsubscribe());
    };
  }, [usuario, esPendiente]);

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError("");
    try {
      await account.createEmailPasswordSession({
        email: String(f.get("email")),
        password: String(f.get("password")),
      });
      setUsuario(await account.get());
    } catch {
      setError(t.loginError);
    }
  }

  async function salir() {
    borrado.confirmar();
    await desactivarNotificaciones(); // que este móvil no siga recibiendo avisos de esta cuenta
    await account.deleteSession({ sessionId: "current" });
    setUsuario(null);
    setPlanes([]);
  }

  function elegirLugar(l: Lugar) {
    setLugar({ nombre: l.nombre.slice(0, 200), lat: l.lat, lng: l.lng });
    setResultados([]);
    setBusqueda("");
  }

  // Un link de Google Maps va al servidor (puede ser corto y hay que seguir la redirección); el resto se busca en OSM
  async function buscarLugar() {
    const q = busqueda.trim();
    if (!q || buscando) return;
    setBuscando(true);
    setAvisoLugar("");
    setResultados([]);
    try {
      if (/^https?:\/\//i.test(q)) {
        const r = await fetch(`/api/lugar?url=${encodeURIComponent(q)}&idioma=${idioma}`);
        const d = await r.json();
        if (r.ok) elegirLugar(d);
        else setAvisoLugar(d.error === "sin-resultados" ? t.sinResultados : t.linkNoValido);
      } else {
        const rs = await buscarLugares(q, idioma);
        if (rs.length) setResultados(rs);
        else setAvisoLugar(t.sinResultados);
      }
    } catch {
      setAvisoLugar(t.sinResultados);
    } finally {
      setBuscando(false);
    }
  }

  function quitarLugar() {
    setLugar(null);
    setConLugar(false);
    setResultados([]);
    setBusqueda("");
    setAvisoLugar("");
  }

  async function anadir(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || !usuario) return;
    try {
      const r = await db.createRow({
        ...T,
        rowId: ID.unique(),
        data: {
          texto: t,
          quien: usuario.name,
          hecho: false,
          ...(lugar && { lugar: lugar.nombre, lat: lugar.lat, lng: lugar.lng }),
        },
      });
      setPlanes((ps) => upsert(ps, aPlan(r)));
      setTexto("");
      quitarLugar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function alternar(p: Plan) {
    try {
      const r = await db.updateRow({ ...T, rowId: p.id, data: { hecho: !p.hecho } });
      setPlanes((ps) => upsert(ps, aPlan(r)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Se ve al momento; Appwrite añade/quita tu id de forma atómica (no se pierde un like si dais los dos a la vez)
  async function darLike(p: Plan) {
    if (!usuario) return;
    const yaLoTenia = p.likes.includes(usuario.$id);
    const likes = yaLoTenia ? p.likes.filter((id) => id !== usuario.$id) : [...p.likes, usuario.$id];
    setPlanes((ps) => upsert(ps, { ...p, likes }));
    try {
      const r = await db.updateRow({
        ...T,
        rowId: p.id,
        data: { likes: yaLoTenia ? Operator.arrayRemove(usuario.$id) : Operator.arrayAppend([usuario.$id]) },
      });
      setPlanes((ps) => upsert(ps, aPlan(r)));
    } catch (e) {
      setPlanes((ps) => upsert(ps, p)); // no se ha podido: vuelve como estaba
      setError((e as Error).message);
    }
  }

  function borrar(p: Plan) {
    setPlanes((ps) => ps.filter((x) => x.id !== p.id));
    borrado.programar(p);
  }

  if (!cargado) return null;

  const lateral = (
    <Lateral t={t} idioma={idioma} onIdioma={cambiarIdioma} usuario={usuario} onSalir={salir} />
  );

  if (!usuario)
    return (
      <main className="login">
        <Fondo />
        {lateral}
        <Cabecera badge={t.badge}>{t.loginSub}</Cabecera>
        <form onSubmit={entrar}>
          <input type="email" name="email" placeholder={t.email} aria-label={t.email} required />
          <input
            type="password"
            name="password"
            placeholder={t.password}
            aria-label={t.password}
            required
          />
          <button className="anadir" type="submit">
            {t.entrar}
          </button>
        </form>
        {error && <p className="vacio">{error}</p>}
      </main>
    );

  const visibles = planes.filter((p) =>
    filtro === "todos" ? true : filtro === "hechos" ? p.hecho : !p.hecho,
  );

  const irA = (v: typeof vista) => {
    setVista(v);
    if (v === "chat") setNoLeidos(0);
  };

  return (
    <main className="con-pestanas">
      {lateral}
      <div hidden={vista !== "planes"}>
        <Cabecera badge={t.badge}>{t.hola(usuario.name)}</Cabecera>

        <form onSubmit={anadir}>
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t.placeholder}
            aria-label={t.nuevoPlan}
            maxLength={500}
          />

          {lugar ? (
            <div className="lugar-elegido">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={PIN} />
              </svg>
              <span>{lugar.nombre}</span>
              <button type="button" aria-label={t.quitarLugar} onClick={quitarLugar}>
                ✕
              </button>
            </div>
          ) : conLugar ? (
            <div className="buscador">
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                // Enter busca el sitio en vez de guardar el plan
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    buscarLugar();
                  }
                }}
                placeholder={t.buscarLugar}
                aria-label={t.buscarLugar}
                autoFocus
              />
              <button type="button" className="pildora" onClick={buscarLugar} disabled={buscando}>
                {buscando ? t.buscando : t.buscar}
              </button>
            </div>
          ) : (
            <button type="button" className="poner-lugar" onClick={() => setConLugar(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={PIN} />
              </svg>
              {t.anadirLugar}
            </button>
          )}

          {resultados.length > 0 && (
            <ul className="resultados">
              {resultados.map((r) => (
                <li key={`${r.lat},${r.lng}`}>
                  <button type="button" onClick={() => elegirLugar(r)}>
                    <strong>{r.nombre}</strong>
                    <small>{r.detalle}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {avisoLugar && (
            <p className="aviso" role="status">
              {avisoLugar}
            </p>
          )}

          <button className="anadir" type="submit">
            {t.anadir}
          </button>
        </form>

        <div className="filtros">
          {(["todos", "pendientes", "hechos"] as Filtro[]).map((f) => (
            <button key={f} aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
              {t.filtros[f]}
            </button>
          ))}
        </div>

        {error && <p className="vacio">{error}</p>}

        {visibles.length === 0 ? (
          <p className="vacio">{t.vacio}</p>
        ) : (
          <ul className="planes">
            {visibles.map((p) => (
              <Deslizable
                key={p.id}
                className={`tarjeta ${p.quien === usuario.name ? "yo" : "ella"} ${p.hecho ? "hecho" : ""}`}
                derecha={{ etiqueta: t.borrarCorto, accion: () => borrar(p) }}
              >
                <input
                  type="checkbox"
                  checked={p.hecho}
                  aria-label={t.marcar(p.texto)}
                  onChange={() => alternar(p)}
                />
                <div className="texto">
                  <p className="texto-plan">
                    <span>{p.texto}</span>
                  </p>
                  <div className="meta">
                    <small className="autor">{p.quien}</small>
                    <time className="fecha" dateTime={p.creado}>
                      {new Intl.DateTimeFormat(idioma, { dateStyle: "medium" }).format(new Date(p.creado))}
                    </time>
                    {p.lugar && (
                      <small className="lugar-texto">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d={PIN} />
                        </svg>
                        {p.lugar.nombre}
                      </small>
                    )}
                  </div>
                  <div className="acciones">
                    <button
                      className={`accion me-gusta${p.likes.includes(usuario.$id) ? " activo" : ""}`}
                      aria-label={t.meGusta}
                      aria-pressed={p.likes.includes(usuario.$id)}
                      onClick={() => darLike(p)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.1 3.6 4.5 7.1 4.5c2 0 3.5 1.1 4.9 2.9 1.4-1.8 2.9-2.9 4.9-2.9 3.5 0 5.6 3.6 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2Z" />
                      </svg>
                      {p.likes.length > 0 && <span>{p.likes.length}</span>}
                    </button>
                    <button
                      className="accion"
                      aria-label={t.verComentarios(porPlan[p.id]?.length ?? 0)}
                      onClick={() => setPlanAbierto(p)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
                      </svg>
                      {porPlan[p.id]?.length > 0 && <span>{porPlan[p.id].length}</span>}
                    </button>
                  </div>
                </div>
                {p.lugar && <MiniMapa lugar={p.lugar} etiqueta={t.comoLlegar(p.lugar.nombre)} />}
                {!p.hecho && <Deseando desde={p.creado} idioma={idioma} t={t} />}
              </Deslizable>
            ))}
          </ul>
        )}

        {borrado.aviso && (
          <div className="deshacer" role="status">
            <span>{t.planBorrado}</span>
            <button onClick={borrado.deshacer}>{t.deshacer}</button>
          </div>
        )}
      </div>

      <Comentarios
        plan={planAbierto}
        comentarios={planAbierto ? (porPlan[planAbierto.id] ?? []) : []}
        usuario={usuario}
        t={t}
        idioma={idioma}
        onAnadido={anadirComentario}
        onCerrar={() => setPlanAbierto(null)}
      />

      <Chat
        usuario={usuario}
        t={t}
        idioma={idioma}
        visible={vista === "chat"}
        onNoLeido={() => setNoLeidos((n) => n + 1)}
      />

      <nav className="pestanas" aria-label={t.menu}>
        <button aria-current={vista === "planes" ? "page" : undefined} onClick={() => irA("planes")}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
          </svg>
          {t.planes}
        </button>
        <button aria-current={vista === "chat" ? "page" : undefined} onClick={() => irA("chat")}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
          </svg>
          {t.chat}
          {noLeidos > 0 && <span className="globo">{noLeidos}</span>}
        </button>
      </nav>
    </main>
  );
}
