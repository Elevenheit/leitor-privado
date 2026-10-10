import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";

export default function NotFound() {
  return (
    <main id="main-content" className="access-screen">
      <section className="access-card">
        <Link className="access-brand" href="/" aria-label="Nook, início">
          nook<span>.</span>
        </Link>
        <div className="access-emblem" aria-hidden="true">
          <BookOpen size={26} />
        </div>
        <p className="state-code">404 · Página não encontrada</p>
        <h1>Vamos voltar à biblioteca?</h1>
        <p className="access-copy">
          Este endereço não está disponível. Você pode escolher outra história
          na biblioteca.
        </p>
        <div className="state-actions">
          <Link className="primary-button" href="/">
            <ArrowLeft size={18} aria-hidden="true" /> Ir para o início
          </Link>
        </div>
      </section>
    </main>
  );
}
