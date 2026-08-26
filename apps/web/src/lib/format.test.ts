import { describe, expect, it } from "vitest";
import {
    NBSP,
    formatCount,
    formatDate,
    formatDatasetDate,
    formatDateTime,
    formatDuration,
    formatKda,
    formatMinutes,
    formatNumber,
    formatPercent,
    formatRank,
    formatRelativeTime,
    formatRiotId,
    formatRole,
    formatSigned,
    formatSignedPercent,
    formatTier,
    formatTimer,
    signOf,
    signedColorClass,
} from "./format";

describe("formatNumber", () => {
    it("groups thousands with a no-break space and uses a decimal comma", () => {
        expect(formatNumber(1234)).toBe(`1${NBSP}234`);
        expect(formatNumber(1234.56, 2)).toBe(`1${NBSP}234,56`);
        expect(formatNumber(-1234567)).toBe(`-1${NBSP}234${NBSP}567`);
        expect(formatNumber(0)).toBe("0");
    });

    it("returns an em dash for non-finite values", () => {
        expect(formatNumber(Number.NaN)).toBe("—");
        expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("—");
    });
});

describe("formatCount", () => {
    it("keeps small samples exact and compacts large ones", () => {
        expect(formatCount(842)).toBe("842");
        expect(formatCount(1200)).toBe(`1,2${NBSP}k`);
        expect(formatCount(12_400)).toBe(`12${NBSP}k`);
        expect(formatCount(1_240_000)).toBe(`1,24${NBSP}M`);
        expect(formatCount(24_000_000)).toBe(`24${NBSP}M`);
    });
});

describe("percentages", () => {
    it("formats a 0-1 ratio in French", () => {
        expect(formatPercent(0.5123)).toBe(`51,2${NBSP}%`);
        expect(formatPercent(0.5, 0)).toBe(`50${NBSP}%`);
    });

    it("signs deltas and marks a flat one with ±", () => {
        expect(formatSignedPercent(0.0324)).toBe(`+3,2${NBSP}%`);
        expect(formatSignedPercent(-0.0324)).toBe(`-3,2${NBSP}%`);
        expect(formatSignedPercent(0)).toBe(`±0,0${NBSP}%`);
        expect(formatSignedPercent(0.00001)).toBe(`±0,0${NBSP}%`);
    });

    it("signs raw ratings", () => {
        expect(formatSigned(-34.0658)).toBe("-34,07");
        expect(formatSigned(6.197)).toBe("+6,20");
        expect(formatSigned(0)).toBe("±0,00");
    });

    it("maps a sign onto a colour class", () => {
        expect(signedColorClass(0.01)).toBe("text-positive");
        expect(signedColorClass(-0.01)).toBe("text-negative");
        expect(signedColorClass(0)).toBe("text-ink-muted");
        expect(signOf(3)).toBe("+");
        expect(signOf(-3)).toBe("-");
        expect(signOf(0)).toBe("±");
    });
});

describe("durations", () => {
    it("formats seconds as m:ss and hours only when needed", () => {
        expect(formatDuration(1770)).toBe("29:30");
        expect(formatDuration(59)).toBe("0:59");
        expect(formatDuration(3903)).toBe("1:05:03");
        expect(formatDuration(-1)).toBe("—");
    });

    it("rounds a champ-select timer up to the next second", () => {
        expect(formatTimer(27_000)).toBe("0:27");
        expect(formatTimer(26_100)).toBe("0:27");
        expect(formatTimer(0)).toBe("0:00");
    });

    it("formats game length in minutes", () => {
        expect(formatMinutes(29.5)).toBe(`30${NBSP}min`);
    });
});

describe("ranks", () => {
    it("translates dataset ranks and Riot tiers", () => {
        expect(formatRank("PLATINUM_PLUS")).toBe("Platine+");
        expect(formatRank("EMERALD")).toBe("Émeraude");
        expect(formatRank("diamond-plus")).toBe("Diamant+");
        expect(formatRank(null)).toBe("Non classé");
    });

    it("builds a full ranked line and drops divisions for apex tiers", () => {
        expect(formatTier("EMERALD", "II", 46)).toBe(`Émeraude II (46${NBSP}LP)`);
        expect(formatTier("CHALLENGER", "I", 1204)).toBe(
            `Challenger (1${NBSP}204${NBSP}LP)`,
        );
        expect(formatTier(null)).toBe("Non classé");
    });
});

describe("roles", () => {
    it("uses the short French names players actually say", () => {
        expect(formatRole(0)).toBe("Top");
        expect(formatRole(3)).toBe("ADC");
        expect(formatRole(4)).toBe("Support");
        expect(formatRole(null)).toBe("—");
    });
});

describe("dates", () => {
    it("formats French dates and date-times", () => {
        const date = new Date(2026, 7, 26, 14, 5);
        expect(formatDate(date)).toBe("26 août 2026");
        expect(formatDateTime(date)).toBe("26 août 2026 à 14:05");
        expect(formatDate("pas une date")).toBe("—");
    });

    it("formats the dataset's YYYY-MM-DD day", () => {
        expect(formatDatasetDate("2026-08-26")).toBe("26 août 2026");
        expect(formatDatasetDate(null)).toBe("date inconnue");
    });

    it("formats relative times in both directions", () => {
        const now = new Date("2026-08-26T12:00:00Z").getTime();
        expect(formatRelativeTime(now - 10_000, now)).toBe("à l'instant");
        expect(formatRelativeTime(now - 3 * 3600 * 1000, now)).toBe(`il y a 3${NBSP}h`);
        expect(formatRelativeTime(now - 2 * 86_400 * 1000, now)).toBe(
            `il y a 2${NBSP}j`,
        );
        expect(formatRelativeTime(now + 2 * 86_400 * 1000, now)).toBe(`dans 2${NBSP}j`);
    });
});

describe("misc formatters", () => {
    it("joins a Riot ID", () => {
        expect(formatRiotId("Faker", "KR1")).toBe("Faker#KR1");
        expect(formatRiotId("Faker", null)).toBe("Faker");
        expect(formatRiotId(null, null)).toBe("—");
    });

    it("calls a deathless game perfect", () => {
        expect(formatKda(8, 3, 6)).toBe("4,67");
        expect(formatKda(8, 0, 6)).toBe("Parfait");
    });
});
