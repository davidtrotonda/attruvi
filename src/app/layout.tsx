import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const suisseSans = Inter({
  variable: "--font-suisse",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.attruvi.com"),
  alternates: { canonical: "/" },
  title: "Attruvi — Atribución móvil de código abierto",
  description:
    "Conecta anuncios con instalaciones, compras e ingresos en React Native y envía mejores señales a Google Ads, Meta Ads y TikTok Ads.",
  applicationName: "Attruvi",
  keywords: [
    "atribución móvil",
    "React Native",
    "Google Ads",
    "Meta Ads",
    "TikTok Ads",
    "open source",
  ],
  icons: { icon: "/favicon.png", apple: "/favicon.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${suisseSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
