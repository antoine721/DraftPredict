import type { AnalyzeDraftConfig } from "../draft/analysis.js";
import type {
    FullBuildDataset,
    PartialBuildDataset,
} from "../models/build/BuildDataset.js";
import type { ItemsAnalysisResult } from "./item-analysis.js";
import { analyzeItems } from "./item-analysis.js";
import type { RunesAnalysisResult } from "./rune-analysis.js";
import { analyzeRunes } from "./rune-analysis.js";
import type { SkillsAnalysisResult } from "./skill-analysis.js";
import { analyzeSkills } from "./skill-analysis.js";
import type { SummonerSpellsAnalysisResult } from "./summoner-spell-analysis.js";
import { analyzeSummonerSpells } from "./summoner-spell-analysis.js";

export type BuildAnalysisResult = {
    runes: RunesAnalysisResult;
    items: ItemsAnalysisResult;
    summonerSpells: SummonerSpellsAnalysisResult;
    skills: SkillsAnalysisResult;
};

/**
 * Rates every item, rune, summoner spell and skill choice in a champion's
 * build, both standalone and against the specific enemy champions in
 * `fullBuildDataset.matchups`.
 */
export function analyzeBuild(
    partialBuildDataset: PartialBuildDataset,
    fullBuildDataset: FullBuildDataset,
    config: AnalyzeDraftConfig,
): BuildAnalysisResult {
    return {
        runes: analyzeRunes(partialBuildDataset, fullBuildDataset, config),
        items: analyzeItems(partialBuildDataset, fullBuildDataset, config),
        summonerSpells: analyzeSummonerSpells(
            partialBuildDataset,
            fullBuildDataset,
            config,
        ),
        skills: analyzeSkills(partialBuildDataset, fullBuildDataset, config),
    };
}

/** ARCHITECTURE-facing alias of {@link analyzeBuild}. */
export const analyzeBuilds = analyzeBuild;
