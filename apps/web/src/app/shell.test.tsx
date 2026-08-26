import { renderToStaticMarkup } from "react-dom/server";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LiveSocketProvider } from "../api/live";
import { createQueryClient } from "../api/queries";
import { AppLayout } from "./AppLayout";
import { Toaster } from "./toast";
import { ROUTE_LIST, ROUTES, championPath } from "./routes";

/**
 * The shell, rendered end to end.
 *
 * This is the wiring test the four view agents depend on: the provider stack
 * must compose (query client → socket → router → layout), every view must be
 * reachable from the navigation, and the connection cluster must render even
 * when nothing has answered yet — no server runs during this test, so every
 * query is pending and every status is unknown. That is exactly the state a
 * cold start is in.
 */
function renderShell(path = ROUTES.draft.path): string {
    const queryClient = createQueryClient();
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <LiveSocketProvider enabled={false}>
                <MemoryRouter initialEntries={[path]}>
                    <Routes>
                        <Route element={<AppLayout />}>
                            {ROUTE_LIST.map((route) => (
                                <Route
                                    key={route.id}
                                    path={route.path}
                                    element={<p>contenu de {route.label}</p>}
                                />
                            ))}
                        </Route>
                    </Routes>
                </MemoryRouter>
                <Toaster />
            </LiveSocketProvider>
        </QueryClientProvider>,
    );
}

describe("app shell", () => {
    it("renders the outlet inside the layout", () => {
        expect(renderShell()).toContain("contenu de Draft");
    });

    it("links to all five views", () => {
        const html = renderShell();
        for (const route of ROUTE_LIST) {
            expect(html).toContain(`href="${route.path}"`);
            expect(html).toContain(route.label.replace("&", "&amp;"));
        }
    });

    it("titles the page with the active route", () => {
        const html = renderShell(ROUTES.settings.path);
        expect(html).toContain(ROUTES.settings.description);
        expect(html).toContain("contenu de Paramètres");
    });

    it("renders the connection cluster before anything has answered", () => {
        const html = renderShell();
        // No key configured yet -> the call to action, never a raw error.
        expect(html).toContain("Connecter mon compte");
        expect(html).toContain("Client inconnu");
        expect(html).toContain("Données…");
    });

    it("does not open a socket when the provider is disabled", () => {
        // Rendering must not require a WebSocket implementation at all.
        expect(() => renderShell()).not.toThrow();
    });
});

describe("routes", () => {
    it("keeps French paths and English identifiers", () => {
        expect(ROUTES.account.path).toBe("/compte");
        expect(ROUTES.settings.path).toBe("/parametres");
        expect(ROUTE_LIST.map((route) => route.id)).toEqual([
            "draft",
            "champions",
            "account",
            "live",
            "settings",
        ]);
    });

    it("builds champion links", () => {
        expect(championPath("266")).toBe("/champions/266");
        expect(championPath("266", 0)).toBe("/champions/266?role=0");
        expect(championPath(null)).toBe("/champions");
    });
});
