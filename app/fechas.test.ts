import assert from "node:assert/strict";
import { test } from "node:test";
import { aFecha, aISO, celdasDelMes } from "./fechas.ts";

test("aISO usa el día local, con ceros", () => {
  assert.equal(aISO(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(aISO(new Date(2026, 11, 31, 23, 59)), "2026-12-31"); // casi medianoche: sigue siendo el 31
});

test("aFecha ida y vuelta, y rechaza lo que no es una fecha real", () => {
  assert.equal(aISO(aFecha("2026-10-25")!), "2026-10-25");
  assert.equal(aFecha("2026-02-31"), null);
  assert.equal(aFecha("2026-13-01"), null);
  assert.equal(aFecha("25/10/2026"), null);
  assert.equal(aFecha(""), null);
});

test("aFecha respeta los años bisiestos", () => {
  assert.ok(aFecha("2028-02-29"));
  assert.equal(aFecha("2026-02-29"), null);
});

test("celdasDelMes: 42 celdas, empieza en lunes y contiene todos los días del mes", () => {
  const celdas = celdasDelMes(2026, 9); // octubre de 2026: el día 1 es jueves
  assert.equal(celdas.length, 42);
  assert.equal(aFecha(celdas[0].iso)!.getDay(), 1); // lunes
  assert.equal(celdas.filter((c) => c.delMes).length, 31);
  assert.equal(celdas.find((c) => c.delMes)!.iso, "2026-10-01");
});

test("celdasDelMes: un mes que empieza en lunes no lleva días del anterior delante", () => {
  const celdas = celdasDelMes(2026, 5); // junio de 2026: el día 1 es lunes
  assert.equal(celdas[0].iso, "2026-06-01");
  assert.equal(celdas[0].delMes, true);
});
