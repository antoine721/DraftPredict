import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "../../lib/storage";
import {
    MAX_SAVED_ACCOUNTS,
    accountKey,
    removeAccount,
    sanitizeAccounts,
    upsertAccount,
    type SavedAccount,
} from "./helpers";

/**
 * The accounts this browser remembers, so a player with a main and a smurf can
 * switch without retyping a Riot ID.
 *
 * The shared preferences store keeps exactly one connected account
 * (`lastPuuid` / `lastRiotId` / `lastPlatform`) — that stays the source of
 * truth for "who am I right now". This store is only the *list* behind the
 * switcher, and it lives here rather than in `src/state/` because nothing
 * outside this view has any use for it.
 *
 * Nothing sensitive is stored: a puuid, a Riot ID and a shard. The API key
 * never reaches the browser at all.
 */

export const SAVED_ACCOUNTS_STORAGE_KEY = "draftpredict.account.saved.v1";

export type SavedAccountsState = {
    accounts: SavedAccount[];
};

export type SavedAccountsActions = {
    /** Adds or refreshes an account and moves it to the front of the list. */
    remember: (account: Omit<SavedAccount, "lastUsedAt"> & { lastUsedAt?: number }) => void;
    forget: (key: string) => void;
    clear: () => void;
};

export const useSavedAccountsStore = create<SavedAccountsState & SavedAccountsActions>()(
    persist(
        (set) => ({
            accounts: [],

            remember: (account) =>
                set((state) => ({
                    accounts: upsertAccount(
                        state.accounts,
                        { ...account, lastUsedAt: account.lastUsedAt ?? Date.now() },
                        MAX_SAVED_ACCOUNTS,
                    ),
                })),

            forget: (key) =>
                set((state) => ({ accounts: removeAccount(state.accounts, key) })),

            clear: () => set({ accounts: [] }),
        }),
        {
            name: SAVED_ACCOUNTS_STORAGE_KEY,
            version: 1,
            storage: createJSONStorage(() => safeStorage),
            // A hand-edited or half-written localStorage entry must not be able
            // to crash the first render of the view.
            merge: (persisted, current) => ({
                ...current,
                accounts: sanitizeAccounts(
                    (persisted as SavedAccountsState | undefined)?.accounts,
                ),
            }),
        },
    ),
);

export { accountKey };
