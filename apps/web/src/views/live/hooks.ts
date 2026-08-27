import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The data layer of the "Partie en cours" view.
 *
 * `useAccountMe` lives in `src/api` — three views needed it, so it was
 * promoted there. This file is about time: a champion-select countdown that
 * keeps ticking between two pushes, a clock for the in-game timer, and the
 * page visibility flag every poll on this screen is gated on.
 */

/**
 * `true` while the tab is visible. Polling on this screen is gated on it: a
 * background tab must not keep asking Riot whether a game started.
 */
export function usePageVisible(): boolean {
    const [visible, setVisible] = useState(
        () => typeof document === "undefined" || !document.hidden,
    );
    useEffect(() => {
        if (typeof document === "undefined") return;
        const onChange = () => setVisible(!document.hidden);
        onChange();
        document.addEventListener("visibilitychange", onChange);
        return () => document.removeEventListener("visibilitychange", onChange);
    }, []);
    return visible;
}

/** A clock that ticks only while it is needed. */
export function useNow(active: boolean, intervalMs = 1000): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return;
        setNow(Date.now());
        const id = window.setInterval(() => setNow(Date.now()), intervalMs);
        return () => window.clearInterval(id);
    }, [active, intervalMs]);
    return now;
}

/**
 * A champion-select countdown that keeps running between two pushes: the
 * client sends the remaining milliseconds a few times a second at best, and a
 * frozen countdown looks broken.
 */
export function useCountdown(timerMs: number | null, updatedAt: number | null): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (timerMs === null || timerMs <= 0) return;
        setNow(Date.now());
        const id = window.setInterval(() => setNow(Date.now()), 500);
        return () => window.clearInterval(id);
    }, [timerMs, updatedAt]);

    if (timerMs === null) return 0;
    if (updatedAt === null) return timerMs;
    return Math.max(0, timerMs - (now - updatedAt));
}

export type IdleCounter = {
    /** Consecutive checks that found nothing. Feeds the backoff. */
    checks: number;
    /** Records one "nothing is happening" answer. */
    miss: () => void;
    /** Something happened, or the user asked: back to the fast interval. */
    reset: () => void;
};

/**
 * Counts consecutive empty polls so the interval can grow.
 *
 * Kept as a hook rather than derived from the query so that a manual refresh,
 * a champion select starting or the target changing all reset it — the user
 * pressing "Vérifier maintenant" must not then wait two minutes.
 */
export function useIdleCounter(resetKey: string): IdleCounter {
    const [checks, setChecks] = useState(0);
    const lastKey = useRef(resetKey);
    if (lastKey.current !== resetKey) {
        lastKey.current = resetKey;
        // Render-phase reset: cheaper and flicker-free compared to an effect.
        if (checks !== 0) setChecks(0);
    }
    const miss = useCallback(() => setChecks((value) => Math.min(value + 1, 8)), []);
    const reset = useCallback(() => setChecks(0), []);
    return { checks, miss, reset };
}
