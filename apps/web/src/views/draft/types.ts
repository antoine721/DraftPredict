import type { Role, Team } from "@draftpredict/core";

/** Local vocabulary of the draft view. Nothing here crosses the folder. */

export type PickerMode = "pick" | "ban";

/** What the champion picker is currently filling. */
export type PickerTarget = {
    team: Team;
    /** The role slot for a pick; the role the ban is *shown* under otherwise. */
    role: Role;
    mode: PickerMode;
};

/** A champion shown on the board without being committed yet. */
export type SlotPreview = {
    team: Team;
    role: Role;
    championKey: string;
    /** Ally win probability if this preview were picked, when known. */
    winrate: number | null;
};

/** Per-champion numbers for one role, as the picker and the tier list show them. */
export type RankInfo = {
    /** Ally win probability with this champion in the targeted slot. */
    winrate: number;
    /** Sample of the champion in that role, 30-day window. */
    games: number;
    /** Gain over the current board, `0` when the ranking is context-free. */
    delta: number;
    rating: number;
};

export type Ranking = {
    byKey: Map<string, RankInfo>;
    /** `true` when the numbers account for the champions already on the board. */
    contextual: boolean;
    isLoading: boolean;
};
