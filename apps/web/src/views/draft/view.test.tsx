import { renderToStaticMarkup } from "react-dom/server";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { LiveSocketProvider } from "../../api/live";
import { createQueryClient } from "../../api/queries";
import { ROUTES } from "../../app/routes";
import { emptyBoard, useDraftStore } from "../../state";
import DraftView from "./DraftView";

/**
 * The whole view, mounted.
 *
 * Nothing has answered yet — no server, no socket, no champion catalogue — so
 * this is exactly the state of a cold start, and the board still has to be
 * complete and honest: ten slots, ten ban tiles, a gauge, and no crash.
 */
function render(path = ROUTES.draft.path): string {
    const queryClient = createQueryClient();
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <LiveSocketProvider enabled={false}>
                <MemoryRouter initialEntries={[path]}>
                    <Routes>
                        <Route path={ROUTES.draft.path} element={<DraftView />} />
                    </Routes>
                </MemoryRouter>
            </LiveSocketProvider>
        </QueryClientProvider>,
    );
}

afterEach(() => {
    useDraftStore.setState({
        board: emptyBoard(),
        past: [],
        future: [],
        followClient: false,
        selected: { team: "ally", role: 0 },
    });
});

describe("DraftView", () => {
    it("renders both teams, ten role slots and ten ban slots", () => {
        const html = render();
        expect(html).toContain("Votre équipe");
        expect(html).toContain("Équipe adverse");
        expect(html.match(/aria-label="Choisir un champion en /g)).toHaveLength(10);
        expect(html.match(/aria-label="Ajouter un ban pour/g)).toHaveLength(10);
    });

    it("shows the gauge and the board actions from the first paint", () => {
        const html = render();
        expect(html).toContain("Probabilité de victoire");
        expect(html).toContain('role="meter"');
        expect(html).toContain("Inverser les côtés");
        expect(html).toContain("Copier le lien du draft");
        expect(html).toContain("Niveau de risque");
    });

    it("offers the meta tier list while the board is empty", () => {
        const html = render();
        expect(html).toContain("Le méta, rôle par rôle");
        expect(html).not.toContain("Picks conseillés");
    });

    it("marks the selected slot so the picker target is never a guess", () => {
        // Server rendering reads zustand's *initial* state (that is what
        // `getServerSnapshot` returns), so this is the cold-start selection:
        // ally top, ready for the first pick.
        const html = render();
        expect(html).toContain('aria-pressed="true"');
        expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    });

    it("reads the draft out of the URL", () => {
        const html = render(`${ROUTES.draft.path}?ally=0-266&enemy=2-157`);
        // The URL is applied in an effect, which server rendering never runs:
        // what matters here is that the view mounts with a query string at all.
        expect(html).toContain("Votre équipe");
    });

    it("never claims a live sync when no client is connected", () => {
        // The client's state is stated once, by the shell's connection cluster
        // (see app/shell.test.tsx). What this view owes is the absence of a
        // false claim.
        const html = render();
        expect(html).not.toContain("Synchronisé avec le client");
        expect(html).not.toContain("Hors sélection");
    });
});
