/* eslint-disable @next/next/no-img-element -- Covers use private signed URLs. */
import Link from "next/link";
import { formats, mediaHref } from "@/lib/catalog";
import type { Book, Series } from "@/lib/types";

export function SeriesHeader({ series, cover, continueBook, started }: {
  series: Series;
  cover: string;
  continueBook: Pick<Book, "id" | "media_type"> | null;
  started: boolean;
}) {
  return <section className="series-hero">
    <div className="series-hero-cover">{cover ? <img src={cover} alt={`Capa de ${series.title}`} /> : <span>✦</span>}</div>
    <div className="series-hero-copy">
      <span className="eyebrow">{formats[series.format]}</span>
      <h1>{series.title}</h1>
      <p>{series.description || "Esta história ainda não tem sinopse."}</p>
      {continueBook && <Link className="primary-button" href={mediaHref(continueBook)}>{started ? "Continuar" : "Começar"} →</Link>}
    </div>
  </section>;
}
