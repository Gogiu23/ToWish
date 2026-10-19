// TypeScript 5.9 aún no trae los tipos de Intl.DurationFormat (sí está en los navegadores actuales y en Node)
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- ampliar el Intl global solo se puede con namespace
  namespace Intl {
    class DurationFormat {
      constructor(locale?: string, options?: { style?: "long" | "short" | "narrow" });
      format(d: Partial<Record<Unidad, number>>): string;
    }
  }
}

type Unidad = "years" | "months" | "days" | "hours" | "minutes" | "seconds";

// Suma meses sin desbordar: 31 ene + 1 mes = 28/29 feb, no 3 de marzo
function sumarMeses(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  const diasMes = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), diasMes));
  return r;
}

/** Tiempo entre dos fechas en años, meses (de calendario), días, horas, minutos y segundos. */
export function transcurrido(desde: Date, ahora: Date): Record<Unidad, number> {
  if (ahora <= desde) return { years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  let meses = (ahora.getFullYear() - desde.getFullYear()) * 12 + ahora.getMonth() - desde.getMonth();
  if (sumarMeses(desde, meses) > ahora) meses--;
  let resto = Math.floor((ahora.getTime() - sumarMeses(desde, meses).getTime()) / 1000);
  const seconds = resto % 60;
  resto = Math.floor(resto / 60);
  const minutes = resto % 60;
  resto = Math.floor(resto / 60);
  const hours = resto % 24;
  const days = Math.floor(resto / 24);
  return { years: Math.floor(meses / 12), months: meses % 12, days, hours, minutes, seconds };
}

// Lo que se enseña: sin segundos (el texto no se actualiza en vivo)
const VISIBLES: Unidad[] = ["years", "months", "days", "hours", "minutes"];

/** Las dos unidades más grandes: "3 minutos", "2 días y 4 horas", "1 año y 2 meses". null si < 1 minuto. */
export function dosUnidades(t: Record<Unidad, number>): Partial<Record<Unidad, number>> | null {
  const i = VISIBLES.findIndex((u) => t[u] > 0);
  if (i === -1) return null;
  const res: Partial<Record<Unidad, number>> = { [VISIBLES[i]]: t[VISIBLES[i]] };
  const sig = VISIBLES[i + 1];
  if (sig && t[sig] > 0) res[sig] = t[sig];
  return res;
}

export function formatearTiempo(desde: Date, ahora: Date, idioma: string) {
  const d = dosUnidades(transcurrido(desde, ahora));
  return d && new Intl.DurationFormat(idioma, { style: "long" }).format(d);
}
