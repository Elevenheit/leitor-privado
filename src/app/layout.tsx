import type { Metadata } from "next";
import { Inter, Literata } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-ui-loaded" });
const literata = Literata({ subsets: ["latin"], display: "swap", variable: "--font-literary-loaded" });

export const metadata: Metadata = {
  title: "Nook — Biblioteca privada",
  description: "Sua biblioteca privada de light novels.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" className={`dark ${inter.variable} ${literata.variable}`}><body className="min-h-screen antialiased">{children}</body></html>;
}
