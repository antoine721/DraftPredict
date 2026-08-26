import type { ChampSelectState } from "@draftpredict/lcu";
import type { Role } from "@draftpredict/core";

/**
 * `ChampSelectState` holds `Map`s, which JSON drops silently. Everything that
 * leaves the server — REST body or WebSocket frame — goes through here first.
 */

export type SerializedChampSelectState = Omit<
    ChampSelectState,
    "ally" | "opponent" | "allyHovers" | "opponentHovers"
> & {
    ally: [Role, string][];
    opponent: [Role, string][];
    allyHovers: [Role, string][];
    opponentHovers: [Role, string][];
};

export function serializeChampSelectState(
    state: ChampSelectState,
): SerializedChampSelectState {
    return {
        ...state,
        ally: [...state.ally.entries()],
        opponent: [...state.opponent.entries()],
        allyHovers: [...state.allyHovers.entries()],
        opponentHovers: [...state.opponentHovers.entries()],
        allyPlayers: [...state.allyPlayers],
        opponentPlayers: [...state.opponentPlayers],
    };
}

export type LcuStatus = {
    /** Whether the integration is switched on at all. */
    enabled: boolean;
    /** Whether the watcher is currently looking for or following a client. */
    running: boolean;
    /** Whether a League Client is answering right now. */
    connected: boolean;
    /** `true` when events come from polling instead of the LCU WebSocket. */
    polling: boolean;
    /** Last gameflow phase, e.g. `ChampSelect`, `InProgress`. */
    phase: string | null;
    /** `true` while a champ-select session is known. */
    inChampSelect: boolean;
    summoner: {
        puuid: string;
        gameName: string | null;
        tagLine: string | null;
        displayName: string | null;
        summonerLevel: number | null;
        profileIconId: number | null;
    } | null;
    /** Last error the watcher reported, redacted and non-fatal. */
    lastError: string | null;
    updatedAt: number;
};
