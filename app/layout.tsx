import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";

// Con subset cirílico para el ruso
const manrope = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-sans" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-mono" });

const descripcion = "Nuestra lista de deseos: los planes que queremos hacer juntos.";

export const metadata: Metadata = {
  // Netlify define URL en cada despliegue; hace falta para que la imagen de Open Graph tenga URL absoluta
  metadataBase: new URL(process.env.URL ?? "https://towish.netlify.app"),
  title: "ToWish",
  description: descripcion,
  applicationName: "ToWish",
  openGraph: {
    type: "website",
    siteName: "ToWish",
    title: "ToWish",
    description: descripcion,
    locale: "es_ES",
    alternateLocale: ["ru_RU", "it_IT"],
  },
  twitter: { card: "summary_large_image", title: "ToWish", description: descripcion },
  // Instalada en iPhone: pantalla completa y nombre bajo el icono
  appleWebApp: { capable: true, title: "ToWish", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${manrope.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
