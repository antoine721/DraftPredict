/**
 * How aggressively the engine trusts small samples. A lower risk level uses
 * more prior games, pulling estimates towards the expected winrate.
 */
export const RiskLevel = ["very-low", "low", "medium", "high", "very-high"] as const;

export type RiskLevel = (typeof RiskLevel)[number];

export const RISK_LEVELS: readonly RiskLevel[] = RiskLevel;

export const displayNameByRiskLevel: Record<RiskLevel, string> = {
    "very-low": "Very Low",
    low: "Low",
    medium: "Medium",
    high: "High",
    "very-high": "Very High",
};

/** Prior games used by draft analysis. */
export const priorGamesByRiskLevel: Record<RiskLevel, number> = {
    "very-low": 3000,
    low: 2000,
    medium: 1000,
    high: 500,
    "very-high": 250,
};

/** Prior games used by build analysis. */
export const buildPriorGamesByRiskLevel: Record<RiskLevel, number> = {
    "very-low": 3000,
    low: 2000,
    medium: 1000,
    high: 750,
    "very-high": 500,
};

export const DEFAULT_RISK_LEVEL: RiskLevel = "medium";

/** camelCase spellings accepted by the API layer. */
const ALIASES: Record<string, RiskLevel> = {
    verylow: "very-low",
    low: "low",
    medium: "medium",
    high: "high",
    veryhigh: "very-high",
};

export function isRiskLevel(value: unknown): value is RiskLevel {
    return (
        typeof value === "string" && (RiskLevel as readonly string[]).includes(value)
    );
}

/**
 * Accepts "very-high", "veryHigh", "VERY_HIGH", … and returns the canonical
 * kebab-case risk level, or `undefined` when unrecognised.
 */
export function parseRiskLevel(value: string): RiskLevel | undefined {
    return ALIASES[
        value
            .trim()
            .toLowerCase()
            .replace(/[\s_-]+/g, "")
    ];
}
