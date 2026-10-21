// Fechas "de calendario" (sin hora): se guardan como texto AAAA-MM-DD. Así no cambian de día según la zona
// horaria, que es lo que pasaría con un instante (Date/ISO con hora).

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** AAAA-MM-DD de un Date, con el día que marca el reloj del dispositivo (no el de UTC). */
export function aISO(d: Date) {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Date a las 00:00 locales, o null si el texto no es una fecha real (p. ej. 2026-02-31). */
export function aFecha(iso: string): Date | null {
  const m = FORMATO.exec(iso);
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(anio, mes - 1, dia);
  return d.getFullYear() === anio && d.getMonth() === mes - 1 && d.getDate() === dia ? d : null;
}

export const hoyISO = () => aISO(new Date());

/** "25 oct" / "25 окт." / "25 ott": corto, para las tarjetas. */
export function fechaCorta(iso: string, idioma: string) {
  const d = aFecha(iso);
  return d ? new Intl.DateTimeFormat(idioma, { day: "numeric", month: "short" }).format(d) : "";
}

/** "lunes, 20 de octubre de 2026": largo, para el calendario. */
export function fechaLarga(iso: string, idioma: string) {
  const d = aFecha(iso);
  return d ? new Intl.DateTimeFormat(idioma, { dateStyle: "full" }).format(d) : "";
}

/**
 * Las celdas de un mes: 42 (6 semanas) empezando en lunes, con los días sueltos del mes anterior y
 * siguiente para completar las semanas. `mes` va de 0 a 11.
 */
export function celdasDelMes(anio: number, mes: number) {
  const primero = new Date(anio, mes, 1);
  const desfase = (primero.getDay() + 6) % 7; // lunes = 0
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(anio, mes, 1 - desfase + i);
    return { iso: aISO(d), dia: d.getDate(), delMes: d.getMonth() === mes };
  });
}
