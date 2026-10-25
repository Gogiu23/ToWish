"use client";

import { Channel, ID, Models, Operator, Permission, Query, RealtimeResponseEvent, Role } from "appwrite";
import { account, BD, db, realtime } from "./appwrite";
import { useEffect, useRef, useState } from "react";
import { preconnect } from "react-dom";
import { useBorradoDiferido } from "./borrado";
import Chat from "./Chat";
import Comentarios, { useComentarios, type Comentario } from "./Comentarios";
import AvisoLlave from "./AvisoLlave";
import AvisoNotificaciones from "./AvisoNotificaciones";
import { detalleError, entrarConLlave, esCancelado, llavesDisponibles } from "./passkeys";
import Deslizable from "./Deslizable";
import Calendario from "./Calendario";
import CampoCategoria from "./CampoCategoria";
import CampoFecha, { ICONO_CALENDARIO } from "./CampoFecha";
import { CATEGORIAS, emojiDe, esCategoria, type Categoria } from "./categorias";
import EditarPlan from "./EditarPlan";
import { fechaCorta, hoyISO } from "./fechas";
import FormGrupo, { textoErrorGrupo } from "./FormGrupo";
import {
  grupoGuardado,
  guardarGrupo,
  guardarInvitacion,
  invitacionPendiente,
  misGrupos,
  olvidarGrupo,
  unirseAGrupo,
  type Grupo,
} from "./grupos";
import { TEXTOS, type Idioma, type Textos } from "./i18n";
import Instalar from "./Instalar";
import Lateral from "./Lateral";
import Mundo from "./Mundo";
import Novedades from "./Novedades";
import pkg from "../package.json";
import { avisarLikePlan, desactivarNotificaciones, registrarServiceWorker, sincronizarIdiomaAvisos } from "./notificaciones";
import { textoErrorClave } from "./claves";
import { PIN, teselas, urlRuta, type Lugar } from "./lugar";
import SelectorGrupo from "./SelectorGrupo";
import SelectorLugar from "./SelectorLugar";
import { formatearTiempo } from "./tiempo";

type Plan = {
  id: string;
  texto: string;
  quien: string;
  hecho: boolean;
  creado: string;
  likes: string[];
  lugar?: Lugar;
  fecha?: string; // día en que se quiere hacer (AAAA-MM-DD)
  categoria?: Categoria;
};
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
  fecha: r.fecha || undefined,
  categoria: esCategoria(r.categoria) ? r.categoria : undefined,
});

const ordenar = (ps: Plan[]) => [...ps].sort((a, b) => b.creado.localeCompare(a.creado));

// Inserta o reemplaza por id: el mismo plan puede llegar por Realtime y por la respuesta HTTP, en cualquier orden
const upsert = (ps: Plan[], p: Plan) =>
  ps.some((x) => x.id === p.id) ? ps.map((x) => (x.id === p.id ? p : x)) : [p, ...ps];

const CLAVE_IDIOMA = "towish-idioma";

// Cierre de sesión automático: fuera de la app más de 5 min, o dentro sin actividad 10 min
const MAX_FUERA = 5 * 60 * 1000;
const MAX_INACTIVO = 10 * 60 * 1000;
const CLAVE_SALIDA = "towish-salida"; // hora a la que se dejó la app (al volver se mira cuánto pasó)

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

// esGrupo: el badge es el nombre del grupo (lila, con icono de personas)
// badge: texto fijo (login) o el selector de grupo (con sesión)
function Cabecera({ badge, children }: { badge: React.ReactNode; children: React.ReactNode }) {
  return (
    <header className="cabecera">
      {typeof badge === "string" ? <span className="badge">{badge}</span> : badge}
      {/* Los brillos van dentro del bloque del título: al encogerse al bajar, se van con él */}
      <div className="titulo">
        <svg className="destello d1" viewBox="0 0 24 24" aria-hidden="true">
          <path d={ESTRELLA} />
        </svg>
        <svg className="destello d2" viewBox="0 0 24 24" aria-hidden="true">
          <path d={ESTRELLA} />
        </svg>
        <h1>ToWish</h1>
      </div>
      <p className="sub">{children}</p>
    </header>
  );
}

// En Mundo y Chat el título va directamente pequeño y pegado arriba (como en Planes al bajar)
function CabeceraCompacta() {
  return (
    <header className="cabecera compacta">
      <div className="titulo">
        <svg className="destello d1" viewBox="0 0 24 24" aria-hidden="true">
          <path d={ESTRELLA} />
        </svg>
        <svg className="destello d2" viewBox="0 0 24 24" aria-hidden="true">
          <path d={ESTRELLA} />
        </svg>
        <p className="h1">ToWish</p>
      </div>
    </header>
  );
}

export default function Home() {
  const [usuario, setUsuario] = useState<Models.User | null>(null);
  preconnect("https://api.geoapify.com"); // la primera sugerencia se ahorra abrir la conexión
  const [cargado, setCargado] = useState(false);
  const [grupos, setGrupos] = useState<Grupo[] | null>(null); // null: aún cargando
  const [grupoId, setGrupoId] = useState<string | null>(null);
  const [registro, setRegistro] = useState(false); // login: entrar o crear cuenta
  const [invitado, setInvitado] = useState(false); // ha llegado con un enlace de invitación
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [texto, setTexto] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("pendientes"); // lo primero que se ve: lo que falta por hacer
  const [verCategoria, setVerCategoria] = useState<Categoria | null>(null); // filtro por categoría (null = todas)
  const [antiguosPrimero, setAntiguosPrimero] = useState(false);
  const [error, setError] = useState("");
  const [idioma, setIdioma] = useState<Idioma>("es");
  const [lugar, setLugar] = useState<Lugar | null>(null);
  const [fecha, setFecha] = useState(""); // día previsto del plan nuevo ("" = sin fecha)
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [instalarVisible, setInstalarVisible] = useState(false); // el cartel de instalar está a la vista
  const [llaveVisible, setLlaveVisible] = useState(false); // el de activar Face ID / huella
  const [recienEntrado, setRecienEntrado] = useState(false); // acaba de entrar con contraseña: se le ofrece la llave
  const [conLlaves, setConLlaves] = useState(false); // el navegador permite llaves de acceso
  const [claveLugar, setClaveLugar] = useState(0); // al cambiarla, el selector de lugar del formulario empieza de cero
  const [planEditando, setPlanEditando] = useState<Plan | null>(null);
  // Borrado diferido: el plan desaparece ya, pero solo se borra en Appwrite si no se deshace en 5 s
  const borrado = useBorradoDiferido<Plan>({
    borrar: (p) => db.deleteRow({ ...T, rowId: p.id }),
    restaurar: (p) => setPlanes((ps) => ordenar(upsert(ps, p))),
    onError: (e) => setError(e.message),
  });
  const { esPendiente } = borrado;
  const [vista, setVista] = useState<"planes" | "mundo" | "calendario" | "chat">("planes");
  const [noLeidos, setNoLeidos] = useState(0);
  const [planAbierto, setPlanAbierto] = useState<Plan | null>(null);
  // El grupo que se ve (si el guardado ya no existe, el primero)
  const grupo = grupos?.find((g) => g.id === grupoId) ?? grupos?.[0] ?? null;
  const datosComentarios = useComentarios(usuario ? (grupo?.id ?? null) : null);
  const porPlan: Record<string, Comentario[]> = {};
  for (const c of datosComentarios.comentarios) (porPlan[c.planId] ??= []).push(c);
  const t = TEXTOS[idioma];

  useEffect(() => {
    account
      .get()
      .then(setUsuario)
      .catch(() => {})
      .finally(() => setCargado(true));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leer localStorage solo tras montar evita el desajuste de hidratación
    setIdioma(idiomaGuardado());
    setConLlaves(llavesDisponibles());
  }, []);

  useEffect(() => {
    document.documentElement.lang = idioma;
  }, [idioma]);

  // Los avisos llegan en el idioma de la app: si este dispositivo los tiene activados, se le dice cuál es
  useEffect(() => {
    if (usuario) sincronizarIdiomaAvisos(usuario, idioma);
  }, [usuario, idioma]);

  // PWA y avisos: al tocar una notificación se llega al chat (por la URL o, si ya estaba abierta, por mensaje del SW)
  useEffect(() => {
    registrarServiceWorker();
    const url = new URL(location.href);
    const { searchParams: q } = url;
    // Enlace de invitación (?unirse=CÓDIGO): se guarda hasta que la persona entra o se da de alta
    const codigo = q.get("unirse");
    if (codigo) guardarInvitacion(codigo);
    // Aviso de un mensaje (?grupo=…): se abre ese grupo
    const g = q.get("grupo");
    if (g) guardarGrupo(g);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leer la URL solo tras montar evita el desajuste de hidratación
    setInvitado(!!invitacionPendiente());
    if (invitacionPendiente()) setRegistro(true); // lo normal con un enlace es no tener cuenta aún
    if (q.get("vista") === "chat") setVista("chat");
    if (codigo || g || q.has("vista")) {
      ["unirse", "grupo", "vista"].forEach((k) => q.delete(k));
      history.replaceState(null, "", url);
    }
    // Aviso tocado con la app abierta: al grupo del aviso, y al chat si era un mensaje
    const alMensaje = (e: MessageEvent) => {
      const v = e.data?.vista;
      if (v !== "chat" && v !== "planes") return;
      if (e.data.grupo) elegirGrupo(e.data.grupo);
      setVista(v);
    };
    navigator.serviceWorker?.addEventListener("message", alMensaje);
    return () => navigator.serviceWorker?.removeEventListener("message", alMensaje);
  }, []);

  // Al entrar: primero la invitación pendiente (si la hay), luego tus grupos
  useEffect(() => {
    if (!usuario) return;
    let vivo = true;
    (async () => {
      let elegido = grupoGuardado();
      const codigo = invitacionPendiente();
      if (codigo) {
        guardarInvitacion(null);
        setInvitado(false);
        try {
          elegido = await unirseAGrupo(codigo);
          guardarGrupo(elegido);
        } catch (e) {
          setError(textoErrorGrupo(t, (e as Error).message));
        }
      }
      const gs = await misGrupos();
      if (!vivo) return;
      setGrupos(gs);
      setGrupoId(elegido);
    })().catch((e) => setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [usuario]); // eslint-disable-line react-hooks/exhaustive-deps -- t solo para el texto del error

  function elegirGrupo(id: string) {
    guardarGrupo(id);
    setGrupoId(id);
  }

  // Recién creado o recién unido: se recargan los grupos (con sus miembros) y se abre ese
  async function grupoNuevo(id: string) {
    setGrupos(await misGrupos());
    elegirGrupo(id);
    setError("");
  }

  // Tras borrar el grupo: al siguiente que tengas o, si no queda ninguno, a crear o unirse
  async function grupoBorrado() {
    setPlanes([]);
    setGrupoId(null);
    setGrupos(await misGrupos().catch(() => []));
  }

  // La cuenta ya no existe: de vuelta a la pantalla de entrada
  function cuentaEliminada() {
    olvidarGrupo();
    setUsuario(null);
    setPlanes([]);
    setGrupos(null);
    setGrupoId(null);
    setError(t.cuentaEliminada);
  }

  function cambiarIdioma(i: Idioma) {
    setIdioma(i);
    try {
      localStorage.setItem(CLAVE_IDIOMA, i);
    } catch {}
  }

  const idGrupo = grupo?.id;
  useEffect(() => {
    if (!usuario || !idGrupo) return;
    const cargar = () =>
      db
        .listRows({ ...T, queries: [Query.equal("grupo", idGrupo), Query.orderDesc("$createdAt"), Query.limit(500)] })
        .then((r) => setPlanes(r.rows.map(aPlan).filter((p) => !esPendiente(p.id))))
        .catch((e) => setError(e.message));
    cargar();
    // Realtime: cambios del otro al instante
    const sub = realtime.subscribe(
      Channel.tablesdb(T.databaseId).table(T.tableId).row(),
      (ev: RealtimeResponseEvent<Models.DefaultRow>) => {
        if (ev.payload.grupo !== idGrupo) return; // de otro de tus grupos
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
  }, [usuario, idGrupo, esPendiente]);

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError("");
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    if (registro) {
      try {
        await account.create({ userId: ID.unique(), email, password, name: String(f.get("nombre")).trim() });
      } catch (err) {
        // 409: ya hay una cuenta con ese email; 429: demasiados intentos; si no, se explica qué le pasa a la contraseña
        const { code } = err as { code?: number };
        return setError(code === 409 ? t.emailEnUso : code === 429 ? t.demasiadosIntentos : textoErrorClave(t, err, t.errorRegistro));
      }
    }
    try {
      await account.createEmailPasswordSession({ email, password });
      setUsuario(await account.get());
      setRecienEntrado(true);
    } catch (err) {
      // Solo el 401 es de verdad "email o contraseña mal"; antes cualquier fallo salía así
      const { code, type } = err as { code?: number; type?: string };
      if (type === "user_session_already_exists") return setUsuario(await account.get().catch(() => null));
      setError(code === 429 ? t.demasiadosIntentos : code === 401 ? t.loginError : t.errorConexion);
    }
  }

  // Face ID / huella: el sistema enseña las cuentas con llave en este dispositivo y se entra con la elegida
  async function entrarLlave() {
    setError("");
    try {
      await entrarConLlave();
      setUsuario(await account.get());
    } catch (e) {
      if (!esCancelado(e)) setError(`${t.errorLlave} (${detalleError(e)})`);
    }
  }

  // Cierre automático: como "Cerrar sesión", pero sin desactivar los avisos (el móvil sigue siendo tuyo)
  async function cerrarPorInactividad() {
    borrado.confirmar();
    await account.deleteSession({ sessionId: "current" }).catch(() => {}); // sin red: se cierra igual en la app
    setUsuario(null);
    setPlanes([]);
    setGrupos(null);
    setError(t.sesionCaducada);
  }

  // El efecto de abajo siempre llama a la versión actual (con el idioma de ahora)
  const cerrarPorTiempo = useRef(cerrarPorInactividad);
  useEffect(() => {
    cerrarPorTiempo.current = cerrarPorInactividad;
  });

  // Fuera de la app los móviles congelan los temporizadores: por eso se guarda la hora de salida y
  // se comprueba al volver (o al abrir la app otra vez). Dentro, se mira la última actividad cada 30 s.
  useEffect(() => {
    if (!usuario) return;
    const leer = () => {
      try {
        return Number(localStorage.getItem(CLAVE_SALIDA)) || 0;
      } catch {
        return 0;
      }
    };
    const guardar = (v: number | null) => {
      try {
        if (v === null) localStorage.removeItem(CLAVE_SALIDA);
        else localStorage.setItem(CLAVE_SALIDA, String(v));
      } catch {}
    };
    let ultimaActividad = Date.now();
    let cerrada = false;
    const caducar = () => {
      if (cerrada) return;
      cerrada = true;
      guardar(null);
      cerrarPorTiempo.current();
    };
    const salida = leer();
    if (salida && Date.now() - salida > MAX_FUERA) return caducar();
    guardar(null);

    const alCambiar = () => {
      if (document.visibilityState === "hidden") return guardar(Date.now());
      const s = leer();
      if (s && Date.now() - s > MAX_FUERA) return caducar();
      guardar(null);
      ultimaActividad = Date.now();
    };
    const alIrse = () => guardar(Date.now()); // cerrar la pestaña o la app
    const actividad = () => (ultimaActividad = Date.now());
    const eventos = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    document.addEventListener("visibilitychange", alCambiar);
    window.addEventListener("pagehide", alIrse);
    eventos.forEach((e) => window.addEventListener(e, actividad, { passive: true, capture: true }));
    const mirar = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - ultimaActividad > MAX_INACTIVO) caducar();
    }, 30_000);
    return () => {
      document.removeEventListener("visibilitychange", alCambiar);
      window.removeEventListener("pagehide", alIrse);
      eventos.forEach((e) => window.removeEventListener(e, actividad, { capture: true }));
      clearInterval(mirar);
    };
  }, [usuario]);

  async function salir() {
    borrado.confirmar();
    if (usuario) await desactivarNotificaciones(usuario); // este móvil deja de recibir los avisos de esta cuenta
    await account.deleteSession({ sessionId: "current" });
    setUsuario(null);
    setPlanes([]);
    setGrupos(null);
  }

  // Prioridad a lo cercano a vuestro último sitio al buscar lugares
  const cercaDe = planes.find((p) => p.lugar)?.lugar;

  async function anadir(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || !usuario || !grupo) return;
    try {
      const r = await db.createRow({
        ...T,
        rowId: ID.unique(),
        data: {
          texto: t,
          quien: usuario.name,
          hecho: false,
          grupo: grupo.id,
          ...(lugar && { lugar: lugar.nombre, lat: lugar.lat, lng: lugar.lng }),
          ...(fecha && { fecha }),
          ...(categoria && { categoria }),
        },
        // Solo los del grupo lo ven, lo marcan, le dan like y lo borran
        permissions: [
          Permission.read(Role.team(grupo.id)),
          Permission.update(Role.team(grupo.id)),
          Permission.delete(Role.team(grupo.id)),
        ],
      });
      setPlanes((ps) => upsert(ps, aPlan(r)));
      setTexto("");
      setLugar(null);
      setFecha("");
      setCategoria(null);
      setClaveLugar((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Cambia el texto y/o el lugar de un plan (quitar el lugar = dejar lugar, lat y lng en null)
  async function guardarEdicion(id: string, texto: string, lugar: Lugar | null, fecha: string, categoria: Categoria | null) {
    const r = await db.updateRow({
      ...T,
      rowId: id,
      data: { texto, lugar: lugar?.nombre ?? null, lat: lugar?.lat ?? null, lng: lugar?.lng ?? null, fecha: fecha || null, categoria },
    });
    setPlanes((ps) => upsert(ps, aPlan(r)));
  }

  // Desde el calendario: poner un plan en un día o quitárselo
  async function asignarFecha(id: string, fecha: string | null) {
    const r = await db.updateRow({ ...T, rowId: id, data: { fecha } });
    setPlanes((ps) => upsert(ps, aPlan(r)));
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
      // Aviso a los demás del grupo (lo comprueba el servidor). Sin esperar: si falla, el "me gusta" ya está dado
      if (!yaLoTenia) avisarLikePlan(p.id);
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
    <>
    <Novedades t={t} version={pkg.version} />
    <Lateral
      t={t}
      idioma={idioma}
      onIdioma={cambiarIdioma}
      usuario={usuario}
      onSalir={salir}
      grupos={grupos ?? []}
      grupo={grupo}
      onGrupo={elegirGrupo}
      onGrupoNuevo={grupoNuevo}
      onGrupoBorrado={grupoBorrado}
      onCuentaEliminada={cuentaEliminada}
    />
    </>
  );

  if (!usuario)
    return (
      <main className="login">
        <Fondo />
        {lateral}
        <Instalar t={t} conPestanas={false} />
        <Cabecera badge={t.badge}>{invitado ? t.invitado : registro ? t.registroSub : t.loginSub}</Cabecera>
        <form onSubmit={entrar}>
          {registro && (
            <input type="text" name="nombre" placeholder={t.tuNombre} aria-label={t.tuNombre} autoComplete="given-name" maxLength={40} required />
          )}
          <input type="email" name="email" placeholder={t.email} aria-label={t.email} autoComplete="email" required />
          <input
            type="password"
            name="password"
            placeholder={t.password}
            aria-label={t.password}
            autoComplete={registro ? "new-password" : "current-password"}
            minLength={registro ? 8 : undefined}
            required
          />
          <button className="anadir" type="submit">
            {registro ? t.crearCuenta : t.entrar}
          </button>
        </form>
        <button
          className="cambiar-modo"
          onClick={() => {
            setRegistro((r) => !r);
            setError("");
          }}
        >
          {registro ? t.yaTengoCuenta : t.noTengoCuenta}
        </button>
        {conLlaves && !registro && (
          <button className="entrar-llave" onClick={entrarLlave}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 11V8a4 4 0 1 1 8 0v3M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Zm6 4v2" />
            </svg>
            {t.entrarConLlave}
          </button>
        )}
        {error && <p className="vacio">{error}</p>}
      </main>
    );

  if (!grupos) return null; // cargando tus grupos (un instante)

  // Con cuenta pero sin grupo todavía: crear uno o unirse con un código
  if (!grupo)
    return (
      <main className="login">
        <Fondo />
        {lateral}
        <Cabecera badge={t.badge}>{t.grupoSub}</Cabecera>
        <FormGrupo t={t} onListo={grupoNuevo} />
        {error && <p className="vacio">{error}</p>}
      </main>
    );

  const filtrados = planes.filter(
    (p) =>
      (filtro === "todos" ? true : filtro === "hechos" ? p.hecho : !p.hecho) &&
      (!verCategoria || p.categoria === verCategoria),
  );
  // planes ya viene de más nuevo a más antiguo; en "Todos", los pendientes delante de los hechos
  const ordenados = antiguosPrimero ? [...filtrados].reverse() : filtrados;
  const visibles = filtro === "todos" ? [...ordenados].sort((a, b) => Number(a.hecho) - Number(b.hecho)) : ordenados;
  // En el filtro solo salen las categorías que se usan (y la elegida, aunque ya no quede ninguna)
  const categoriasEnUso = CATEGORIAS.filter((c) => c.id === verCategoria || planes.some((p) => p.categoria === c.id));

  const irA = (v: typeof vista) => {
    setVista(v);
    if (v === "chat") setNoLeidos(0);
  };

  return (
    <main className="con-pestanas">
      {lateral}
      <Instalar t={t} conPestanas onMostrado={setInstalarVisible} />
      <AvisoLlave t={t} usuario={usuario} recienEntrado={recienEntrado} onMostrado={setLlaveVisible} />
      <AvisoNotificaciones t={t} usuario={usuario} esperar={instalarVisible || llaveVisible} />
      <div hidden={vista !== "planes"}>
        <Cabecera
          badge={<SelectorGrupo grupos={grupos} grupo={grupo} t={t} onGrupo={elegirGrupo} onGrupoNuevo={grupoNuevo} />}
        >
          {t.hola(usuario.name)}
        </Cabecera>

        <form onSubmit={anadir}>
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t.placeholder}
            aria-label={t.nuevoPlan}
            maxLength={500}
          />

          <SelectorLugar key={claveLugar} lugar={lugar} onLugar={setLugar} cercaDe={cercaDe} idioma={idioma} t={t} />
          <CampoFecha valor={fecha} onCambio={setFecha} t={t} idioma={idioma} />
          <CampoCategoria valor={categoria} onCambio={setCategoria} t={t} />

          <button className="anadir" type="submit">
            {t.anadir}
          </button>
        </form>

        <div className="filtros">
          {(["pendientes", "todos", "hechos"] as Filtro[]).map((f) => (
            <button key={f} aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
              {t.filtros[f]}
            </button>
          ))}
          <button
            className={`ordenar${antiguosPrimero ? " antiguos" : ""}`}
            aria-label={antiguosPrimero ? t.ordenAntiguos : t.ordenNuevos}
            title={antiguosPrimero ? t.ordenAntiguos : t.ordenNuevos}
            onClick={() => setAntiguosPrimero((a) => !a)}
          >
            {/* Flecha larga = hacia dónde van los más nuevos */}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 4v16m0 0-4-4m4 4 4-4M16 20V8m0 0-3 3m3-3 3 3" />
            </svg>
          </button>
        </div>

        {categoriasEnUso.length > 0 && (
          <div className="filtro-categorias" role="radiogroup" aria-label={t.categoria}>
            <button role="radio" aria-checked={!verCategoria} onClick={() => setVerCategoria(null)}>
              {t.todasCategorias}
            </button>
            {categoriasEnUso.map((c) => (
              <button
                key={c.id}
                role="radio"
                aria-checked={verCategoria === c.id}
                onClick={() => setVerCategoria(verCategoria === c.id ? null : c.id)}
              >
                <span aria-hidden="true">{c.emoji}</span>
                {t.categorias[c.id]}
              </button>
            ))}
          </div>
        )}

        {error && <p className="vacio">{error}</p>}

        {visibles.length === 0 ? (
          <p className="vacio">{t.vacio}</p>
        ) : (
          // --numcards / --index: para apilarlas al hacer scroll (globals.css, "Tarjetas apiladas")
          <ul className="planes" style={{ "--numcards": visibles.length } as React.CSSProperties}>
            {visibles.map((p, i) => (
              <Deslizable
                key={p.id}
                estiloFila={{ "--index": i + 1 } as React.CSSProperties}
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
                    {p.categoria && (
                      <small className="categoria-plan">
                        <span aria-hidden="true">{emojiDe(p.categoria)}</span>
                        {t.categorias[p.categoria]}
                      </small>
                    )}
                    {p.fecha && (
                      <small
                        className={`fecha-plan${!p.hecho && p.fecha < hoyISO() ? " atrasado" : ""}${p.fecha === hoyISO() ? " hoy" : ""}`}
                        title={t.fechaPrevista}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d={ICONO_CALENDARIO} />
                        </svg>
                        {p.fecha === hoyISO() ? t.hoy : fechaCorta(p.fecha, idioma)}
                      </small>
                    )}
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
                    <button className="accion" aria-label={t.editarPlan} title={t.editarPlan} onClick={() => setPlanEditando(p)}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Zm9.5-13.5 4 4" />
                      </svg>
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

      <EditarPlan
        plan={planEditando}
        cercaDe={cercaDe}
        idioma={idioma}
        t={t}
        onGuardar={guardarEdicion}
        onCerrar={() => setPlanEditando(null)}
      />

      <Comentarios
        plan={planAbierto}
        datos={datosComentarios}
        usuario={usuario}
        grupo={grupo.id}
        t={t}
        idioma={idioma}
        onCerrar={() => setPlanAbierto(null)}
      />

      {vista !== "planes" && <CabeceraCompacta />}

      {/* Pestaña Mundo. Todos los planes con lugar (sin filtrar): pin si está pendiente, bandera si está hecho */}
      <div className="vista-mundo" hidden={vista !== "mundo"}>
        <Mundo
          t={t}
          lugares={planes.flatMap((p) =>
            p.lugar ? [{ id: p.id, texto: p.texto, hecho: p.hecho, nombre: p.lugar.nombre, lat: p.lugar.lat, lng: p.lugar.lng }] : [],
          )}
        />
      </div>

      {/* Pestaña Calendario: los planes con fecha, por días */}
      <div className="vista-calendario" hidden={vista !== "calendario"}>
        <Calendario planes={planes} idioma={idioma} t={t} onFecha={asignarFecha} />
      </div>

      <Chat
        key={grupo.id} // al cambiar de grupo, chat nuevo (sin mensajes ni borrados del anterior)
        usuario={usuario}
        grupo={grupo}
        todosMisGrupos={grupos.map((g) => g.id)}
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
        <button aria-current={vista === "mundo" ? "page" : undefined} onClick={() => irA("mundo")}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
          </svg>
          {t.mundoPestana}
        </button>
        <button aria-current={vista === "calendario" ? "page" : undefined} onClick={() => irA("calendario")}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={ICONO_CALENDARIO} />
          </svg>
          {t.calendario}
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
