// Nubes procedurales para la transición satélite ↔ mapa del globo.
// Ruido fractal (fBm de "value noise"): la técnica habitual para nubes en juegos y efectos.

// Número pseudoaleatorio fijo por (x, y, semilla): misma semilla, misma nube
function azar(x: number, y: number, semilla: number) {
  let h = (x * 374761393 + y * 668265263 + semilla * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const suave = (t: number) => t * t * (3 - 2 * t);

// Ruido continuo: interpola los valores aleatorios de la cuadrícula
function ruido(x: number, y: number, semilla: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = suave(x - x0);
  const fy = suave(y - y0);
  const a = azar(x0, y0, semilla);
  const b = azar(x0 + 1, y0, semilla);
  const c = azar(x0, y0 + 1, semilla);
  const d = azar(x0 + 1, y0 + 1, semilla);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// fBm: varias capas de ruido, cada una el doble de fina y con la mitad de peso
function fbm(x: number, y: number, semilla: number) {
  let suma = 0;
  let peso = 0.5;
  for (let o = 0; o < 5; o++) {
    suma += peso * ruido(x, y, semilla + o * 17);
    x *= 2;
    y *= 2;
    peso *= 0.5;
  }
  return suma; // ~0..1
}

/** Pinta una nube algodonosa (blanca, con sombras suaves y bordes deshilachados) en el canvas. */
export function pintarNube(canvas: HTMLCanvasElement, semilla: number) {
  const L = 256; // se amplía por CSS (ocupan media pantalla): suficiente detalle para algo tan difuso
  canvas.width = L;
  canvas.height = L;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(L, L);
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const u = x / L - 0.5;
      const v = y / L - 0.5;
      const r = Math.hypot(u * 1.15, v * 1.5) * 2; // algo más ancha que alta
      const borde = Math.max(0, 1 - r * r); // se apaga hacia fuera
      const n = fbm(x / 45, y / 45, semilla);
      const densidad = Math.min(1, Math.max(0, (n - 0.36) * 3.6)) * borde;
      // Más densa = más blanca; más fina = gris azulada. La parte de abajo, en sombra
      // (la luz viene de arriba, como en las nubes de verdad)
      const sombra = Math.max(0, v + 0.1) * 70 * (1 - densidad * 0.4);
      const tono = 190 + 65 * Math.min(1, densidad * 1.3) - sombra;
      const i = (y * L + x) * 4;
      img.data[i] = tono;
      img.data[i + 1] = tono + 2;
      img.data[i + 2] = Math.min(255, tono + 8);
      img.data[i + 3] = Math.round(255 * Math.min(1, densidad * 1.5));
    }
  }
  ctx.putImageData(img, 0, 0);
}
