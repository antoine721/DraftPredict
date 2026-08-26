import type { Role } from "@draftpredict/core";
import type { ChampSelectPhase } from "../api/types.js";

/**
 * The engine-facing view of champion select.
 *
 * Everything here uses the vocabulary of `@draftpredict/core`: champions are
 * dataset keys (the numeric champion key as a string) and positions are
 * `Role`s. Nothing in this shape can hold Riot's placeholder ids: a champion
 * that has not been chosen is absent, never `0` or `-1`.
 */

export type ChampSelectPlayerState = {
    cellId: number;
    /** `null` when the client hides it (name visibility, enemy team). */
    puuid: string | null;
    /** Position Riot assigned, when it did. */
    assignedRole: Role | null;
    /** Position used in the draft maps: assigned, or inferred when missing. */
    role: Role | null;
    /** Locked-in champion. */
    championKey: string | null;
    /** Champion currently hovered but not locked. */
    hoveredChampionKey: string | null;
    /**
     * Display name of {@link championKey} (falling back to the hovered one),
     * filled in only when the mapper was given static data.
     */
    championName: string | null;
    /** Summoner spells, when the client exposes them. */
    spellIds: { spell1: number | null; spell2: number | null };
    isLocalPlayer: boolean;
};

export type ChampSelectLocalPlayer = {
    /** `-1` when the viewer is not a player (spectating a friend's game). */
    cellId: number;
    puuid: string | null;
    assignedRole: Role | null;
    championKey: string | null;
    hoveredChampionKey: string | null;
    /** Action id to PATCH when hovering a pick, when there is an open one. */
    pickActionId: number | null;
    /** Action id to PATCH when hovering a ban, when there is an open one. */
    banActionId: number | null;
};

export type ChampSelectBans = {
    /** Ally bans, in the order they were revealed. Dataset champion keys. */
    ally: string[];
    opponent: string[];
};

/** A whole champ-select session, ready to feed to the engine. */
export type ChampSelectState = {
    /** Sub-phase: `PLANNING`, `BAN_PICK`, `FINALIZATION`, `GAME_STARTING`. */
    phase: ChampSelectPhase;
    /** Milliseconds left in the current sub-phase. */
    timerMs: number;
    localPlayer: ChampSelectLocalPlayer;
    /** Locked ally picks — the engine's `team` map. */
    ally: Map<Role, string>;
    /** Locked enemy picks — the engine's `enemy` map. */
    opponent: Map<Role, string>;
    /** Ally hovers that are not locked yet. */
    allyHovers: Map<Role, string>;
    /** Enemy hovers, visible through their in-progress pick actions. */
    opponentHovers: Map<Role, string>;
    bans: ChampSelectBans;
    /** Cell ids in pick order, from the session's pick actions. */
    pickOrder: number[];
    /** Cell currently acting, or `null` between turns. */
    currentActorCellId: number | null;
    isLocalPlayerTurn: boolean;
    /** ARAM / Swiftplay bench. */
    benchChampionKeys: string[];
    isCustom: boolean;
    isSpectating: boolean;
    /** Per-cell detail, ally side, in the client's own order. */
    allyPlayers: ChampSelectPlayerState[];
    opponentPlayers: ChampSelectPlayerState[];
};

/** An empty state, useful as a default in UIs. */
export function emptyChampSelectState(): ChampSelectState {
    return {
        phase: "",
        timerMs: 0,
        localPlayer: {
            cellId: -1,
            puuid: null,
            assignedRole: null,
            championKey: null,
            hoveredChampionKey: null,
            pickActionId: null,
            banActionId: null,
        },
        ally: new Map(),
        opponent: new Map(),
        allyHovers: new Map(),
        opponentHovers: new Map(),
        bans: { ally: [], opponent: [] },
        pickOrder: [],
        currentActorCellId: null,
        isLocalPlayerTurn: false,
        benchChampionKeys: [],
        isCustom: false,
        isSpectating: false,
        allyPlayers: [],
        opponentPlayers: [],
    };
}
