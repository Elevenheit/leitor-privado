import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nook — Biblioteca privada",
  description: "Sua biblioteca privada de light novels.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" className="dark"><body className="min-h-screen antialiased">{children}</body></html>;
}
