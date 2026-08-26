import { ROLES, type Role } from "@draftpredict/core";

/** Small pure helpers shared by every view. No React, no I/O, all testable. */

export function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return value < min ? min : value > max ? max : value;
}

/** `[0, 1, 2, 3, 4]`. */
export function range(length: number, start = 0): number[] {
    return Array.from({ length: Math.max(0, Math.trunc(length)) }, (_, i) => start + i);
}

export function uniq<T>(values: readonly T[]): T[] {
    return [...new Set(values)];
}

export function groupBy<T, K extends string | number>(
    values: readonly T[],
    key: (value: T) => K,
): Map<K, T[]> {
    const groups = new Map<K, T[]>();
    for (const value of values) {
        const group = key(value);
        const bucket = groups.get(group);
        if (bucket) bucket.push(value);
        else groups.set(group, [value]);
    }
    return groups;
}

/** Stable descending sort by a numeric selector (ties keep input order). */
export function sortByDesc<T>(values: readonly T[], score: (value: T) => number): T[] {
    return values
        .map((value, index) => ({ value, index }))
        .sort((a, b) => score(b.value) - score(a.value) || a.index - b.index)
        .map((entry) => entry.value);
}

/** `share(3, 12)` -> `0.25`; a zero total is `0`, never `NaN`. */
export function share(part: number, total: number): number {
    if (!Number.isFinite(part) || !Number.isFinite(total) || total === 0) return 0;
    return part / total;
}

/** `"Miss Fortune"` -> `"MF"`, `"Zed"` -> `"ZE"`. The avatar fallback. */
export function initials(name: string | null | undefined, max = 2): string {
    if (!name) return "?";
    const words = name
        .replace(/[^\p{L}\p{N} '’-]/gu, " ")
        .split(/[\s'’-]+/u)
        .filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) {
        return words[0]!.slice(0, max).toUpperCase();
    }
    return words
        .slice(0, max)
        .map((word) => word[0]!)
        .join("")
        .toUpperCase();
}

export function truncate(value: string, max: number): string {
    if (value.length <= max) return value;
    return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Accent- and case-insensitive normalisation, so "Kha'Zix", "khazix" and
 * "KHA ZIX" all match. Used by every local filter box.
 */
export function normalizeSearch(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, "")
        .toLowerCase();
}

/** `true` when `haystack` contains `needle` under {@link normalizeSearch}. */
export function matchesSearch(haystack: string, needle: string): boolean {
    const query = normalizeSearch(needle);
    if (query.length === 0) return true;
    return normalizeSearch(haystack).includes(query);
}

/** Trailing-edge debounce. Returns a callable with a `.cancel()`. */
export function debounce<A extends unknown[]>(
    fn: (...args: A) => void,
    waitMs: number,
): ((...args: A) => void) & { cancel: () => void } {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const wrapped = (...args: A): void => {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            fn(...args);
        }, waitMs);
    };
    wrapped.cancel = (): void => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
    };
    return wrapped;
}

/** Exponential backoff with full jitter, capped. Used by the WebSocket client. */
export function backoffDelay(
    attempt: number,
    baseMs = 500,
    maxMs = 15_000,
    random: () => number = Math.random,
): number {
    const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
    return Math.round(exponential / 2 + random() * (exponential / 2));
}

/** Roles as a plain array, so views never import `ROLES` themselves. */
export const ALL_ROLES: readonly Role[] = ROLES;

export function isRoleValue(value: unknown): value is Role {
    return (
        typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4
    );
}

/** `[[0,"266"],[2,"157"]]` -> `Map`. The wire format uses tuples everywhere. */
export function entriesToMap(entries: readonly [Role, string][]): Map<Role, string> {
    return new Map(entries);
}

/** `Map` -> `[[role, key]]`, ordered top → support (stable for URLs and diffs). */
export function mapToEntries(map: ReadonlyMap<Role, string>): [Role, string][] {
    return ALL_ROLES.flatMap((role) => {
        const key = map.get(role);
        return key === undefined ? [] : [[role, key] as [Role, string]];
    });
}

/** `undefined` when the value is empty, so it can be spread into a query. */
export function omitEmpty<T extends Record<string, unknown>>(value: T): Partial<T> {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (entry === undefined || entry === null || entry === "") continue;
        result[key] = entry;
    }
    return result as Partial<T>;
}
