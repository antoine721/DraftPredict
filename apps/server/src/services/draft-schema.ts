import { z } from "zod";
import type { AnalyzeDraftConfig, Dataset, Role, SerializedDraftState } from "@draftpredict/core";
import { deserializeDraftState, ROLES } from "@draftpredict/core";
import { ApiError } from "../errors.js";
import { rankSchema, regionSchema, riskLevelSchema } from "../config/schema.js";

/**
 * Wire format for a draft.
 *
 * Teams travel as `[role, championKey][]` because the engine works on `Map`s,
 * which JSON cannot represent — `serializeDraftState`/`deserializeDraftState`
 * in `@draftpredict/core` define the exact shape and are what this schema
 * validates into.
 */

const roleSchema = z
    .number()
    .int()
    .min(0, { message: "Role must be 0 (top) to 4 (support)" })
    .max(4, { message: "Role must be 0 (top) to 4 (support)" });

const championKeySchema = z
    .string()
    .trim()
    .min(1, { message: "Champion key must not be empty" })
    .regex(/^[0-9]+$/, { message: "Champion key must be the numeric key, as a string" });

const teamSchema = z
    .array(z.tuple([roleSchema, championKeySchema]))
    .max(5, { message: "A team holds at most 5 champions" })
    .default([]);

export const draftConfigSchema = z
    .object({
        riskLevel: riskLevelSchema.optional(),
        minGames: z.number().int().min(0).max(1_000_000).optional(),
        ignoreChampionWinrates: z.boolean().optional(),
    })
    .strip()
    .optional();

export const draftRequestSchema = z
    .object({
        team: teamSchema,
        enemy: teamSchema,
        bans: z
            .object({
                ally: z.array(championKeySchema).max(5).default([]),
                opponent: z.array(championKeySchema).max(5).default([]),
            })
            .strip()
            .default({ ally: [], opponent: [] }),
        config: draftConfigSchema,
        rank: rankSchema.optional(),
        region: regionSchema.optional(),
        patch: z.string().min(1).optional(),
    })
    .strip();

export type DraftRequest = z.infer<typeof draftRequestSchema>;

export const suggestionsRequestSchema = draftRequestSchema.extend({
    /** Suggestions per open role. Default 10. */
    limit: z.number().int().min(1).max(100).optional(),
    /** Restrict to these roles; default is every open ally role. */
    roles: z.array(roleSchema).max(5).optional(),
});

export type SuggestionsRequest = z.infer<typeof suggestionsRequestSchema>;

export const bansRequestSchema = draftRequestSchema.extend({
    limit: z.number().int().min(1).max(200).optional(),
});

export type BansRequest = z.infer<typeof bansRequestSchema>;

export type ValidatedDraft = {
    state: ReturnType<typeof deserializeDraftState>;
    serialized: SerializedDraftState;
};

/**
 * Semantic validation the schema cannot do on its own: a role may hold only one
 * champion, a champion may not be on both teams, and every key must exist in
 * the dataset actually being analysed.
 */
export function validateDraft(request: DraftRequest, dataset: Dataset): ValidatedDraft {
    const serialized: SerializedDraftState = {
        ally: request.team as [Role, string][],
        opponent: request.enemy as [Role, string][],
        bans: request.bans,
    };

    assertUniqueRoles(request.team, "team");
    assertUniqueRoles(request.enemy, "enemy");

    const allyChampions = new Set(request.team.map(([, key]) => key));
    const enemyChampions = new Set(request.enemy.map(([, key]) => key));

    if (allyChampions.size !== request.team.length) {
        throw ApiError.badRequest("The same champion is picked twice on team");
    }
    if (enemyChampions.size !== request.enemy.length) {
        throw ApiError.badRequest("The same champion is picked twice on enemy");
    }

    for (const key of allyChampions) {
        if (enemyChampions.has(key)) {
            throw new ApiError(
                400,
                "CHAMPION_ON_BOTH_TEAMS",
                `Champion ${key} cannot be on both teams`,
            );
        }
    }

    const unknown = [
        ...allyChampions,
        ...enemyChampions,
        ...request.bans.ally,
        ...request.bans.opponent,
    ].filter((key) => dataset.championData[key] === undefined);

    if (unknown.length > 0) {
        throw new ApiError(
            400,
            "UNKNOWN_CHAMPION",
            `Unknown champion key(s): ${[...new Set(unknown)].join(", ")}`,
            { championKeys: [...new Set(unknown)] },
        );
    }

    return { state: deserializeDraftState(serialized), serialized };
}

function assertUniqueRoles(entries: [number, string][], label: string): void {
    const seen = new Set<number>();
    for (const [role] of entries) {
        if (seen.has(role)) {
            throw new ApiError(
                400,
                "DUPLICATE_ROLE",
                `Role ${role} is filled twice on ${label}`,
            );
        }
        seen.add(role);
    }
}

/** Merges a request's `config` over the server defaults. */
export function resolveAnalyzeConfig(
    defaults: AnalyzeDraftConfig,
    override: DraftRequest["config"],
): AnalyzeDraftConfig {
    return {
        riskLevel: override?.riskLevel ?? defaults.riskLevel,
        minGames: override?.minGames ?? defaults.minGames,
        ignoreChampionWinrates:
            override?.ignoreChampionWinrates ?? defaults.ignoreChampionWinrates,
    };
}

export function openRoles(team: Map<Role, string>): Role[] {
    return ROLES.filter((role) => !team.has(role));
}
