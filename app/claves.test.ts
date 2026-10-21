import assert from "node:assert/strict";
import { test } from "node:test";
import { textoErrorClave } from "./claves.ts";

const t = { claveComun: "COMUN", clavePersonal: "PERSONAL", claveCorta: "CORTA" } as never;

test("reconoce por qué rechaza Appwrite una contraseña", () => {
  assert.equal(textoErrorClave(t, new Error("Password must not be one of the commonly used password."), "G"), "COMUN");
  assert.equal(textoErrorClave(t, new Error("Password must not include any personal data like your name, email"), "G"), "PERSONAL");
  assert.equal(textoErrorClave(t, new Error("Invalid `password` param: Password must be between 8 and 256 characters long."), "G"), "CORTA");
});

test("si no reconoce el motivo, devuelve el mensaje general", () => {
  assert.equal(textoErrorClave(t, new Error("Rate limit exceeded"), "G"), "G");
  assert.equal(textoErrorClave(t, undefined, "G"), "G");
  assert.equal(textoErrorClave(t, "texto suelto", "G"), "G");
});
