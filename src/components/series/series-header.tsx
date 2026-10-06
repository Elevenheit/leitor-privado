import Link from "next/link";
import { formats, mediaHref } from "@/lib/catalog";
import type { Book, Series } from "@/lib/types";
import { SeriesCover } from "./series-cover";

export function SeriesHeader({
  series,
  cover,
  continueBook,
  started,
  chapterCount,
  completedCount,
}: {
  series: Series;
  cover: string;
  continueBook: Pick<Book, "id" | "media_type"> | null;
  started: boolean;
  chapterCount?: number;
  completedCount?: number;
}) {
  return (
    <section className="series-hero">
      <div className="series-hero-cover" aria-hidden="true">
        <SeriesCover title={series.title} src={cover} />
      </div>
      <div className="series-hero-copy">
        <span className="eyebrow">{formats[series.format]}</span>
        <h1>{series.title}</h1>
        <p>{series.description || "Esta história ainda não tem sinopse."}</p>
        {chapterCount !== undefined && (
          <p className="series-reading-summary">
            {chapterCount} {chapterCount === 1 ? "arquivo" : "arquivos"} ·{" "}
            {completedCount || 0} concluídos
          </p>
        )}
        {continueBook && (
          <Link className="primary-button" href={mediaHref(continueBook)}>
            {started ? "Continuar" : "Começar"} →
          </Link>
        )}
      </div>
    </section>
  );
}
