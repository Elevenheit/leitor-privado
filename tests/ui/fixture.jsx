import { createRoot } from "react-dom/client";
import { useState } from "react";
import { AuthGate } from "../../src/components/auth-gate";
import { Catalog } from "../../src/components/catalog";
import { Nav } from "../../src/components/nav";
import { SeriesHeader } from "../../src/components/series/series-header";
import { ChapterList } from "../../src/components/series/chapter-list";
import { ReaderToolbar } from "../../src/components/reader/reader-toolbar";
import { CbzReader } from "../../src/components/reader/cbz-reader";
import { DialogFocusManager } from "../../src/components/modals/dialog-focus-manager";
import ProfilePage from "../../src/app/profile/page";
import AdminPage from "../../src/app/admin/page";
import ManagePage from "../../src/app/manage/page";
import AdminSeriesPage from "../../src/app/admin/series/[id]/page";
import { books, series, user } from "./supabase.mjs";
const adminSeriesParams = Promise.resolve({ id: "work-0" });

function ReaderFixture() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setView] = useState("text");
  const [prefs, setPrefs] = useState({
    fontSize: 22,
    lineHeight: 1.85,
    textWidth: 760,
    theme: "dark",
    showIllustrations: true,
  });
  return (
    <div className={`reader-app reader-theme-${prefs.theme}`}>
      <ReaderToolbar
        {...prefs}
        mode={mode}
        setView={setView}
        previousId={null}
        nextId="book-1"
        setIndexOpen={() => {}}
        currentPage={2}
        pages={12}
        setBookmarksOpen={() => {}}
        focusMode={false}
        toggleFocusMode={() => {}}
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        updatePrefs={(change) => setPrefs((old) => ({ ...old, ...change }))}
      />
      <main id="main-content" tabIndex={-1} className="reader-scroll">
        <article
          className="continuous-document"
          style={{
            "--reader-width": `${prefs.textWidth}px`,
            "--reader-font-size": `${prefs.fontSize}px`,
            "--reader-line-height": prefs.lineHeight,
          }}
        >
          <div className="reflow-text">
            <h2>Capítulo 1 — Um lugar para voltar</h2>
            <p>
              Ela abriu o livro enquanto a chuva tocava a janela. Naquela
              biblioteca silenciosa, cada página parecia guardar um novo começo.
            </p>
          </div>
        </article>
      </main>
    </div>
  );
}
function Fixture() {
  const params = new URLSearchParams(location.search);
  const screen = params.get("screen") || "auth";
  if (screen === "profile") return <ProfilePage />;
  if (screen === "admin") return <AdminPage />;
  if (screen === "manager") return <ManagePage />;
  if (screen === "admin-work")
    return <AdminSeriesPage params={adminSeriesParams} />;
  if (screen === "reader") return <ReaderFixture />;
  if (screen === "cbz") return <CbzReader id="book-0" user={user} />;
  if (screen === "work")
    return (
      <>
        <Nav back />
        <main id="main-content" tabIndex={-1} className="series-page">
          <SeriesHeader
            series={series[0]}
            cover={params.has("cover") ? "/cover.png" : ""}
            continueBook={books[0]}
            started
          />
          <ChapterList
            books={books}
            volumes={[]}
            progress={[]}
            page={0}
            hasMore={false}
            onPageChange={() => {}}
          />
        </main>
      </>
    );
  if (screen === "auth") return <AuthGate>{() => null}</AuthGate>;
  return (
    <Catalog
      user={user}
      list={screen === "list"}
      format={screen === "category" ? "manga" : undefined}
    />
  );
}
createRoot(document.getElementById("root")).render(
  <>
    <DialogFocusManager />
    <Fixture />
  </>,
);
