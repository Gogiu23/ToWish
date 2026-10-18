import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Next la genera al compilar y añade las etiquetas og:image / twitter:image
export const alt = "ToWish: nuestra lista de deseos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ESTRELLA = "M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z";

const destello = (color: string, lado: number, estilo: React.CSSProperties) => (
  <svg width={lado} height={lado} viewBox="0 0 24 24" style={{ position: "absolute", ...estilo }}>
    <path d={ESTRELLA} fill={color} />
  </svg>
);

const BADGE = "Nuestra lista de deseos";

// El mismo icono del favicon. El PNG es un cuadrado de 512 px con el logo "TW" en x 139–372, y 211–304:
// se dibuja escalado dentro de un marco que recorta el margen blanco
const ESCALA = 1.5;
const LOGO = { x: 133, y: 205, ancho: 246, alto: 106 }; // con 6 px de margen para no cortar los bordes
const SUBTITULO = "Los planes que queremos hacer juntos";

// Las fuentes de la app, solo con las letras que hacen falta (se descargan al compilar).
// Cada texto necesita su fuente explícita: si no, se mezclarían glifos de una y otra.
async function fuente(familia: string, peso: number, texto: string) {
  const css = await (
    await fetch(
      `https://fonts.googleapis.com/css2?family=${familia.replace(/ /g, "+")}:wght@${peso}&text=${encodeURIComponent(texto)}`,
    )
  ).text();
  const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
  if (!url) throw new Error(`No se ha podido cargar ${familia}`);
  return (await fetch(url)).arrayBuffer();
}

export default async function Imagen() {
  const icono = await readFile(join(process.cwd(), "public/web-app-manifest-512x512.png"), "base64");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          color: "#3d3346",
          fontFamily: "Manrope",
        }}
      >
        {destello("#ffafcc", 90, { top: 40, left: 90 })}
        {destello("#a2d2ff", 60, { top: 36, right: 96 })}
        {destello("#cdb4db", 48, { bottom: 24, left: 120 })}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "56px 96px 64px",
            border: "3px solid #3d3346",
            borderRadius: 40,
            background: "#ffffff",
            boxShadow: "18px 18px 0 #ffafcc",
          }}
        >
          <div
            style={{
              display: "flex",
              padding: "8px 28px",
              border: "2px solid #3d3346",
              borderRadius: 999,
              fontSize: 30,
            }}
          >
            {BADGE}
          </div>
          <div
            style={{
              display: "flex",
              position: "relative",
              overflow: "hidden",
              marginTop: 34,
              width: LOGO.ancho * ESCALA,
              height: LOGO.alto * ESCALA,
            }}
          >
            <img
              src={`data:image/png;base64,${icono}`}
              alt=""
              width={512 * ESCALA}
              height={512 * ESCALA}
              style={{ position: "absolute", left: -LOGO.x * ESCALA, top: -LOGO.y * ESCALA }}
            />
          </div>
          <div style={{ display: "flex", marginTop: 22, fontFamily: "JetBrains Mono", fontSize: 72, fontWeight: 800 }}>
            ToWish
          </div>
          <div style={{ display: "flex", marginTop: 6, fontSize: 36, color: "#7a6f85" }}>
            {SUBTITULO}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "JetBrains Mono", data: await fuente("JetBrains Mono", 800, "ToWish"), weight: 800, style: "normal" },
        { name: "Manrope", data: await fuente("Manrope", 500, BADGE + SUBTITULO), weight: 500, style: "normal" },
      ],
    },
  );
}
