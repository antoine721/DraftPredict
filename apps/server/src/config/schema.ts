import { z } from "zod";
import { isRank, isRegion, isRiskLevel, parseRank, parseRegion, parseRiskLevel } from "@draftpredict/core";

/**
 * A Riot key looks like `RGAPI-` followed by a UUID, but Riot has shipped other
 * shapes over the years. The check is deliberately structural rather than
 * exact: enough to catch a pasted URL or an empty string, never strict enough
 * to reject a valid key the app could otherwise use.
 */
const RIOT_KEY_PATTERN = /^RGAPI-[A-Za-z0-9-]{16,}$/;

export function isRiotApiKeyShape(value: string): boolean {
    return RIOT_KEY_PATTERN.test(value.trim());
}

/** `RGAPI-****1234` — the only form of a key that may leave the server. */
export function previewRiotApiKey(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const tail = trimmed.slice(-4);
    const prefix = trimmed.startsWith("RGAPI-") ? "RGAPI-" : "";
    return `${prefix}****${tail}`;
}

const rankSchema = z
    .string()
    .transform((value) => parseRank(value))
    .refine((value): value is NonNullable<typeof value> => isRank(value), {
        message: "Unknown rank",
    });

const regionSchema = z
    .string()
    .transform((value) => parseRegion(value))
    .refine((value): value is NonNullable<typeof value> => isRegion(value), {
        message: "Unknown region",
    });

const riskLevelSchema = z
    .string()
    .transform((value) => parseRiskLevel(value))
    .refine((value): value is NonNullable<typeof value> => isRiskLevel(value), {
        message: "Unknown risk level (very-low | low | medium | high | very-high)",
    });

export { rankSchema, regionSchema, riskLevelSchema };

/** What may live in `~/.draftpredict/config.json`. Unknown keys are ignored. */
export const configFileSchema = z
    .object({
        riotApiKey: z.string().nullable().optional(),
        platform: z.string().min(2).optional(),
        rank: rankSchema.optional(),
        region: regionSchema.optional(),
        riskLevel: riskLevelSchema.optional(),
        minGames: z.number().int().min(0).max(1_000_000).optional(),
        ignoreChampionWinrates: z.boolean().optional(),
        lcuEnabled: z.boolean().optional(),
        allowRemoteDataset: z.boolean().optional(),
        datasetLocalRoot: z.string().nullable().optional(),
        language: z.string().min(2).optional(),
        theme: z.enum(["dark", "light", "system"]).optional(),
    })
    .strip();

export type ConfigFileInput = z.infer<typeof configFileSchema>;

/**
 * `POST /api/config` body. Every field is optional — the UI patches one
 * setting at a time. `riotApiKey: null` clears the stored key.
 */
export const configUpdateSchema = configFileSchema
    .extend({
        /** Skip the live probe (useful offline, or in tests). */
        validateKey: z.boolean().optional(),
    })
    .strip();

export type ConfigUpdateInput = z.infer<typeof configUpdateSchema>;
