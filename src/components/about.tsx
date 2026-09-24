"use client";
import Link from "next/link";
export function About({ onClose }: { onClose?: () => void }) {
  return (
    <main className="welcome">
      <span className="logo">
        nook<span className="logo-dot">.</span>
      </span>
      <span className="eyebrow">Seu próximo capítulo começa aqui</span>
      <h1>
        Histórias para
        <br />
        ficar mais um pouco.
      </h1>
      <p>
        Um cantinho compartilhado para ler, assistir e conversar. Escolha uma
        história. O resto pode esperar.
      </p>
      <div className="category-grid">
        {["Light Novels", "Mangás", "Manhwas", "Animes"].map((x) => (
          <article key={x}>
            <h2>{x}</h2>
          </article>
        ))}
      </div>
      <div className="welcome-notes">
        <p>
          <strong>Do ponto em que parou.</strong>
          <br />
          Sua leitura e seus episódios acompanham sua conta.
        </p>
        <p>
          <strong>Uma história, muitas conversas.</strong>
          <br />
          Encontre os comentários no final de cada obra. Esconda spoilers para
          cuidar da experiência de quem está chegando.
        </p>
      </div>
      <details>
        <summary>Como foi criado</summary>
        <p>
          Next.js, React e TypeScript; Supabase para contas, banco e arquivos
          privados; PDF.js para novels e fflate para CBZ.
        </p>
      </details>
      {onClose ? (
        <button className="primary-button" onClick={onClose}>
          Conhecer a biblioteca →
        </button>
      ) : (
        <Link className="primary-button" href="/">
          Conhecer a biblioteca →
        </Link>
      )}
    </main>
  );
}
