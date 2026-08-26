import type { Rank } from "../Rank.js";
import type { Region } from "../Region.js";
import type { RiskLevel } from "../../risk/risk-level.js";
import { DEFAULT_RANK } from "../Rank.js";
import { DEFAULT_REGION } from "../Region.js";
import { DEFAULT_RISK_LEVEL } from "../../risk/risk-level.js";

export type StatsSite = "op.gg" | "u.gg" | "lolalytics";

export const DraftTablePlacement = {
    Bottom: "bottom",
    Hidden: "hidden",
    InPlace: "in-place",
} as const;

export type DraftTablePlacement =
    (typeof DraftTablePlacement)[keyof typeof DraftTablePlacement];

export type DraftPredictConfig = {
    // DATASET
    rank: Rank;
    region: Region;

    // DRAFT ANALYSIS
    ignoreChampionWinrates: boolean;
    riskLevel: RiskLevel;
    minGames: number;

    // DRAFT SUGGESTIONS
    showFavouritesAtTop: boolean;
    banPlacement: DraftTablePlacement;
    unownedPlacement: DraftTablePlacement;
    showAdvancedWinrates: boolean;
    language: string;

    // MISC
    defaultStatsSite: StatsSite;
    enableBetaFeatures: boolean;

    // LOL CLIENT
    disableLeagueClientIntegration: boolean;
};

/** DraftGap-compatible alias. */
export type DraftGapConfig = DraftPredictConfig;

export const defaultConfig: DraftPredictConfig = {
    rank: DEFAULT_RANK,
    region: DEFAULT_REGION,

    ignoreChampionWinrates: false,
    riskLevel: DEFAULT_RISK_LEVEL,
    minGames: 1000,

    showFavouritesAtTop: true,
    banPlacement: DraftTablePlacement.Bottom,
    unownedPlacement: DraftTablePlacement.Bottom,
    showAdvancedWinrates: false,
    language: "en_US",

    defaultStatsSite: "lolalytics",
    enableBetaFeatures: false,

    disableLeagueClientIntegration: false,
};

export function getDefaultConfig(): DraftPredictConfig {
    return { ...defaultConfig };
}
