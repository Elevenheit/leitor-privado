import { useState } from "react";
import { PdfNavigationPanel } from "../../src/components/reader/pdf-navigation-panel";

const params = new URLSearchParams(location.search);
const control = { pages: [], jumps: [], release: null };
window.__nookTest.pdfNavigation = control;
const pdf = {
  numPages: params.get("state") === "scan" ? 3 : 600,
  getOutline: async () => null,
  getPage: async (number) => {
    control.pages.push(number);
    return {
      view: [0, 0, 612, 792],
      getTextContent: async () => {
        if (params.get("state") === "slow")
          await new Promise((resolve) => {
            control.release = resolve;
          });
        return {
          items:
            params.get("state") === "scan"
              ? []
              : [
                  {
                    str: "archive ".repeat(250),
                    width: 500,
                    height: 12,
                    transform: [12, 0, 0, 12, 40, 700],
                    hasEOL: true,
                  },
                ],
        };
      },
    };
  },
};

export function PdfNavigationFixture() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <main
      className={`reader-app reader-theme-${params.get("theme") || "dark"}`}
    >
      <button onClick={() => setOpen(true)}>Abrir navegação</button>
      {open && (
        <PdfNavigationPanel
          pdf={pdf}
          currentPage={1}
          query={query}
          setQuery={setQuery}
          onJump={(page, result) => control.jumps.push({ page, result })}
          onClose={() => setOpen(false)}
        />
      )}
    </main>
  );
}
