import type { AnalyzeDraftConfig } from "../draft/analysis.js";
import type {
    EntityStats,
    FullBuildDataset,
    PartialBuildDataset,
    Skill,
    SkillOrder,
} from "../models/build/BuildDataset.js";
import type { EntityAnalysisResult } from "./entity-analysis.js";
import { analyzeEntity } from "./entity-analysis.js";

export type SkillsAnalysisResult = {
    order: Record<SkillOrder, EntityAnalysisResult>;
    levels: Record<Skill, EntityAnalysisResult>[];
};

export function analyzeSkills(
    partialBuildDataset: PartialBuildDataset,
    fullBuildDataset: FullBuildDataset,
    config: AnalyzeDraftConfig,
): SkillsAnalysisResult {
    const skills = {
        levels: [] as Record<Skill, EntityAnalysisResult>[],
        order: {},
    } as SkillsAnalysisResult;

    for (const skill of Object.keys(partialBuildDataset.skills.order) as SkillOrder[]) {
        skills.order[skill] = analyzeEntity(
            partialBuildDataset,
            fullBuildDataset,
            config,
            getSkillOrderStats,
            skill,
        );
    }

    for (let i = 0; i < partialBuildDataset.skills.level.length; i++) {
        skills.levels.push({} as Record<Skill, EntityAnalysisResult>);
        for (const skill of Object.keys(
            partialBuildDataset.skills.level[i],
        ) as Skill[]) {
            skills.levels[i][skill] = analyzeEntity(
                partialBuildDataset,
                fullBuildDataset,
                config,
                getSkillLevelStats,
                {
                    level: i,
                    skill,
                },
            );
        }
    }

    return skills;
}

export function getSkillLevelStats(
    data: PartialBuildDataset,
    skill: { level: number; skill: Skill },
): EntityStats {
    return data.skills.level[skill.level]?.[skill.skill] ?? { wins: 0, games: 0 };
}

export function getSkillOrderStats(
    data: PartialBuildDataset,
    skillOrder: SkillOrder,
): EntityStats {
    return data.skills.order[skillOrder] ?? { wins: 0, games: 0 };
}
