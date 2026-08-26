import type { AnalyzeDraftConfig } from "../draft/analysis.js";
import type {
    EntityStats,
    FullBuildDataset,
    PartialBuildDataset,
} from "../models/build/BuildDataset.js";
import type { EntityAnalysisResult } from "./entity-analysis.js";
import { analyzeEntity } from "./entity-analysis.js";

export type SummonerSpellsAnalysisResult = Record<string, EntityAnalysisResult>;

export function analyzeSummonerSpells(
    partialBuildDataset: PartialBuildDataset,
    fullBuildDataset: FullBuildDataset,
    config: AnalyzeDraftConfig,
): SummonerSpellsAnalysisResult {
    const summonerSpells = {} as SummonerSpellsAnalysisResult;

    for (const spellSetId of Object.keys(partialBuildDataset.summonerSpells)) {
        summonerSpells[spellSetId] = analyzeEntity(
            partialBuildDataset,
            fullBuildDataset,
            config,
            getSummonerSpellStats,
            spellSetId,
        );
    }

    return summonerSpells;
}

export function getSummonerSpellStats(
    data: PartialBuildDataset,
    id: string,
): EntityStats {
    return data.summonerSpells[id] ?? { wins: 0, games: 0 };
}
