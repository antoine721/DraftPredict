import { z } from "zod";
import type { Rank, Region, Role } from "@draftpredict/core";
import { rankSchema, regionSchema, riskLevelSchema } from "../config/schema.js";

/**
 * Query-string parsing.
 *
 * Everything arrives as a string, so numbers and booleans are coerced here and
 * nowhere else; `refresh=1`, `refresh=true` and `refresh` all mean the same
 * thing, because that is what people type.
 */

export const booleanQuery = z
    .union([z.boolean(), z.string()])
    .transform((value) =>
        typeof value === "boolean"
            ? value
            : ["1", "true", "yes", "on", ""].includes(value.toLowerCase()),
    );

export const datasetQuerySchema = z
    .object({
        rank: rankSchema.optional(),
        region: regionSchema.optional(),
        patch: z.string().min(1).optional(),
        window: z.enum(["patch", "full"]).optional(),
    })
    .strip();

export type DatasetQuery = {
    rank?: Rank;
    region?: Region;
    patch?: string;
    window?: "patch" | "full";
};

export const analyzeConfigQuerySchema = z
    .object({
        riskLevel: riskLevelSchema.optional(),
        minGames: z.coerce.number().int().min(0).max(1_000_000).optional(),
        ignoreChampionWinrates: booleanQuery.optional(),
    })
    .strip();

/** `TOP`, `top`, `mid`, `2`… — every spelling the UI might send. */
export const roleQuerySchema = z
    .union([z.coerce.number().int().min(0).max(4), z.string()])
    .transform((value, ctx): Role => {
        if (typeof value === "number") return value as Role;
        const parsed = roleFromName(value);
        if (parsed === undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Unknown role: ${value}`,
            });
            return 0 as Role;
        }
        return parsed;
    });

function roleFromName(value: string): Role | undefined {
    const numeric = Number.parseInt(value, 10);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 4) {
        return numeric as Role;
    }
    const names: Record<string, Role> = {
        top: 0,
        jungle: 1,
        jgl: 1,
        jg: 1,
        middle: 2,
        mid: 2,
        bottom: 3,
        bot: 3,
        adc: 3,
        support: 4,
        supp: 4,
        sup: 4,
        utility: 4,
    };
    return names[value.trim().toLowerCase()];
}

export { roleFromName };
