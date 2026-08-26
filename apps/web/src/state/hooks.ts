import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveEvent } from "../api/live";
import { usePreferencesStore } from "./preferences";
import { useDraftStore, selectUrlState } from "./draft-store";
import { encodeDraftParams, hasDraftParams, DRAFT_URL_PARAMS } from "./draft-url";

/**
 * The wiring between the draft store and the outside world: the address bar,
 * the League Client and the document theme.
 */

/**
 * Keeps the draft and the URL in sync, in both directions.
 *
 * On the first render the URL wins (that is how a shared link works); after
 * that the store wins and the URL is rewritten with `replace`, so sharing a
 * draft never fills the browser's back stack with every single pick.
 */
export function useDraftUrlSync(): void {
    const [searchParams, setSearchParams] = useSearchParams();
    const hydrated = useRef(false);

    const board = useDraftStore((state) => state.board);
    const riskLevel = useDraftStore((state) => state.riskLevel);
    const rank = useDraftStore((state) => state.rank);
    const region = useDraftStore((state) => state.region);
    const minGames = useDraftStore((state) => state.minGames);
    const ignoreChampionWinrates = useDraftStore(
        (state) => state.ignoreChampionWinrates,
    );

    // URL -> store, once.
    useEffect(() => {
        if (hydrated.current) return;
        hydrated.current = true;
        if (!hasDraftParams(searchParams)) return;
        useDraftStore.getState().hydrateFromSearch(searchParams);
    }, [searchParams]);

    const encoded = useMemo(
        () =>
            encodeDraftParams({
                board,
                riskLevel,
                rank,
                region,
                minGames,
                ignoreChampionWinrates,
            }),
        [board, riskLevel, rank, region, minGames, ignoreChampionWinrates],
    );

    // store -> URL.
    useEffect(() => {
        if (!hydrated.current) return;
        const next = new URLSearchParams(searchParams);
        for (const key of DRAFT_URL_PARAMS) next.delete(key);
        for (const [key, value] of Object.entries(encoded)) next.set(key, value);
        if (next.toString() === searchParams.toString()) return;
        setSearchParams(next, { replace: true });
    }, [encoded, searchParams, setSearchParams]);
}

/** The shareable absolute URL of the current draft. */
export function useDraftShareUrl(): string {
    const state = useDraftStore();
    const params = new URLSearchParams(encodeDraftParams(selectUrlState(state)));
    const query = params.toString();
    if (typeof window === "undefined") return query ? `/draft?${query}` : "/draft";
    const { origin, pathname } = window.location;
    return `${origin}${pathname}${query ? `?${query}` : ""}`;
}

/**
 * Feeds `champselect:update` into the store while "suivre le client" is on,
 * and remembers the mode the user asked for by default.
 */
export function useChampSelectSync(): void {
    useLiveEvent("champselect:update", (message) => {
        useDraftStore.getState().applyChampSelect(message.state);
    });
}

/** Applies the theme preference to `<html data-theme>`. */
export function useThemeEffect(): void {
    const theme = usePreferencesStore((state) => state.theme);
    useEffect(() => {
        if (typeof document === "undefined") return;
        const root = document.documentElement;
        const apply = (value: "dark" | "light") => {
            root.dataset.theme = value;
        };
        if (theme !== "system") {
            apply(theme);
            return;
        }
        const query = window.matchMedia("(prefers-color-scheme: light)");
        apply(query.matches ? "light" : "dark");
        const onChange = (event: MediaQueryListEvent) =>
            apply(event.matches ? "light" : "dark");
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, [theme]);
}
