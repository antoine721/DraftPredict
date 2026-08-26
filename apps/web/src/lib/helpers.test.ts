import { describe, expect, it, vi } from "vitest";
import {
    ALL_ROLES,
    backoffDelay,
    clamp,
    debounce,
    entriesToMap,
    groupBy,
    initials,
    isRoleValue,
    mapToEntries,
    matchesSearch,
    normalizeSearch,
    omitEmpty,
    range,
    share,
    sortByDesc,
    truncate,
    uniq,
} from "./helpers";

describe("numbers", () => {
    it("clamps, including NaN", () => {
        expect(clamp(5, 0, 3)).toBe(3);
        expect(clamp(-5, 0, 3)).toBe(0);
        expect(clamp(Number.NaN, 0, 3)).toBe(0);
    });

    it("never divides by zero", () => {
        expect(share(3, 12)).toBe(0.25);
        expect(share(3, 0)).toBe(0);
    });

    it("builds ranges", () => {
        expect(range(5)).toEqual([0, 1, 2, 3, 4]);
        expect(range(3, 1)).toEqual([1, 2, 3]);
        expect(range(-1)).toEqual([]);
    });
});

describe("collections", () => {
    it("dedupes and groups", () => {
        expect(uniq([1, 1, 2])).toEqual([1, 2]);
        const grouped = groupBy([{ r: 0 }, { r: 1 }, { r: 0 }], (v) => v.r);
        expect(grouped.get(0)).toHaveLength(2);
        expect(grouped.get(1)).toHaveLength(1);
    });

    it("sorts descending and keeps ties stable", () => {
        const input = [
            { name: "a", rating: 1 },
            { name: "b", rating: 3 },
            { name: "c", rating: 1 },
        ];
        expect(sortByDesc(input, (v) => v.rating).map((v) => v.name)).toEqual([
            "b",
            "a",
            "c",
        ]);
        expect(input[0]!.name).toBe("a");
    });

    it("drops empty values from a query object", () => {
        expect(omitEmpty({ a: 1, b: undefined, c: null, d: "", e: "x" })).toEqual({
            a: 1,
            e: "x",
        });
    });
});

describe("strings", () => {
    it("derives avatar initials", () => {
        expect(initials("Miss Fortune")).toBe("MF");
        expect(initials("Zed")).toBe("ZE");
        expect(initials("Kai'Sa")).toBe("KS");
        expect(initials(null)).toBe("?");
    });

    it("truncates with an ellipsis", () => {
        expect(truncate("abcdef", 10)).toBe("abcdef");
        expect(truncate("abcdefghij", 5)).toBe("abcd…");
    });

    it("searches without accents or punctuation", () => {
        expect(normalizeSearch("Kha'Zix")).toBe("khazix");
        expect(matchesSearch("Chogath", "cho")).toBe(true);
        expect(matchesSearch("Émeraude", "emeraude")).toBe(true);
        expect(matchesSearch("Aatrox", "")).toBe(true);
        expect(matchesSearch("Aatrox", "zed")).toBe(false);
    });
});

describe("roles", () => {
    it("re-exports the five roles and validates them", () => {
        expect(ALL_ROLES).toEqual([0, 1, 2, 3, 4]);
        expect(isRoleValue(4)).toBe(true);
        expect(isRoleValue(5)).toBe(false);
        expect(isRoleValue("0")).toBe(false);
    });

    it("round-trips the wire format in role order", () => {
        const map = entriesToMap([
            [3, "22"],
            [0, "266"],
        ]);
        expect(mapToEntries(map)).toEqual([
            [0, "266"],
            [3, "22"],
        ]);
    });
});

describe("timing", () => {
    it("debounces trailing calls and can be cancelled", () => {
        vi.useFakeTimers();
        const spy = vi.fn();
        const debounced = debounce(spy, 100);
        debounced(1);
        debounced(2);
        vi.advanceTimersByTime(99);
        expect(spy).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(2);

        debounced(3);
        debounced.cancel();
        vi.advanceTimersByTime(1000);
        expect(spy).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });

    it("grows the reconnect backoff and caps it", () => {
        const half = () => 0.5;
        expect(backoffDelay(0, 500, 15_000, half)).toBe(375);
        expect(backoffDelay(1, 500, 15_000, half)).toBe(750);
        expect(backoffDelay(20, 500, 15_000, half)).toBe(11_250);
        expect(backoffDelay(20, 500, 15_000, () => 1)).toBe(15_000);
        expect(backoffDelay(20, 500, 15_000, () => 0)).toBe(7500);
    });
});
