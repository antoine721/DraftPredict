import {
    ROLES,
    deserializeDraftState,
    emptyDraftState,
    predictRoles,
    type Dataset,
    type DraftState,
    type Role,
} from "@draftpredict/core";

import type { CurrentGameInfo } from "../types/spectator.js";
import type { MatchSummary } from "./summary.js";

/**
 * The champion select of a finished game, as a core {@link DraftState}: the
 * summarised player's team is `ally`, the other one `opponent`.
 *
 * Feed it to `analyzeDraft` / `getSuggestions` to show "what the engine would
 * have predicted" next to what actually happened.
 */
export function buildDraftFromMatch(summary: MatchSummary): DraftState {
    return deserializeDraftState(summary.draft);
}

export type SpectatorDraftOptions = {
    /**
     * When given, roles are inferred with `predictRoles` from the dataset.
     * Without it champions are placed in spectator order (Riot lists them
     * top, jungle, mid, bot, support in practice, but does not guarantee it).
     */
    dataset?: Dataset;
};

/**
 * Turns a live spectator game into a {@link DraftState} seen from `puuid`'s
 * team. Returns `null` when the player is not in the game.
 */
export function buildDraftFromSpectatorGame(
    game: CurrentGameInfo,
    puuid: string,
    options: SpectatorDraftOptions = {},
): DraftState | null {
    const participants = game.participants ?? [];
    const me = participants.find((participant) => participant.puuid === puuid);
    if (!me) return null;

    const state = emptyDraftState();
    for (const teamId of [100, 200]) {
        const members = participants.filter(
            (participant) => participant.teamId === teamId,
        );
        const championKeys = members.map((participant) =>
            String(participant.championId),
        );
        const target = teamId === me.teamId ? state.ally : state.opponent;
        const byRole = options.dataset
            ? predictRoles(options.dataset, championKeys)
            : positionalRoles(championKeys);
        for (const [role, championKey] of byRole) target.set(role, championKey);
    }

    for (const ban of game.bannedChampions ?? []) {
        if (ban.championId <= 0) continue;
        const target = ban.teamId === me.teamId ? state.bans.ally : state.bans.opponent;
        target.push(String(ban.championId));
    }
    return state;
}

function positionalRoles(championKeys: readonly string[]): Map<Role, string> {
    const byRole = new Map<Role, string>();
    championKeys.forEach((championKey, index) => {
        const role = ROLES[index];
        if (role === undefined) return;
        byRole.set(role, championKey);
    });
    return byRole;
}
