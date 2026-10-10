"use client";
import { AuthGate } from "@/components/auth-gate";
import { Nav } from "@/components/nav";
import { RecentHistory } from "@/components/recent-history";
export default function ContinuePage() {
  return (
    <AuthGate>
      {(user) => (
        <>
          <Nav />
          <main
            id="main-content"
            tabIndex={-1}
            className="dashboard beta-dashboard history-page"
          >
            <header className="catalog-heading">
              <span className="eyebrow">Seu ritmo, suas histórias</span>
              <h1>Continuar lendo</h1>
              <p className="muted">
                Suas leituras em andamento, com o histórico completo sempre
                disponível.
              </p>
            </header>
            <RecentHistory userId={user.id} full />
          </main>
        </>
      )}
    </AuthGate>
  );
}
