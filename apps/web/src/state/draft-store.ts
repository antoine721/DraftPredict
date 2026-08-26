import { create } from "zustand";
import type { Rank, Region, RiskLevel, Role, Team } from "@draftpredict/core";
import type {
    DraftRequest,
    SerializedChampSelectState,
    SuggestionsRequest,
} from "../api/types";
import {
    boardFromChampSelect,
    boardsEqual,
    cloneBoard,
    emptyBoard,
    nextOpenSlot,
    teamEntries,
    unavailableChampions,
    type DraftBoard,
    type DraftSlot,
} from "./draft-board";
import { decodeDraftParams, type DraftUrlState } from "./draft-url";

/**
 * The draft board store.
 *
 * Three behaviours are worth spelling out:
 *
 * - **"Suivre le client" is a mode, not a checkbox.** While it is on, every
 *   `champselect:update` overwrites the board. The moment the user edits
 *   anything by hand the mode turns itself off, because a board that keeps
 *   snapping back to the client is worse than no sync at all.
 * - **Undo/redo covers manual edits only.** Live updates arrive several times
 *   a second; recording them would bury the user's own history.
 * - **The board is the URL.** Everything here round-trips through
 *   `encodeDraftParams`, so a draft is always shareable.
 */

const HISTORY_LIMIT = 50;

export type DraftAnalysisConfig = {
    riskLevel: RiskLevel | null;
    rank: Rank | null;
    region: Region | null;
    minGames: number | null;
    ignoreChampionWinrates: boolean | null;
};

export type DraftState = DraftAnalysisConfig & {
    board: DraftBoard;
    /** The slot the champion picker fills. */
    selected: DraftSlot | null;
    /** Mirror the League Client instead of accepting manual edits. */
    followClient: boolean;
    /** Epoch ms of the last `champselect:update` applied. */
    liveUpdatedAt: number | null;
    past: DraftBoard[];
    future: DraftBoard[];
};

export type DraftActions = {
    setPick: (team: Team, role: Role, championKey: string | null) => void;
    /** Puts a champion in the selected slot and moves to the next open one. */
    pickInSelectedSlot: (championKey: string) => void;
    clearSlot: (team: Team, role: Role) => void;
    /** Moves a champion between two slots, swapping if the target is filled. */
    moveSlot: (from: DraftSlot, to: DraftSlot) => void;
    selectSlot: (slot: DraftSlot | null) => void;
    selectNextOpenSlot: () => void;

    addBan: (team: Team, championKey: string) => void;
    removeBan: (team: Team, championKey: string) => void;
    setBans: (team: Team, championKeys: string[]) => void;

    setRiskLevel: (riskLevel: RiskLevel | null) => void;
    setRank: (rank: Rank | null) => void;
    setRegion: (region: Region | null) => void;
    setMinGames: (minGames: number | null) => void;
    setIgnoreChampionWinrates: (value: boolean | null) => void;

    setFollowClient: (follow: boolean) => void;
    /** Applies a champ-select frame. Ignored unless `followClient` is on. */
    applyChampSelect: (state: SerializedChampSelectState) => void;

    clearDraft: () => void;
    /** Replaces the whole state, e.g. from the URL. Resets history. */
    hydrate: (state: Partial<DraftUrlState>) => void;
    hydrateFromSearch: (search: URLSearchParams | string) => void;

    undo: () => void;
    redo: () => void;
};

export type DraftStore = DraftState & DraftActions;

function initialState(): DraftState {
    return {
        board: emptyBoard(),
        selected: { team: "ally", role: 0 },
        followClient: false,
        liveUpdatedAt: null,
        riskLevel: null,
        rank: null,
        region: null,
        minGames: null,
        ignoreChampionWinrates: null,
        past: [],
        future: [],
    };
}

export const useDraftStore = create<DraftStore>()((set, get) => {
    /**
     * The single write path for a manual board change: records history and
     * drops out of "suivre le client".
     */
    function commit(mutate: (board: DraftBoard) => void): void {
        const state = get();
        const next = cloneBoard(state.board);
        mutate(next);
        if (boardsEqual(state.board, next)) return;
        set({
            board: next,
            past: [...state.past, state.board].slice(-HISTORY_LIMIT),
            future: [],
            followClient: false,
        });
    }

    return {
        ...initialState(),

        setPick: (team, role, championKey) =>
            commit((board) => {
                const target = team === "ally" ? board.ally : board.opponent;
                target[role] =
                    championKey && championKey.length > 0 ? championKey : null;
            }),

        pickInSelectedSlot: (championKey) => {
            const slot = get().selected;
            if (!slot) return;
            commit((board) => {
                const target = slot.team === "ally" ? board.ally : board.opponent;
                target[slot.role] = championKey;
            });
            const next = nextOpenSlot(get().board, slot);
            set({ selected: next ?? slot });
        },

        clearSlot: (team, role) =>
            commit((board) => {
                const target = team === "ally" ? board.ally : board.opponent;
                target[role] = null;
            }),

        moveSlot: (from, to) =>
            commit((board) => {
                const source = from.team === "ally" ? board.ally : board.opponent;
                const target = to.team === "ally" ? board.ally : board.opponent;
                const moved = source[from.role];
                source[from.role] = target[to.role];
                target[to.role] = moved;
            }),

        selectSlot: (slot) => set({ selected: slot }),

        selectNextOpenSlot: () =>
            set((state) => ({
                selected: nextOpenSlot(state.board, state.selected) ?? state.selected,
            })),

        addBan: (team, championKey) =>
            commit((board) => {
                const bans = team === "ally" ? board.bans.ally : board.bans.opponent;
                if (bans.includes(championKey) || bans.length >= 5) return;
                bans.push(championKey);
            }),

        removeBan: (team, championKey) =>
            commit((board) => {
                if (team === "ally") {
                    board.bans.ally = board.bans.ally.filter(
                        (key) => key !== championKey,
                    );
                } else {
                    board.bans.opponent = board.bans.opponent.filter(
                        (key) => key !== championKey,
                    );
                }
            }),

        setBans: (team, championKeys) =>
            commit((board) => {
                const unique = [...new Set(championKeys)].slice(0, 5);
                if (team === "ally") board.bans.ally = unique;
                else board.bans.opponent = unique;
            }),

        setRiskLevel: (riskLevel) => set({ riskLevel }),
        setRank: (rank) => set({ rank }),
        setRegion: (region) => set({ region }),
        setMinGames: (minGames) => set({ minGames }),
        setIgnoreChampionWinrates: (ignoreChampionWinrates) =>
            set({ ignoreChampionWinrates }),

        setFollowClient: (follow) =>
            set(follow ? { followClient: true } : { followClient: false }),

        applyChampSelect: (state) => {
            if (!get().followClient) return;
            const board = boardFromChampSelect(state);
            const current = get().board;
            if (boardsEqual(current, board)) {
                set({ liveUpdatedAt: Date.now() });
                return;
            }
            // Live frames never enter the undo stack.
            set({ board, liveUpdatedAt: Date.now(), past: [], future: [] });
        },

        clearDraft: () =>
            set((state) => ({
                board: emptyBoard(),
                past: [...state.past, state.board].slice(-HISTORY_LIMIT),
                future: [],
                followClient: false,
                selected: { team: "ally", role: 0 },
            })),

        hydrate: (next) =>
            set((state) => ({
                board: next.board ? cloneBoard(next.board) : state.board,
                riskLevel: next.riskLevel ?? state.riskLevel,
                rank: next.rank ?? state.rank,
                region: next.region ?? state.region,
                minGames: next.minGames ?? state.minGames,
                ignoreChampionWinrates:
                    next.ignoreChampionWinrates ?? state.ignoreChampionWinrates,
                past: [],
                future: [],
            })),

        hydrateFromSearch: (search) => get().hydrate(decodeDraftParams(search)),

        undo: () =>
            set((state) => {
                const previous = state.past[state.past.length - 1];
                if (!previous) return state;
                return {
                    ...state,
                    board: previous,
                    past: state.past.slice(0, -1),
                    future: [state.board, ...state.future].slice(0, HISTORY_LIMIT),
                    followClient: false,
                };
            }),

        redo: () =>
            set((state) => {
                const [next, ...rest] = state.future;
                if (!next) return state;
                return {
                    ...state,
                    board: next,
                    past: [...state.past, state.board].slice(-HISTORY_LIMIT),
                    future: rest,
                    followClient: false,
                };
            }),
    };
});

// ------------------------------------------------------------- selectors ----

/** `true` when there is something to undo. */
export const selectCanUndo = (state: DraftStore): boolean => state.past.length > 0;
export const selectCanRedo = (state: DraftStore): boolean => state.future.length > 0;

/** Picked or banned champions — what the picker greys out. */
export const selectUnavailable = (state: DraftStore): Set<string> =>
    unavailableChampions(state.board);

/** The analysis config, with `undefined` for "use the server's setting". */
export function selectDraftConfig(state: DraftStore): DraftRequest["config"] {
    const config: NonNullable<DraftRequest["config"]> = {};
    if (state.riskLevel) config.riskLevel = state.riskLevel;
    if (state.minGames !== null) config.minGames = state.minGames;
    if (state.ignoreChampionWinrates !== null) {
        config.ignoreChampionWinrates = state.ignoreChampionWinrates;
    }
    return Object.keys(config).length > 0 ? config : undefined;
}

/** The body of `POST /api/draft/analyze` for the current board. */
export function selectAnalyzeRequest(state: DraftStore): DraftRequest {
    const request: DraftRequest = {
        team: teamEntries(state.board.ally),
        enemy: teamEntries(state.board.opponent),
        bans: {
            ally: [...state.board.bans.ally],
            opponent: [...state.board.bans.opponent],
        },
    };
    const config = selectDraftConfig(state);
    if (config) request.config = config;
    if (state.rank) request.rank = state.rank;
    if (state.region) request.region = state.region;
    return request;
}

/** The body of `POST /api/draft/suggestions`. */
export function selectSuggestionsRequest(
    state: DraftStore,
    options: { limit?: number; roles?: Role[] } = {},
): SuggestionsRequest {
    const request: SuggestionsRequest = { ...selectAnalyzeRequest(state) };
    if (options.limit !== undefined) request.limit = options.limit;
    if (options.roles !== undefined) request.roles = options.roles;
    return request;
}

/** The current draft as URL parameters — for the "partager" button. */
export function selectUrlState(state: DraftStore): DraftUrlState {
    return {
        board: state.board,
        riskLevel: state.riskLevel,
        rank: state.rank,
        region: state.region,
        minGames: state.minGames,
        ignoreChampionWinrates: state.ignoreChampionWinrates,
    };
}
