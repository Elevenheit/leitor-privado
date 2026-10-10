"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="access-screen">
      <section className="access-card" aria-labelledby="page-error-title">
        <Link className="access-brand" href="/" aria-label="Nook, início">
          nook<span>.</span>
        </Link>
        <p className="eyebrow">Não foi possível abrir esta página</p>
        <h1 id="page-error-title">Vamos tentar de novo?</h1>
        <p className="access-copy" role="alert">
          Algo interrompeu o carregamento. Tente novamente ou volte para o
          início.
        </p>
        <div className="state-actions">
          <button className="primary-button" onClick={reset}>
            <RefreshCw size={18} aria-hidden="true" /> Tentar novamente
          </button>
          <Link className="secondary-button" href="/">
            Ir para o início
          </Link>
        </div>
      </section>
    </main>
  );
}
