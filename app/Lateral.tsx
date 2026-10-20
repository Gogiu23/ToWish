"use client";

import type { Models } from "appwrite";
import { useEffect, useRef, useState } from "react";
import pkg from "../package.json";
import { account } from "./appwrite";
import { cerrarConAnimacion } from "./dialogo";
import FormGrupo from "./FormGrupo";
import { borrarGrupo, codigoDeGrupo, eliminarCuenta, enlaceInvitacion, MAX_MIEMBROS, type Grupo } from "./grupos";
import { TEXTOS, type Idioma, type Textos } from "./i18n";
import {
  activarNotificaciones,
  desactivarNotificaciones,
  estadoNotificaciones,
  type EstadoNotificaciones,
} from "./notificaciones";

type Props = {
  t: Textos;
  idioma: Idioma;
  onIdioma: (i: Idioma) => void;
  usuario: Models.User | null;
  onSalir: () => void;
  grupos: Grupo[];
  grupo: Grupo | null;
  onGrupo: (id: string) => void;
  onGrupoNuevo: (id: string) => void;
  onGrupoBorrado: () => void;
  onCuentaEliminada: () => void;
};

export default function Lateral({ t, idioma, onIdioma, usuario, onSalir, grupos, grupo, onGrupo, onGrupoNuevo, onGrupoBorrado, onCuentaEliminada }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  // Cierre animado: se desliza hacia fuera y, al acabar la animación, se cierra de verdad
  const cerrar = () => cerrarConAnimacion(ref.current);
  const [notif, setNotif] = useState<EstadoNotificaciones | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const [cambiarClave, setCambiarClave] = useState(false);
  const [guardandoClave, setGuardandoClave] = useState(false);
  const [avisoClave, setAvisoClave] = useState<{ ok: boolean; texto: string } | null>(null);

  async function guardarClave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const actual = String(f.get("actual"));
    const nueva = String(f.get("nueva"));
    const repetida = String(f.get("repetida"));
    if (nueva.length < 8) return setAvisoClave({ ok: false, texto: t.claveCorta }); // mínimo de Appwrite
    if (nueva !== repetida) return setAvisoClave({ ok: false, texto: t.claveNoCoincide });
    if (nueva === actual) return setAvisoClave({ ok: false, texto: t.claveIgual });
    setGuardandoClave(true);
    try {
      await account.updatePassword({ password: nueva, oldPassword: actual });
      setCambiarClave(false);
      setAvisoClave({ ok: true, texto: t.claveCambiada });
    } catch (err) {
      // 401: Appwrite rechaza la contraseña actual
      const codigo = (err as { code?: number }).code;
      setAvisoClave({ ok: false, texto: codigo === 401 ? t.claveActualMal : t.claveError });
    } finally {
      setGuardandoClave(false);
    }
  }

  useEffect(() => {
    if (usuario) estadoNotificaciones().then(setNotif);
  }, [usuario]);

  const [codigo, setCodigo] = useState<string | null>(null);
  const [avisoInvitar, setAvisoInvitar] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [confirmarCuenta, setConfirmarCuenta] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorCuenta, setErrorCuenta] = useState("");

  async function eliminar() {
    setEliminando(true);
    setErrorCuenta("");
    try {
      await desactivarNotificaciones().catch(() => {}); // este móvil deja de recibir avisos
      await eliminarCuenta();
      cerrar();
      onCuentaEliminada();
    } catch {
      setErrorCuenta(t.errorGrupo);
      setEliminando(false);
    }
  }
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState("");

  async function borrar() {
    if (!grupo) return;
    setBorrando(true);
    setErrorBorrado("");
    try {
      await borrarGrupo(grupo.id);
      setConfirmarBorrado(false);
      cerrar();
      onGrupoBorrado();
    } catch {
      setErrorBorrado(t.errorGrupo);
    } finally {
      setBorrando(false);
    }
  }

  async function copiarCodigo() {
    if (!codigo) return;
    await navigator.clipboard.writeText(codigo).catch(() => {});
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  }
  const idGrupo = grupo?.id;
  useEffect(() => {
    if (!idGrupo) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- al cambiar de grupo, fuera el código del anterior
    setAvisoInvitar("");
    setConfirmarBorrado(false);
    codigoDeGrupo(idGrupo)
      .then(setCodigo)
      .catch(() => setCodigo(null));
  }, [idGrupo]);

  // Móvil: menú de compartir (WhatsApp…). Ordenador: se copia el enlace
  async function invitar() {
    if (!codigo || !grupo) return;
    const url = enlaceInvitacion(codigo);
    if (navigator.share) return navigator.share({ title: "ToWish", text: t.textoInvitacion(grupo.nombre), url }).catch(() => {});
    await navigator.clipboard.writeText(url).catch(() => {});
    setAvisoInvitar(t.enlaceCopiado);
  }

  async function alternarNotificaciones() {
    if (!usuario) return;
    setCambiando(true);
    try {
      if (notif === "activadas") {
        await desactivarNotificaciones();
        setNotif("desactivadas");
      } else setNotif(await activarNotificaciones(usuario));
    } catch {
      setNotif(await estadoNotificaciones());
    } finally {
      setCambiando(false);
    }
  }

  const textoNotif: Record<EstadoNotificaciones, string> = {
    activadas: t.notifActivadas,
    desactivadas: t.notifDesactivadas,
    bloqueadas: t.notifBloqueadas,
    instalar: t.notifInstalar,
    "no-soportadas": t.notifNoSoportadas,
  };

  return (
    <>
      <button className="abrir-menu" aria-label={t.menu} onClick={() => ref.current?.showModal()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {/* Clic en el fondo oscuro (el propio <dialog>, no su contenido) = cerrar */}
      <dialog
        ref={ref}
        className="lateral"
        onClick={(e) => e.target === ref.current && cerrar()}
        // Esc: en vez de cerrarse de golpe, la misma animación
        onCancel={(e) => {
          e.preventDefault();
          cerrar();
        }}
      >
        <div className="lateral-cabecera">
          <span className="lateral-titulo">ToWish</span>
          <button className="cerrar" aria-label={t.cerrar} onClick={cerrar}>
            ✕
          </button>
        </div>

        {usuario && (
          <section>
            <h2>{t.ajustes}</h2>
            <p className="cuenta">
              <strong>{usuario.name}</strong>
              <br />
              {usuario.email}
            </p>
            <div className="botones-cuenta">
              <button
                className="pildora"
                aria-expanded={cambiarClave}
                onClick={() => {
                  setCambiarClave((c) => !c);
                  setAvisoClave(null);
                }}
              >
                {t.cambiarClave}
              </button>
              <button
                className="pildora"
                onClick={() => {
                  cerrar();
                  onSalir();
                }}
              >
                {t.salir}
              </button>
            </div>

            {confirmarCuenta ? (
              <div className="confirmar-borrado" role="alert">
                <p>{t.confirmarEliminarCuenta}</p>
                <div className="botones-cuenta">
                  <button className="pildora" onClick={() => setConfirmarCuenta(false)} disabled={eliminando}>
                    {t.cancelar}
                  </button>
                  <button className="anadir peligro" onClick={eliminar} disabled={eliminando}>
                    {eliminando ? t.borrandoGrupo : t.siBorrar}
                  </button>
                </div>
              </div>
            ) : (
              <button className="pildora borrar-grupo" onClick={() => setConfirmarCuenta(true)}>
                {t.eliminarCuenta}
              </button>
            )}
            {errorCuenta && (
              <p className="aviso-clave" role="alert">
                {errorCuenta}
              </p>
            )}

            {cambiarClave && (
              <form className="cambiar-clave" onSubmit={guardarClave}>
                <input
                  type="password"
                  name="actual"
                  autoComplete="current-password"
                  placeholder={t.claveActual}
                  aria-label={t.claveActual}
                  required
                />
                <input
                  type="password"
                  name="nueva"
                  autoComplete="new-password"
                  placeholder={t.claveNueva}
                  aria-label={t.claveNueva}
                  minLength={8}
                  required
                />
                <input
                  type="password"
                  name="repetida"
                  autoComplete="new-password"
                  placeholder={t.claveRepetir}
                  aria-label={t.claveRepetir}
                  minLength={8}
                  required
                />
                <div className="botones-cuenta">
                  <button type="button" className="pildora" onClick={() => setCambiarClave(false)}>
                    {t.cancelar}
                  </button>
                  <button type="submit" className="anadir" disabled={guardandoClave}>
                    {t.guardar}
                  </button>
                </div>
              </form>
            )}
            {avisoClave && (
              <p className={`aviso-clave${avisoClave.ok ? " ok" : ""}`} role="status">
                {avisoClave.texto}
              </p>
            )}
          </section>
        )}

        {usuario && grupo && (
          <section>
            <h2>{t.grupo}</h2>
            {grupos.length > 1 ? (
              <div className="opciones">
                {grupos.map((g) => (
                  <button key={g.id} aria-pressed={g.id === grupo.id} onClick={() => onGrupo(g.id)}>
                    {g.nombre}
                  </button>
                ))}
              </div>
            ) : (
              <p className="cuenta">
                <strong>{grupo.nombre}</strong>
              </p>
            )}
            <p className="cuenta">
              {grupo.miembros.map((m) => m.nombre).join(", ")} · {t.plazas(grupo.miembros.length, MAX_MIEMBROS)}
            </p>
            {codigo && grupo.miembros.length < MAX_MIEMBROS && (
              <div className="invitar">
                <button className="codigo-copiar" onClick={copiarCodigo} aria-label={t.copiarCodigo(codigo)}>
                  <code>{codigo}</code>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1Zm-4 6H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
                  </svg>
                  {copiado && (
                    <span className="copiado" role="status">
                      {t.codigoCopiado}
                    </span>
                  )}
                </button>
                <button className="pildora" onClick={invitar}>
                  {t.invitar}
                </button>
                {/* wa.me abre la app de WhatsApp (móvil) o WhatsApp Web con el mensaje ya escrito */}
                <a
                  className="whatsapp"
                  href={`https://wa.me/?text=${encodeURIComponent(`${t.textoInvitacion(grupo.nombre)}: ${enlaceInvitacion(codigo)}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t.invitarWhatsapp}
                  title={t.invitarWhatsapp}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
                  </svg>
                </a>
              </div>
            )}
            {avisoInvitar && (
              <p className="aviso-clave ok" role="status">
                {avisoInvitar}
              </p>
            )}
            {usuario && grupo.admins.includes(usuario.$id) &&
              (confirmarBorrado ? (
                <div className="confirmar-borrado" role="alert">
                  <p>{t.confirmarBorrarGrupo(grupo.nombre)}</p>
                  <div className="botones-cuenta">
                    <button className="pildora" onClick={() => setConfirmarBorrado(false)} disabled={borrando}>
                      {t.cancelar}
                    </button>
                    <button className="anadir peligro" onClick={borrar} disabled={borrando}>
                      {borrando ? t.borrandoGrupo : t.siBorrar}
                    </button>
                  </div>
                </div>
              ) : (
                <button className="pildora borrar-grupo" onClick={() => setConfirmarBorrado(true)}>
                  {t.borrarGrupo}
                </button>
              ))}
            {errorBorrado && (
              <p className="aviso-clave" role="alert">
                {errorBorrado}
              </p>
            )}
            <details className="otro-grupo">
              <summary>{t.otroGrupo}</summary>
              <FormGrupo
                t={t}
                onListo={(id) => {
                  cerrar();
                  onGrupoNuevo(id);
                }}
              />
            </details>
          </section>
        )}

        {usuario && notif && (
          <section>
            <h2>{t.notificaciones}</h2>
            <p className="cuenta">{textoNotif[notif]}</p>
            {(notif === "activadas" || notif === "desactivadas") && (
              <button className="pildora" aria-pressed={notif === "activadas"} disabled={cambiando} onClick={alternarNotificaciones}>
                {notif === "activadas" ? t.desactivarNotif : t.activarNotif}
              </button>
            )}
          </section>
        )}

        <section>
          <h2>{t.idioma}</h2>
          <div className="opciones">
            {(Object.keys(TEXTOS) as Idioma[]).map((i) => (
              <button key={i} lang={i} aria-pressed={idioma === i} onClick={() => onIdioma(i)}>
                {TEXTOS[i].nombreIdioma}
              </button>
            ))}
          </div>
        </section>

        <p className="version">
          {t.version} {pkg.version}
        </p>
      </dialog>
    </>
  );
}
