import type { AnalyzeDraftConfig } from "../draft/analysis.js";
import type {
    EntityStats,
    FullBuildDataset,
    PartialBuildDataset,
} from "../models/build/BuildDataset.js";
import type { EntityAnalysisResult } from "./entity-analysis.js";
import { analyzeEntity } from "./entity-analysis.js";

export type ItemsAnalysisResult = {
    boots: Record<string, EntityAnalysisResult>;
    statsByOrder: Record<string, EntityAnalysisResult>[];
    startingSets: Record<string, EntityAnalysisResult>;
    sets: Record<string, EntityAnalysisResult>;
};

/** Order index (0-based), or one of the aggregate buckets. */
export type ItemType = number | "boots" | "startingSets" | "sets";

export type ItemEntity = {
    id: number | string;
    type: ItemType;
};

export function analyzeItems(
    partialBuildDataset: PartialBuildDataset,
    fullBuildDataset: FullBuildDataset,
    config: AnalyzeDraftConfig,
): ItemsAnalysisResult {
    return {
        boots: Object.keys(partialBuildDataset.items.boots).reduce(
            (acc, itemId) => {
                acc[itemId] = analyzeEntity(
                    partialBuildDataset,
                    fullBuildDataset,
                    config,
                    getItemStats,
                    {
                        type: "boots",
                        id: parseInt(itemId),
                    },
                );
                return acc;
            },
            {} as Record<string, EntityAnalysisResult>,
        ),
        statsByOrder: partialBuildDataset.items.statsByOrder.map((stats, i) => {
            return Object.keys(stats).reduce(
                (acc, itemId) => {
                    acc[itemId] = analyzeEntity(
                        partialBuildDataset,
                        fullBuildDataset,
                        config,
                        getItemStats,
                        {
                            type: i,
                            id: parseInt(itemId),
                        },
                    );
                    return acc;
                },
                {} as Record<string, EntityAnalysisResult>,
            );
        }),
        startingSets: Object.keys(partialBuildDataset.items.startingSets).reduce(
            (acc, setId) => {
                acc[setId] = analyzeEntity(
                    partialBuildDataset,
                    fullBuildDataset,
                    config,
                    getItemStats,
                    {
                        type: "startingSets",
                        id: setId,
                    },
                );
                return acc;
            },
            {} as Record<string, EntityAnalysisResult>,
        ),
        sets: {},
    };
}

export function getItemStats(data: PartialBuildDataset, item: ItemEntity): EntityStats {
    switch (item.type) {
        case "boots":
            return data.items.boots[item.id] ?? { wins: 0, games: 0 };
        case "sets":
            return data.items.sets[item.id] ?? { wins: 0, games: 0 };
        case "startingSets":
            return data.items.startingSets[item.id] ?? { wins: 0, games: 0 };
        default:
            return (
                data.items.statsByOrder[item.type]?.[item.id] ?? {
                    wins: 0,
                    games: 0,
                }
            );
    }
}
