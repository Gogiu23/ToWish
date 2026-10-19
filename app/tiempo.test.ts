// node --test app/tiempo.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { dosUnidades, formatearTiempo, transcurrido } from "./tiempo.ts";

const f = (s: string) => new Date(s);

test("segundos, minutos, horas y días", () => {
  assert.deepEqual(transcurrido(f("2026-10-19T10:00:00"), f("2026-10-21T13:04:05")), {
    years: 0, months: 0, days: 2, hours: 3, minutes: 4, seconds: 5,
  });
});

test("meses de calendario sin desbordar: 31 ene → 1 mar es 1 mes y 1 día (2026 no es bisiesto)", () => {
  const t = transcurrido(f("2026-01-31T12:00:00"), f("2026-03-01T12:00:00"));
  assert.equal(t.months, 1);
  assert.equal(t.days, 1);
});

test("años y meses", () => {
  const t = transcurrido(f("2025-08-15T09:00:00"), f("2026-10-20T09:00:00"));
  assert.deepEqual([t.years, t.months, t.days], [1, 2, 5]);
});

test("menos de un minuto (o reloj del móvil atrasado): null, para enseñar «recién añadido»", () => {
  assert.equal(dosUnidades(transcurrido(f("2026-10-19T10:00:05"), f("2026-10-19T10:00:00"))), null);
  assert.equal(formatearTiempo(f("2026-10-19T10:00:00"), f("2026-10-19T10:00:59"), "es"), null);
});

test("solo las dos unidades más grandes, y se salta la segunda si es 0", () => {
  assert.deepEqual(dosUnidades({ years: 0, months: 0, days: 2, hours: 3, minutes: 4, seconds: 5 }), { days: 2, hours: 3 });
  assert.deepEqual(dosUnidades({ years: 1, months: 0, days: 9, hours: 0, minutes: 0, seconds: 0 }), { years: 1 });
  // Nunca segundos
  assert.deepEqual(dosUnidades({ years: 0, months: 0, days: 0, hours: 0, minutes: 8, seconds: 44 }), { minutes: 8 });
});

test("texto en los tres idiomas, con plurales", () => {
  const desde = f("2026-10-19T10:00:00");
  const ahora = f("2026-10-21T13:00:00");
  assert.equal(formatearTiempo(desde, ahora, "es"), "2 días y 3 horas");
  assert.equal(formatearTiempo(desde, ahora, "it"), "2 giorni e 3 ore");
  assert.match(formatearTiempo(desde, ahora, "ru") ?? "", /^2 дня.*3 часа$/);
});
