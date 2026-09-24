import type { ReaderIllustration } from "@/lib/reader-illustrations";

export function InlineIllustration({ illustration }: { illustration: ReaderIllustration }) {
  return <figure className="inline-illustration">
    {/* Object URLs come from decoded PDF images and cannot use Next's image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={illustration.src} width={illustration.width} height={illustration.height} alt={`Ilustração extraída da página ${illustration.page}`} loading="lazy" decoding="async"/>
  </figure>;
}
