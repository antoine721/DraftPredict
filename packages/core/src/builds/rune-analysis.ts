import type { AnalyzeDraftConfig } from "../draft/analysis.js";
import type {
    EntityStats,
    FullBuildDataset,
    PartialBuildDataset,
    RunesBuildData,
} from "../models/build/BuildDataset.js";
import type { RuneEntityType } from "../models/build/BuildEntity.js";
import type { EntityAnalysisResult } from "./entity-analysis.js";
import { analyzeEntity } from "./entity-analysis.js";

export const RUNE_TYPES = [
    "primary",
    "secondary",
    "shard-offense",
    "shard-defense",
    "shard-flex",
] as const;

export type RuneType = RuneEntityType;

export type RunesAnalysisResult = {
    primary: Record<string, EntityAnalysisResult>;
    secondary: Record<string, EntityAnalysisResult>;
    shards: {
        offense: Record<string, EntityAnalysisResult>;
        defense: Record<string, EntityAnalysisResult>;
        flex: Record<string, EntityAnalysisResult>;
    };
};

export function analyzeRunes(
    partialBuildDataset: PartialBuildDataset,
    fullBuildDataset: FullBuildDataset,
    config: AnalyzeDraftConfig,
): RunesAnalysisResult {
    const analyze = (runeType: RuneType) => {
        const runeIds = Object.keys(
            getRuneStatsMap(partialBuildDataset.runes, runeType),
        );
        return runeIds.reduce(
            (result, runeId) => {
                const runeIdNumber = parseInt(runeId);
                result[runeId] = analyzeEntity(
                    partialBuildDataset,
                    fullBuildDataset,
                    config,
                    getRuneStats,
                    {
                        type: runeType,
                        id: runeIdNumber,
                    },
                );
                return result;
            },
            {} as Record<string, EntityAnalysisResult>,
        );
    };

    return {
        primary: analyze("primary"),
        secondary: analyze("secondary"),
        shards: {
            offense: analyze("shard-offense"),
            defense: analyze("shard-defense"),
            flex: analyze("shard-flex"),
        },
    };
}

export function getRuneStatsMap(
    runeBuildData: RunesBuildData,
    runeType: RuneType,
): Record<string, EntityStats> {
    switch (runeType) {
        case "primary":
            return runeBuildData.primary;
        case "secondary":
            return runeBuildData.secondary;
        case "shard-offense":
            return runeBuildData.shards.offense;
        case "shard-defense":
            return runeBuildData.shards.defense;
        case "shard-flex":
            return runeBuildData.shards.flex;
    }
}

export function getRuneStats(
    data: PartialBuildDataset,
    rune: { type: RuneType; id: number },
): EntityStats {
    return getRuneStatsMap(data.runes, rune.type)[rune.id];
}
