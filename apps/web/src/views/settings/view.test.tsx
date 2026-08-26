import { renderToStaticMarkup } from "react-dom/server";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LiveSocketProvider } from "../../api/live";
import { createQueryClient } from "../../api/queries";
import { queryKeys } from "../../api/keys";
import type { ConfigResponse } from "../../api";
import { ROUTES } from "../../app/routes";
import SettingsView from "./SettingsView";

/**
 * The whole screen, mounted.
 *
 * Two starts are worth asserting: the one where the server has not answered
 * yet (a skeleton, not a wall of empty controls), and the one where it has and
 * nothing is configured — no key, no client, a synthetic dataset. That second
 * one is what a first-time user actually sees, so it has to be complete.
 */

const payload: ConfigResponse = {
    config: {
        platform: "euw1",
        rank: "PLATINUM_PLUS",
        region: "ALL",
        riskLevel: "medium",
        minGames: 1000,
        ignoreChampionWinrates: false,
        lcuEnabled: false,
        allowRemoteDataset: true,
        datasetLocalRoot: null,
        language: "en_US",
        theme: "dark",
        hasRiotApiKey: false,
        riotApiKeyPreview: null,
        riotApiKeySource: null,
        configPath: "/root/.draftpredict/config.json",
    },
    dataset: {
        providers: [
            "draftgap-remote: Public DraftGap datasets from https://bucket.draftgap.com",
            "bundled-fixture: Synthetic dataset generated offline from the bundled champion list",
        ],
        last: {
            rank: "PLATINUM_PLUS",
            region: "ALL",
            window: "patch",
            patch: null,
            provider: "bundled-fixture",
            source: "memory",
            version: "5",
            date: "2026-08-26",
            championCount: 173,
            loadedAt: 1_787_749_776_489,
            offline: true,
        },
    },
    staticData: { version: "16.17.1", source: "bundled", language: "en_US" },
};

function render(config: ConfigResponse | null, path = ROUTES.settings.path): string {
    const queryClient = createQueryClient();
    if (config) queryClient.setQueryData(queryKeys.config, config);
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <LiveSocketProvider enabled={false}>
                <MemoryRouter initialEntries={[path]}>
                    <Routes>
                        <Route path={ROUTES.settings.path} element={<SettingsView />} />
                    </Routes>
                </MemoryRouter>
            </LiveSocketProvider>
        </QueryClientProvider>,
    );
}

describe("SettingsView", () => {
    it("waits for the server instead of showing controls bound to nothing", () => {
        const markup = render(null);
        expect(markup).toContain(ROUTES.settings.label);
        expect(markup).not.toContain("Enregistrer et tester la clé");
    });

    it("renders every section once the configuration is known", () => {
        const markup = render(payload);
        for (const title of [
            "Clé API Riot",
            "Compte &amp; région",
            "Analyse",
            "Client League of Legends",
            "Données",
            "Interface",
        ]) {
            expect(markup).toContain(title);
        }
    });

    it("offers a jump link per section and hides the desktop one in a browser", () => {
        const markup = render(payload);
        expect(markup).toContain('href="#cle-api"');
        expect(markup).toContain('href="#donnees"');
        expect(markup).toContain('id="interface"');
        expect(markup).not.toContain("Application de bureau");
    });

    it("summarises the state of the three moving parts", () => {
        const markup = render(payload);
        expect(markup).toContain("Aucune clé d&#x27;API");
        // The client status query has not answered yet, and the strip says so
        // rather than inferring a connection from the stored setting.
        expect(markup).toContain("État inconnu");
        expect(markup).toContain("Jeu de données de démonstration fourni");
    });

    it("says where the server settings are stored", () => {
        expect(render(payload)).toContain("/root/.draftpredict/config.json");
    });

    it("labels the offline dataset as a demonstration, not as statistics", () => {
        const markup = render(payload);
        expect(markup).toContain("Données de démonstration hors-ligne");
        expect(markup).toContain("26 août 2026");
    });
});
