"use client";

import type { Models } from "appwrite";
import { useEffect, useState } from "react";
import type { Textos } from "./i18n";
import { crearLlave, detalleError, esCancelado, llavesDisponibles } from "./passkeys";

// Una vez por cuenta y dispositivo: si ya dijo que sí o que no, no se vuelve a ofrecer
const clave = (usuario: Models.User) => `towish-llave-${usuario.$id}`;

function yaVisto(usuario: Models.User) {
  try {
    return !!localStorage.getItem(clave(usuario));
  } catch {
    return true;
  }
}

/**
 * Justo después de entrar con la contraseña, ofrece activar Face ID / huella (llave de acceso). Es el momento:
 * Appwrite solo deja crear una llave en los 10 minutos siguientes a entrar. Avisa de si está a la vista
 * (`onMostrado`) para que el cartel de los avisos espere y no salgan dos a la vez.
 */
export default function AvisoLlave({
  t,
  usuario,
  recienEntrado,
  onMostrado,
}: {
  t: Textos;
  usuario: Models.User;
  recienEntrado: boolean;
  onMostrado: (v: boolean) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage y WebAuthn solo existen tras montar
    setVisible(recienEntrado && llavesDisponibles() && !yaVisto(usuario));
  }, [recienEntrado, usuario]);

  useEffect(() => onMostrado(visible), [visible, onMostrado]);

  function cerrar(valor: "hecho" | "no") {
    try {
      localStorage.setItem(clave(usuario), valor);
    } catch {}
    setVisible(false);
  }

  async function activar() {
    setOcupado(true);
    setError("");
    try {
      await crearLlave();
      cerrar("hecho");
    } catch (e) {
      // Cancelado en la ventana del sistema: no es un error, se puede volver a intentar
      if (!esCancelado(e)) setError(`${t.errorLlave} (${detalleError(e)})`);
    } finally {
      setOcupado(false);
    }
  }

  if (!visible) return null;

  return (
    <aside className="instalar sobre-pestanas avisos" role="dialog" aria-labelledby="llave-titulo">
      <svg className="icono-avisos" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 11V8a4 4 0 1 1 8 0v3M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Zm6 4v2" />
      </svg>
      <div className="instalar-texto">
        <strong id="llave-titulo">{t.llaveTitulo}</strong>
        <span>{error || t.llaveTexto}</span>
      </div>
      <div className="instalar-botones">
        <button className="pildora" onClick={() => cerrar("no")} disabled={ocupado}>
          {t.ahoraNo}
        </button>
        <button className="anadir" onClick={activar} disabled={ocupado}>
          {t.activarNotif}
        </button>
      </div>
    </aside>
  );
}
