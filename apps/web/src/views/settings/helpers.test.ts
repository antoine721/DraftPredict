import { describe, expect, it } from "vitest";
import { priorGamesByRiskLevel, RISK_LEVELS } from "@draftpredict/core";
import { PLATFORMS as RIOT_PLATFORMS } from "@draftpredict/riot";
import type { LcuStatus, PublicConfig, RiotKeyProbeResult } from "../../api";
import { formatNumber } from "../../lib";
import {
    clampInt,
    datasetSourceLabel,
    describeKeySource,
    describeLcu,
    describeProbe,
    keyFieldError,
    lcuNeedsRestart,
    looksLikeRiotKey,
    normalizeKeyInput,
    parseIntegerInput,
    parseProviderLine,
    platformLabel,
    providerLabel,
    regionForPlatform,
    riskPriorGames,
    riskSummary,
    visibleSections,
} from "./helpers";
import { PLATFORMS } from "./labels";

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

const status = (overrides: Partial<LcuStatus> = {}): LcuStatus => ({
    enabled: true,
    running: true,
    connected: false,
    polling: false,
    phase: null,
    inChampSelect: false,
    summoner: null,
    lastError: null,
    updatedAt: 1_787_745_588_839,
    ...overrides,
});

const probe = (
    overrides: Partial<RiotKeyProbeResult> & Pick<RiotKeyProbeResult, "status">,
): RiotKeyProbeResult => ({
    attempted: true,
    ok: overrides.status === "ok",
    message: "",
    ...overrides,
});

describe("Riot key input", () => {
    it("accepts a key pasted straight out of a .env file", () => {
        expect(normalizeKeyInput('  export RIOT_API_KEY="RGAPI-1111-2222-3333-4444" ')).toBe(
            "RGAPI-1111-2222-3333-4444",
        );
    });

    it("recognises the server's own key shape", () => {
        expect(looksLikeRiotKey("RGAPI-11111111-2222-3333-4444-555555555555")).toBe(true);
        expect(looksLikeRiotKey("RGAPI-short")).toBe(false);
        expect(looksLikeRiotKey("https://developer.riotgames.com/")).toBe(false);
    });

    it("says nothing while the field is empty, then explains what is wrong", () => {
        expect(keyFieldError("   ")).toBeNull();
        expect(keyFieldError("abcdef")).toContain("RGAPI-");
        expect(keyFieldError("RGAPI-123")).toContain("incomplète");
        expect(keyFieldError("RGAPI-11111111-2222-3333-4444-555555555555")).toBeNull();
    });
});

describe("describeProbe", () => {
    it("gives each probe outcome its own tone and sentence", () => {
        const reports = (["ok", "unauthorized", "unreachable", "skipped"] as const).map(
            (state) => describeProbe(probe({ status: state }))!,
        );
        expect(reports.map((report) => report.tone)).toEqual([
            "positive",
            "negative",
            "warning",
            "neutral",
        ]);
        expect(new Set(reports.map((report) => report.label)).size).toBe(4);
    });

    it("never claims a key was verified when Riot was unreachable", () => {
        const report = describeProbe(probe({ status: "unreachable" }))!;
        expect(report.detail).toContain("sans vérification");
        expect(report.tone).not.toBe("positive");
    });

    it("has nothing to say before a write", () => {
        expect(describeProbe(null)).toBeNull();
    });
});

describe("describeKeySource", () => {
    it("treats the absence of a key as a state, not a failure", () => {
        const report = describeKeySource(config());
        expect(report.tone).toBe("offline");
        expect(report.detail).toContain("draft");
    });

    it("warns that a key from the environment would be shadowed", () => {
        const report = describeKeySource(
            config({ hasRiotApiKey: true, riotApiKeySource: "env" }),
        );
        expect(report.tone).toBe("warning");
        expect(report.detail).toContain("RIOT_API_KEY");
    });

    it("names the file as the source of a stored key", () => {
        const report = describeKeySource(
            config({ hasRiotApiKey: true, riotApiKeySource: "file" }),
        );
        expect(report.tone).toBe("positive");
        expect(report.detail).toContain("fichier de configuration");
    });
});

describe("risk level", () => {
    it("uses the engine's own prior, not a copy", () => {
        for (const level of RISK_LEVELS) {
            expect(riskPriorGames(level)).toBe(priorGamesByRiskLevel[level]);
        }
    });

    it("quotes the prior in the sentence shown under the control", () => {
        expect(riskSummary("medium")).toContain(formatNumber(1000));
        expect(riskSummary("very-high")).toContain(formatNumber(250));
        expect(riskSummary("very-high")).not.toBe(riskSummary("very-low"));
    });
});

describe("dataset provenance", () => {
    it("splits a provider line into a French label and its description", () => {
        const parsed = parseProviderLine(
            "bundled-fixture: Synthetic dataset generated offline from the bundled champion list",
        );
        expect(parsed.id).toBe("bundled-fixture");
        expect(parsed.label).toBe("Jeu de données de démonstration fourni");
        expect(parsed.detail).toContain("synthétique");
    });

    it("keeps the server's own wording for a provider it does not know", () => {
        const parsed = parseProviderLine("mystery-provider: something new");
        expect(parsed.label).toBe("mystery-provider");
        expect(parsed.detail).toBe("something new");
    });

    it("labels the provider and the cache tier that answered", () => {
        expect(providerLabel("draftgap-remote")).toContain("DraftGap");
        expect(providerLabel(null)).toBe("Aucun");
        expect(datasetSourceLabel("disk")).toBe("cache disque");
        expect(datasetSourceLabel(null)).toBe("inconnue");
    });
});

describe("platforms", () => {
    it("stays in step with the routing table of @draftpredict/riot", () => {
        expect(PLATFORMS.map((entry) => entry.id)).toEqual(
            RIOT_PLATFORMS.map((entry) => entry.id),
        );
        expect(PLATFORMS.map((entry) => entry.code)).toEqual(
            RIOT_PLATFORMS.map((entry) => entry.code),
        );
    });

    it("marks a platform it does not know instead of inventing a name", () => {
        expect(platformLabel("euw1")).toBe("Europe Ouest (euw1)");
        expect(platformLabel("zzz9")).toContain("inconnue");
        expect(platformLabel(null)).toBe("Non définie");
    });

    it("maps a shard to the dataset region covering it", () => {
        expect(regionForPlatform("kr")).toBe("KR");
        expect(regionForPlatform("zzz9")).toBeNull();
    });
});

describe("describeLcu", () => {
    it("distinguishes disabled, searching and connected", () => {
        expect(describeLcu(status({ enabled: false })).label).toBe(
            "Intégration désactivée",
        );
        expect(describeLcu(status()).label).toBe("Client non détecté");
        expect(
            describeLcu(status({ connected: true, summoner: null })).tone,
        ).toBe("positive");
    });

    it("says who is logged in when the client answers", () => {
        const report = describeLcu(
            status({
                connected: true,
                phase: "ChampSelect",
                summoner: {
                    puuid: "p",
                    gameName: "Moi",
                    tagLine: "EUW",
                    displayName: "Moi",
                    summonerLevel: 340,
                    profileIconId: 5123,
                },
            }),
        );
        expect(report.detail).toContain("Moi");
        expect(report.detail).toContain("ChampSelect");
    });

    it("admits it knows nothing before the first answer", () => {
        expect(describeLcu(null).label).toBe("État inconnu");
    });

    it("spots a setting the running server cannot honour without a restart", () => {
        expect(lcuNeedsRestart(config({ lcuEnabled: true }), status({ enabled: false })))
            .toBe(true);
        expect(lcuNeedsRestart(config({ lcuEnabled: true }), status())).toBe(false);
        expect(lcuNeedsRestart(config({ lcuEnabled: false }), status({ enabled: false })))
            .toBe(false);
        expect(lcuNeedsRestart(null, null)).toBe(false);
    });
});

describe("numbers and sections", () => {
    it("clamps and parses without ever producing NaN", () => {
        expect(clampInt(12.7, 0, 10)).toBe(10);
        expect(clampInt(Number.NaN, 3, 10)).toBe(3);
        expect(parseIntegerInput("1 000")).toBe(1000);
        expect(parseIntegerInput("  ")).toBeNull();
        expect(parseIntegerInput("abc")).toBeNull();
    });

    it("hides the desktop section outside the desktop shell", () => {
        expect(visibleSections(false).some((section) => section.id === "bureau")).toBe(
            false,
        );
        expect(visibleSections(true).at(-1)?.id).toBe("bureau");
    });
});
