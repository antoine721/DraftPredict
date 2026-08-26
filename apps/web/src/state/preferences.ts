import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ThemePreference } from "../api/types";
import { safeStorage } from "../lib/storage";

/**
 * Everything the app remembers between sessions.
 *
 * Deliberately *not* the draft: a draft belongs in the URL, where it can be
 * shared. This is the small stuff — the last account looked up, how many
 * suggestions to show, whether the offline-data banner was dismissed.
 *
 * Storage failures are swallowed by `safeStorage`, so a locked-down browser
 * degrades to an in-memory session instead of crashing on first render.
 */

export const PREFERENCES_STORAGE_KEY = "draftpredict.preferences.v1";

export type ChampionLayout = "grid" | "list";

export type PreferencesState = {
    /** `system` follows the OS; the server also stores a theme in its config. */
    theme: ThemePreference;
    /** Suggestions requested per open role (server default is 10). */
    suggestionLimit: number;
    /** Ban suggestions requested. */
    banLimit: number;
    /** Matches loaded in the account view. */
    matchCount: number;
    /** Matches profiled for the playstyle radar. */
    playstyleCount: number;
    /** Start the draft view in "suivre le client" mode. */
    followClientByDefault: boolean;
    /** The offline-demo-data banner was dismissed for this dataset date. */
    dismissedOfflineNoticeFor: string | null;
    /** Last `Nom#TAG` typed in the account view. */
    lastRiotId: string | null;
    lastPuuid: string | null;
    lastPlatform: string | null;
    /** Champion keys pinned in the picker. */
    favouriteChampions: string[];
    championLayout: ChampionLayout;
    /** Collapsed left navigation. */
    navCollapsed: boolean;
};

export type PreferencesActions = {
    setTheme: (theme: ThemePreference) => void;
    setSuggestionLimit: (limit: number) => void;
    setBanLimit: (limit: number) => void;
    setMatchCount: (count: number) => void;
    setPlaystyleCount: (count: number) => void;
    setFollowClientByDefault: (value: boolean) => void;
    dismissOfflineNotice: (datasetDate: string) => void;
    rememberAccount: (account: {
        riotId?: string | null;
        puuid?: string | null;
        platform?: string | null;
    }) => void;
    forgetAccount: () => void;
    toggleFavourite: (championKey: string) => void;
    setChampionLayout: (layout: ChampionLayout) => void;
    setNavCollapsed: (collapsed: boolean) => void;
    reset: () => void;
};

const DEFAULTS: PreferencesState = {
    theme: "dark",
    suggestionLimit: 10,
    banLimit: 20,
    matchCount: 20,
    playstyleCount: 50,
    followClientByDefault: true,
    dismissedOfflineNoticeFor: null,
    lastRiotId: null,
    lastPuuid: null,
    lastPlatform: null,
    favouriteChampions: [],
    championLayout: "grid",
    navCollapsed: false,
};

export const usePreferencesStore = create<PreferencesState & PreferencesActions>()(
    persist(
        (set) => ({
            ...DEFAULTS,

            setTheme: (theme) => set({ theme }),
            setSuggestionLimit: (limit) =>
                set({ suggestionLimit: Math.min(50, Math.max(1, Math.trunc(limit))) }),
            setBanLimit: (limit) =>
                set({ banLimit: Math.min(200, Math.max(1, Math.trunc(limit))) }),
            setMatchCount: (count) =>
                set({ matchCount: Math.min(100, Math.max(1, Math.trunc(count))) }),
            setPlaystyleCount: (count) =>
                set({ playstyleCount: Math.min(100, Math.max(5, Math.trunc(count))) }),
            setFollowClientByDefault: (followClientByDefault) =>
                set({ followClientByDefault }),
            dismissOfflineNotice: (datasetDate) =>
                set({ dismissedOfflineNoticeFor: datasetDate }),
            rememberAccount: ({ riotId, puuid, platform }) =>
                set((state) => ({
                    lastRiotId: riotId === undefined ? state.lastRiotId : riotId,
                    lastPuuid: puuid === undefined ? state.lastPuuid : puuid,
                    lastPlatform:
                        platform === undefined ? state.lastPlatform : platform,
                })),
            forgetAccount: () =>
                set({ lastRiotId: null, lastPuuid: null, lastPlatform: null }),
            toggleFavourite: (championKey) =>
                set((state) => ({
                    favouriteChampions: state.favouriteChampions.includes(championKey)
                        ? state.favouriteChampions.filter((key) => key !== championKey)
                        : [...state.favouriteChampions, championKey],
                })),
            setChampionLayout: (championLayout) => set({ championLayout }),
            setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
            reset: () => set({ ...DEFAULTS }),
        }),
        {
            name: PREFERENCES_STORAGE_KEY,
            version: 1,
            storage: createJSONStorage(() => safeStorage),
        },
    ),
);

export const preferenceDefaults: Readonly<PreferencesState> = DEFAULTS;
