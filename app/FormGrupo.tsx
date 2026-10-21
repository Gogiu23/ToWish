"use client";

import { useState } from "react";
import { crearGrupo, unirseAGrupo } from "./grupos";
import type { Textos } from "./i18n";

export function textoErrorGrupo(t: Textos, codigo: string) {
  const errores: Record<string, string> = {
    "codigo-no-valido": t.codigoNoValido,
    "grupo-lleno": t.grupoLleno,
    "demasiados-grupos": t.demasiadosGrupos,
    "demasiados-intentos": t.demasiadosIntentos,
  };
  return errores[codigo] ?? t.errorGrupo;
}

/** Crear un grupo nuevo o unirse a uno con el código. Al acabar avisa con el id del grupo. */
export default function FormGrupo({ t, onListo }: { t: Textos; onListo: (grupo: string) => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  async function hacer(e: React.FormEvent<HTMLFormElement>, accion: (v: string) => Promise<string>, campo: string) {
    e.preventDefault();
    const valor = String(new FormData(e.currentTarget).get(campo) ?? "").trim();
    if (!valor) return;
    setOcupado(true);
    setError("");
    try {
      onListo(await accion(valor));
    } catch (err) {
      setError(textoErrorGrupo(t, (err as Error).message));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="form-grupo">
      <form onSubmit={(e) => hacer(e, crearGrupo, "nombre")}>
        <input type="text" name="nombre" placeholder={t.nombreGrupo} aria-label={t.nombreGrupo} maxLength={60} required />
        <button className="anadir" type="submit" disabled={ocupado}>
          {t.crearGrupo}
        </button>
      </form>
      <p className="separador">{t.o}</p>
      <form onSubmit={(e) => hacer(e, unirseAGrupo, "codigo")}>
        <input
          type="text"
          name="codigo"
          placeholder={t.codigo}
          aria-label={t.codigo}
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
        />
        <button className="anadir" type="submit" disabled={ocupado}>
          {t.unirme}
        </button>
      </form>
      {error && (
        <p className="aviso-clave" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
