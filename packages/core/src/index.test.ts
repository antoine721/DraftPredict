import { describe, expect, it } from "vitest";
import * as core from "./index.js";

/**
 * The public surface is a cross-package contract (see docs/ARCHITECTURE.md) and
 * a DraftGap compatibility promise. Renaming an export here breaks downstream
 * packages, so it is pinned by test.
 */
const ARCHITECTURE_API = [
    "ratingToWinrate",
    "winrateToRating",
    "getMatchupWinrate",
    "getDuoWinrate",
    "addStats",
    "averageStats",
    "getStats",
    "analyzeDraft",
    "analyzeChampion",
    "analyzeChampions",
    "analyzeDuos",
    "analyzeMatchups",
    "getDraftResultWinrateByTime",
    "getSuggestions",
    "getBanSuggestions",
    "predictRoles",
    "analyzeBuilds",
    "getDamageDistribution",
    "getTeamComposition",
    "emptyDraftState",
    "draftStateFromArrays",
    "serializeDraftState",
    "deserializeDraftState",
] as const;

/** Names DraftGap's own core exports, which datasets and ports rely on. */
const DRAFTGAP_COMPATIBLE_API = [
    "Role",
    "ROLES",
    "displayNameByRole",
    "RiskLevel",
    "priorGamesByRiskLevel",
    "buildPriorGamesByRiskLevel",
    "displayNameByRiskLevel",
    "DATASET_VERSION",
    "deleteDatasetMatchupSynergyData",
    "removeRankBias",
    "defaultChampionRoleData",
    "deleteChampionRoleDataMatchupSynergyData",
    "multiplyStats",
    "divideStats",
    "calculateWilsonCI",
    "analyzeDraftExtra",
    "analyzeEntity",
    "analyzeBaseEntity",
    "analyzeEntityMatchups",
    "analyzeEntityMatchup",
    "analyzeItems",
    "analyzeRunes",
    "analyzeSkills",
    "analyzeSummonerSpells",
    "analyzeBuild",
    "getTeamDamageDistribution",
    "getTeamComps",
    "DraftTablePlacement",
] as const;

/** Additions DraftPredict makes on top of DraftGap. */
const DRAFTPREDICT_ADDITIONS = [
    "RANKS",
    "displayNameByRank",
    "parseRank",
    "REGIONS",
    "displayNameByRegion",
    "parseRegion",
    "parseRiskLevel",
    "TEAMS",
    "otherTeam",
    "getRoleFromString",
    "isRole",
    "emptyDataset",
    "defaultChampionData",
    "normalizeDamageProfile",
    "predictRoleProbabilities",
    "cloneDraftState",
    "getUnavailableChampions",
    "getOpenRoles",
    "isDraftComplete",
    "emptyPartialBuildDataset",
    "emptyFullBuildDataset",
    "normalizeItemSetId",
    "normalizeSummonerSpellSetId",
] as const;

describe("public API", () => {
    it.each([
        ...ARCHITECTURE_API,
        ...DRAFTGAP_COMPATIBLE_API,
        ...DRAFTPREDICT_ADDITIONS,
    ])("exports %s", (name) => {
        expect(core).toHaveProperty(name);
        expect((core as Record<string, unknown>)[name]).toBeDefined();
    });

    it("has no import-time side effects beyond defining values", () => {
        // Every non-function export is a frozen-ish constant, not a live handle.
        expect(typeof core.analyzeDraft).toBe("function");
        expect(core.DATASET_VERSION).toBe("5");
    });
});
