import type { Textos } from "./i18n";

/**
 * Texto para un fallo al crear o cambiar una contraseña. Appwrite explica el motivo en inglés, así que se
 * reconoce por lo que dice; si no es ninguno de los conocidos, sale el mensaje general que se pase.
 */
export function textoErrorClave(t: Textos, err: unknown, general: string) {
  const mensaje = String((err as { message?: string })?.message ?? "");
  if (/commonly used|dictionary/i.test(mensaje)) return t.claveComun;
  if (/personal data/i.test(mensaje)) return t.clavePersonal;
  if (/at least|characters long|between \d+ and/i.test(mensaje)) return t.claveCorta;
  return general;
}
