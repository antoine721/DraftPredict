/**
 * Deterministic randomness.
 *
 * The fixture generator has to produce byte-identical output for a given seed,
 * on every machine and every Node version, so it cannot use `Math.random()`.
 * mulberry32 is small, fast and exactly reproducible.
 */

export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export type Rng = {
    /** Uniform in [0, 1). */
    next(): number;
    /** Uniform integer in [min, max]. */
    int(min: number, max: number): number;
    /** Uniform float in [min, max). */
    float(min: number, max: number): number;
    /** True with probability `p`. */
    chance(p: number): boolean;
    pick<T>(values: readonly T[]): T;
    /** A shuffled copy of `values`. */
    shuffle<T>(values: readonly T[]): T[];
    /**
     * Approximately normal, mean 0, standard deviation 1 (Irwin-Hall with
     * n = 6 — plenty for plausible-looking winrates, and cheap).
     */
    normal(): number;
};

export function createRng(seed: number): Rng {
    const next = mulberry32(seed);
    return {
        next,
        int: (min, max) => min + Math.floor(next() * (max - min + 1)),
        float: (min, max) => min + next() * (max - min),
        chance: (p) => next() < p,
        pick: (values) => values[Math.floor(next() * values.length)],
        shuffle: (values) => {
            const copy = [...values];
            for (let i = copy.length - 1; i > 0; i--) {
                const j = Math.floor(next() * (i + 1));
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy;
        },
        normal: () => {
            let sum = 0;
            for (let i = 0; i < 6; i++) sum += next();
            return (sum - 3) / Math.sqrt(0.5);
        },
    };
}

/** FNV-1a, 32 bit. Used for stable per-pair noise that does not depend on
 * iteration order. */
export function hash32(value: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/** A stable value in [0, 1) derived from a string. */
export function hashUnit(value: string): number {
    return hash32(value) / 4294967296;
}

/** A stable value in [-1, 1) derived from a string. */
export function hashSigned(value: string): number {
    return hashUnit(value) * 2 - 1;
}
