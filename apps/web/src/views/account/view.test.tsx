import { renderToStaticMarkup } from "react-dom/server";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LiveSocketProvider } from "../../api/live";
import { createQueryClient } from "../../api/queries";
import { ROUTES } from "../../app/routes";
import AccountView from "./AccountView";

/**
 * The whole view, mounted, with nothing answering.
 *
 * No server, no socket, no League Client, no Riot key — which is exactly the
 * state of a fresh install, and the state this screen has to be *good* in.
 * zustand serves its *initial* state during server rendering, so this file
 * can only ever assert the cold start — no account connected, both connection
 * paths offered, the key explained rather than thrown. The connected
 * dashboard is covered in `components.test.tsx`, where each panel is handed
 * its data directly.
 */
function render(path = ROUTES.account.path): string {
    const queryClient = createQueryClient();
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <LiveSocketProvider enabled={false}>
                <MemoryRouter initialEntries={[path]}>
                    <Routes>
                        <Route path={ROUTES.account.path} element={<AccountView />} />
                    </Routes>
                </MemoryRouter>
            </LiveSocketProvider>
        </QueryClientProvider>,
    );
}

describe("AccountView", () => {
    it("opens on the connection screen when no account is connected", () => {
        const html = render();
        expect(html).toContain("Compte");
        expect(html).toContain("Connectez votre compte League of Legends");
        expect(html).toContain("Détection automatique");
        expect(html).toContain("Riot ID");
    });

    it("offers the client path first and says it needs no key", () => {
        const html = render();
        expect(html).toContain("aucune clé d&#x27;API nécessaire");
        // Nothing has answered, so the honest status is "not detected".
        expect(html).toContain("Client non détecté");
        expect(html).toContain("Chercher à nouveau");
    });

    it("explains the Riot key instead of reporting a 428 as an error", () => {
        const html = render();
        expect(html).toContain("Ajoutez une clé d&#x27;API Riot pour aller plus loin");
        expect(html).toContain("Le client League of Legends fonctionne sans clé.");
        expect(html).toContain('href="/parametres"');
    });

    it("disables the Riot ID lookup while no key is configured", () => {
        const html = render();
        expect(html).toContain("Clé requise");
        expect(html).toContain("Rechercher ce compte");
        expect(html).toMatch(/Rechercher ce compte[\s\S]{0,40}<\/button>/);
        expect(html).toContain("disabled");
    });

    it("gives the Riot ID field a region selector and a labelled input", () => {
        const html = render();
        expect(html).toContain('aria-label="Riot ID au format Nom#TAG"');
        expect(html).toContain('aria-label="Région du compte"');
        expect(html).toContain("EUW — Europe de l&#x27;Ouest");
        expect(html).toContain("KR — Corée");
    });

    it("says out loud that nothing is stored beyond an identity", () => {
        const html = render();
        expect(html).toContain("Rechercher ce compte");
        expect(html).not.toContain("RGAPI");
    });
});
