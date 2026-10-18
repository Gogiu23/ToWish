// node --test app/lugar.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { esHostGoogle, leerLinkGoogle, teselas } from "./lugar.ts";

test("link de sitio: usa !3d!4d (el sitio) antes que @ (la vista) y saca el nombre", () => {
  const l = leerLinkGoogle(
    "https://www.google.com/maps/place/Alhambra/@37.17,-3.58,17z/data=!3m1!4b1!4m6!3m5!1s0xd71fce5ba5a6c8f:0x5b2d6a0a6d0d3fbd!8m2!3d37.1760783!4d-3.5881413",
  );
  assert.deepEqual(l, { nombre: "Alhambra", lat: 37.1760783, lng: -3.5881413 });
});

test("nombre con espacios y acentos codificados", () => {
  const l = leerLinkGoogle("https://www.google.es/maps/place/Playa+de+las+Catedrales/@43.5544,-7.1572,15z");
  assert.equal(l?.nombre, "Playa de las Catedrales");
  assert.equal(l?.lat, 43.5544);
  const acento = leerLinkGoogle("https://www.google.com/maps/place/Le%C3%B3n/@42.5987,-5.5671,13z");
  assert.equal(acento?.nombre, "León");
});

test("link corto del móvil ya resuelto: /maps/search/lat,+lng (sin nombre)", () => {
  const l = leerLinkGoogle(
    "https://www.google.com/maps/search/41.378602,+2.153918?entry=tts&g_ep=EgoyMDI2MTAxMy4wIPu8ASoASAFQAw%3D%3D",
  );
  assert.deepEqual(l, { nombre: "", lat: 41.378602, lng: 2.153918 });
  assert.equal(leerLinkGoogle("https://www.google.com/maps/search/Sagrada+Familia")?.nombre, "Sagrada Familia");
});

test("?q=lat,lng y ?query=texto", () => {
  assert.deepEqual(leerLinkGoogle("https://maps.google.com/?q=41.9028,12.4964"), {
    nombre: "",
    lat: 41.9028,
    lng: 12.4964,
  });
  const soloTexto = leerLinkGoogle("https://www.google.com/maps/search/?api=1&query=Coliseo+Roma");
  assert.equal(soloTexto?.nombre, "Coliseo Roma");
  assert.ok(Number.isNaN(soloTexto?.lat));
});

test("rechaza otros dominios y coordenadas imposibles", () => {
  assert.equal(leerLinkGoogle("https://evil.com/maps/@40,-3"), null);
  assert.equal(leerLinkGoogle("https://google.com.evil.com/maps/@40,-3"), null);
  assert.equal(leerLinkGoogle("https://www.google.com/maps/@95,-3,15z"), null);
  assert.equal(leerLinkGoogle("no es un link"), null);
  assert.ok(esHostGoogle("maps.app.goo.gl"));
  assert.ok(!esHostGoogle("maps.app.goo.gl.evil.com"));
  assert.ok(esHostGoogle("www.google.co.uk") && esHostGoogle("google.com.ar") && esHostGoogle("consent.google.es"));
});

test("teselas: cubren el cuadrado y el punto queda en el centro", () => {
  const lado = 96;
  const ts = teselas(40.4168, -3.7038, lado);
  assert.ok(ts.length >= 1 && ts.length <= 4);
  for (const t of ts) assert.match(t.src, /^https:\/\/tile\.openstreetmap\.org\/15\/\d+\/\d+\.png$/);
  // Alguna tesela debe contener el centro del cuadrado
  assert.ok(ts.some((t) => t.left <= lado / 2 && t.left + 256 > lado / 2 && t.top <= lado / 2 && t.top + 256 > lado / 2));
});
