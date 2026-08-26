import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LiveSocketProvider } from "../../api/live";
import { createQueryClient } from "../../api/queries";
import type { ConfigResponse, PublicConfig } from "../../api";
import { AccountPanel } from "./AccountPanel";
import { AnalysisPanel } from "./AnalysisPanel";
import { CapabilityTable } from "./CapabilityTable";
import { ClientPanel } from "./ClientPanel";
import { DataPanel } from "./DataPanel";
import { DesktopPanel } from "./DesktopPanel";
import { InterfacePanel } from "./InterfacePanel";
import { RiotKeyPanel } from "./RiotKeyPanel";
import type { DesktopState } from "./hooks";

/**
 * The panels, rendered cold.
 *
 * Nothing has answered — no server, no socket, no League client, no Electron
 * shell — which is precisely the state this screen is judged on: it is where a
 * new user lands from every onboarding path. What matters in each assertion is
 * that the panel says something true about that emptiness rather than showing
 * an empty control.
 */

function html(node: ReactNode): string {
    const queryClient = createQueryClient();
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <LiveSocketProvider enabled={false}>
                <MemoryRouter>{node}</MemoryRouter>
            </LiveSocketProvider>
        </QueryClientProvider>,
    );
}

const config = (overrides: Partial<PublicConfig> = {}): PublicConfig => ({
    platform: "euw1",
    rank: "PLATINUM_PLUS",
    region: "ALL",
    riskLevel: "medium",
    minGames: 1000,
    ignoreChampionWinrates: false,
    lcuEnabled: true,
    allowRemoteDataset: true,
    datasetLocalRoot: null,
    language: "en_US",
    theme: "dark",
    hasRiotApiKey: false,
    riotApiKeyPreview: null,
    riotApiKeySource: null,
    configPath: "/home/moi/.draftpredict/config.json",
    ...overrides,
});

const configResponse = (overrides: Partial<PublicConfig> = {}): ConfigResponse => ({
    config: config(overrides),
    dataset: {
        providers: [
            "draftgap-remote: Public DraftGap datasets from https://bucket.draftgap.com",
            "bundled-fixture: Synthetic dataset generated offline",
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
            loadedAt: 1_787_745_643_449,
            offline: true,
        },
    },
    staticData: { version: "16.17.1", source: "bundled", language: "en_US" },
});

describe("RiotKeyPanel", () => {
    it("presents the missing key as a choice, not a failure", () => {
        const markup = html(<RiotKeyPanel config={config()} />);
        expect(markup).toContain("Aucune clé");
        expect(markup).toContain("Ajouter une clé");
        expect(markup).not.toContain("Retirer la clé");
        // The two ways to save are both offered from the first paint.
        expect(markup).toContain("Enregistrer et tester la clé");
        expect(markup).toContain("Enregistrer sans tester");
    });

    it("masks the field and never renders a key, only its preview", () => {
        const markup = html(
            <RiotKeyPanel
                config={config({
                    hasRiotApiKey: true,
                    riotApiKeyPreview: "RGAPI-****6789",
                    riotApiKeySource: "file",
                })}
            />,
        );
        expect(markup).toContain('type="password"');
        expect(markup).toContain("RGAPI-****6789");
        expect(markup).toContain("Retirer la clé");
        expect(markup).toContain("Afficher la clé saisie");
    });

    it("warns before an environment key is shadowed", () => {
        const markup = html(
            <RiotKeyPanel
                config={config({ hasRiotApiKey: true, riotApiKeySource: "env" })}
            />,
        );
        expect(markup).toContain("RIOT_API_KEY");
        expect(markup).toContain("Clé fournie par l&#x27;environnement");
    });

    it("spells out the 24 h expiry of a development key", () => {
        expect(html(<RiotKeyPanel config={config()} />)).toContain("24");
    });
});

describe("CapabilityTable", () => {
    it("separates what needs a key from what never did", () => {
        const markup = html(<CapabilityTable />);
        expect(markup).toContain("Sans clé d&#x27;API");
        expect(markup).toContain("Avec une clé d&#x27;API");
        expect(markup).toContain("Tableau de draft complet");
        expect(markup).toContain("Style de jeu");
    });
});

describe("AccountPanel", () => {
    it("offers the platform, the rank and the region separately", () => {
        const markup = html(<AccountPanel config={config()} />);
        expect(markup).toContain("Plateforme par défaut");
        expect(markup).toContain("Rang analysé");
        expect(markup).toContain("Région analysée");
        expect(markup).toContain("Europe Ouest — euw1");
    });

    it("keeps an unknown platform visible instead of silently picking another", () => {
        const markup = html(<AccountPanel config={config({ platform: "zzz9" })} />);
        expect(markup).toContain("zzz9 (inconnue)");
    });

    it("points at a region that does not match the account's shard", () => {
        const markup = html(
            <AccountPanel config={config({ platform: "kr", region: "EUW" })} />,
        );
        expect(markup).toContain("alors que les données sont filtrées");
    });
});

describe("AnalysisPanel", () => {
    it("shows the prior each risk level actually uses", () => {
        const markup = html(<AnalysisPanel config={config()} />);
        expect(markup).toContain("Équilibré");
        expect(markup).toContain("Parties minimum");
        expect(markup).toContain("prior");
    });

    it("says what the winrate toggle is currently doing", () => {
        expect(html(<AnalysisPanel config={config()} />)).toContain(
            "Inactif : le winrate propre",
        );
        expect(
            html(<AnalysisPanel config={config({ ignoreChampionWinrates: true })} />),
        ).toContain("Actif : seuls les duos");
    });
});

describe("ClientPanel", () => {
    it("admits the client state is unknown before the server answers", () => {
        const markup = html(<ClientPanel config={config()} />);
        expect(markup).toContain("État inconnu");
        expect(markup).toContain("Reconnecter");
    });

    it("states exactly what is read and what is never done", () => {
        const markup = html(<ClientPanel config={config()} />);
        expect(markup).toContain("Aucune écriture dans le client");
        expect(markup).toContain("Aucune automatisation");
        expect(markup).toContain("sélection des champions");
    });
});

describe("DataPanel", () => {
    it("names the provider that answered and flags the offline fixture", () => {
        const markup = html(<DataPanel config={configResponse()} />);
        expect(markup).toContain("Données de démonstration hors-ligne");
        expect(markup).toContain("A répondu");
        expect(markup).toContain("Jeu de données de démonstration fourni");
        expect(markup).toContain("173");
    });

    it("shows the static data patch and the local dataset path", () => {
        const markup = html(
            <DataPanel config={configResponse({ datasetLocalRoot: "/data/sets" })} />,
        );
        expect(markup).toContain("Patch 16.17.1");
        expect(markup).toContain("/data/sets");
        expect(markup).toContain("Retirer");
    });
});

describe("InterfacePanel", () => {
    it("marks the active theme for assistive technology", () => {
        const markup = html(<InterfacePanel />);
        // Server rendering reads the store's initial state: the dark default.
        expect(markup).toContain('aria-label="Thème de l&#x27;interface"');
        expect(markup.match(/aria-pressed="true"/g)?.length).toBe(2);
        expect(markup).toContain("Suggestions par rôle");
        expect(markup).toContain("Réinitialiser");
    });
});

describe("DesktopPanel", () => {
    const desktop: DesktopState = {
        bridge: {} as DesktopState["bridge"],
        info: {
            appVersion: "0.1.0",
            serverVersion: "0.1.0",
            electronVersion: "33.0.0",
            chromeVersion: "130.0.0",
            nodeVersion: "20.18.0",
            platform: "win32",
            arch: "x64",
            serverUrl: "http://127.0.0.1:4700",
            dev: false,
            overlay: false,
        },
        preferences: {
            startWithLeagueClient: true,
            autoShowOnChampSelect: true,
            preferOverlayInChampSelect: false,
            minimizeToTray: true,
        },
        update: {
            state: "available",
            currentVersion: "0.1.0",
            nextVersion: "0.2.0",
            message: null,
            checkedAt: Date.now(),
        },
        overlayVisible: false,
        error: null,
        busy: false,
        setPreference: async () => {},
        toggleOverlay: async () => {},
        checkForUpdates: async () => {},
    };

    it("reports the versions and the pending update", () => {
        const markup = html(<DesktopPanel desktop={desktop} />);
        expect(markup).toContain("0.1.0");
        expect(markup).toContain("Mise à jour disponible");
        expect(markup).toContain("version 0.2.0");
        expect(markup).toContain("Afficher la superposition");
        expect(markup).toContain("Démarrer avec le client League");
    });

    it("does not hide a bridge failure", () => {
        const markup = html(
            <DesktopPanel desktop={{ ...desktop, error: "canal indisponible" }} />,
        );
        expect(markup).toContain("canal indisponible");
    });
});
