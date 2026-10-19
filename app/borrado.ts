"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const ESPERA = 5000;

type Opciones<T> = {
  borrar: (x: T) => Promise<unknown>; // el borrado de verdad (Appwrite)
  restaurar: (x: T) => void; // volver a enseñarlo (deshacer o error)
  onError: (e: Error) => void;
};

/**
 * Borrado con "Deshacer": quien llama oculta el elemento y llama a programar(); solo se borra de verdad
 * si pasan 5 s, si se programa otro borrado o si te vas de la app (así no queda nada a medias).
 */
export function useBorradoDiferido<T extends { id: string }>(opciones: Opciones<T>) {
  const ops = useRef(opciones);
  useEffect(() => {
    ops.current = opciones;
  });
  const pendiente = useRef<{ x: T; temporizador: ReturnType<typeof setTimeout> } | null>(null);
  const [aviso, setAviso] = useState<T | null>(null);

  const confirmar = useCallback(() => {
    const p = pendiente.current;
    if (!p) return;
    clearTimeout(p.temporizador);
    pendiente.current = null;
    setAviso(null);
    ops.current.borrar(p.x).catch((e) => {
      ops.current.restaurar(p.x); // no se ha podido borrar: vuelve
      ops.current.onError(e as Error);
    });
  }, []);

  const programar = useCallback(
    (x: T) => {
      confirmar(); // si había otro pendiente, ese ya va en serio
      pendiente.current = { x, temporizador: setTimeout(confirmar, ESPERA) };
      setAviso(x);
    },
    [confirmar],
  );

  const deshacer = useCallback(() => {
    const p = pendiente.current;
    if (!p) return;
    clearTimeout(p.temporizador);
    pendiente.current = null;
    setAviso(null);
    ops.current.restaurar(p.x);
  }, []);

  useEffect(() => {
    const alIrte = () => document.visibilityState === "hidden" && confirmar();
    document.addEventListener("visibilitychange", alIrte);
    return () => document.removeEventListener("visibilitychange", alIrte);
  }, [confirmar]);

  // Para que una recarga o un evento de Realtime no lo vuelvan a enseñar mientras está pendiente
  const esPendiente = useCallback((id: string) => pendiente.current?.x.id === id, []);

  return { programar, deshacer, confirmar, aviso, esPendiente };
}
