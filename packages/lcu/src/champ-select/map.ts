import type { Dataset, Role } from "@draftpredict/core";
import type { StaticData } from "@draftpredict/data";
import type {
    LcuChampSelectAction,
    LcuChampSelectPlayer,
    LcuChampSelectSession,
} from "../api/types.js";
import {
    assignRoles,
    parseAssignedPosition,
    type RoleAssignmentCell,
} from "./roles.js";
import {
    emptyChampSelectState,
    type ChampSelectLocalPlayer,
    type ChampSelectPlayerState,
    type ChampSelectState,
} from "./state.js";

/** What {@link mapChampSelectSession} needs beyond the session itself. */
export type ChampSelectMapContext = {
    /**
     * Dataset used to infer positions the client did not assign (blind pick,
     * ARAM, customs). Without it, unassigned cells fall back to slot order.
     */
    dataset?: Dataset | undefined;
    /** Set to `false` to disable inference entirely. Default `true`. */
    inferRoles?: boolean | undefined;
    /**
     * Local player's puuid, used to find them when `localPlayerCellId` is
     * missing or `-1` (some spectator and reconnect payloads).
     */
    localPuuid?: string | undefined;
    /**
     * Bundled Data Dragon snapshot. Optional, and used for display only: it
     * fills {@link ChampSelectPlayerState.championName} so a UI does not have
     * to resolve champion keys a second time.
     */
    staticData?: StaticData | undefined;
};

/**
 * Riot's "nothing chosen" champion ids.
 *
 * `0` is the usual placeholder; `-1` shows up in a few payloads. Neither may
 * ever reach the engine, which would happily look up champion `"0"` and find
 * nothing.
 */
export function championKeyOf(championId: number | undefined | null): string | null {
    if (typeof championId !== "number" || !Number.isFinite(championId)) return null;
    if (championId <= 0) return null;
    return String(Math.trunc(championId));
}

/**
 * Converts an LCU champ-select session into the engine's view of the draft.
 *
 * The three things this function exists to get right:
 *
 * - **locked vs hovered.** A completed `pick` action is a lock; an in-progress
 *   one, and an ally's `championPickIntent`, are hovers. Enemy champion ids
 *   stay `0` until they lock, so their hovers are only visible through their
 *   actions — both are exposed, and neither ever leaks a `0`/`-1` id.
 * - **bans.** `session.bans` lags behind by a turn in some patches, so it is
 *   merged with the completed `ban` actions and de-duplicated.
 * - **roles.** `assignedPosition` is authoritative when present; anything else
 *   is inferred with `predictRoles`, so every champion still lands in a slot.
 */
export function mapChampSelectSession(
    session: LcuChampSelectSession,
    context: ChampSelectMapContext = {},
): ChampSelectState {
    const state = emptyChampSelectState();
    const actions = flattenActions(session.actions);

    state.phase = session.timer?.phase ?? "";
    state.timerMs = Math.max(0, session.timer?.adjustedTimeLeftInPhase ?? 0);
    state.isCustom = session.isCustomGame ?? false;
    state.isSpectating = session.isSpectating ?? false;
    state.benchChampionKeys = readBench(session);
    state.pickOrder = pickOrderOf(actions);

    const localCellId = session.localPlayerCellId ?? -1;
    const locked = lockedChampionsByCell(actions);
    const hovered = hoveredChampionsByCell(actions);
    const hasPickAction = cellsWithPickActions(actions);

    const ally = mapTeam({
        players: session.myTeam ?? [],
        isAlly: true,
        locked,
        hovered,
        hasPickAction,
        localCellId,
        localPuuid: context.localPuuid,
        dataset: context.dataset,
        inferRoles: context.inferRoles,
        staticData: context.staticData,
    });
    const opponent = mapTeam({
        players: session.theirTeam ?? [],
        isAlly: false,
        locked,
        hovered,
        hasPickAction,
        localCellId,
        localPuuid: context.localPuuid,
        dataset: context.dataset,
        inferRoles: context.inferRoles,
        staticData: context.staticData,
    });

    state.allyPlayers = ally.players;
    state.opponentPlayers = opponent.players;
    state.ally = ally.picks;
    state.allyHovers = ally.hovers;
    state.opponent = opponent.picks;
    state.opponentHovers = opponent.hovers;

    state.bans = {
        ally: mergeBans(session.bans?.myTeamBans, actions, true),
        opponent: mergeBans(session.bans?.theirTeamBans, actions, false),
    };

    const localPlayerState =
        ally.players.find((player) => player.isLocalPlayer) ??
        opponent.players.find((player) => player.isLocalPlayer) ??
        null;
    const localPlayerCellId = localPlayerState?.cellId ?? localCellId;

    state.currentActorCellId = currentActorCellId(actions, localPlayerCellId);
    state.isLocalPlayerTurn =
        localPlayerCellId >= 0 &&
        actions.some(
            (action) =>
                action.actorCellId === localPlayerCellId &&
                action.isInProgress &&
                !action.completed,
        );
    state.localPlayer = localPlayer(localPlayerState, localPlayerCellId, actions);

    return state;
}

// ------------------------------------------------------------------ teams ---

type TeamMapping = {
    players: readonly LcuChampSelectPlayer[];
    isAlly: boolean;
    locked: Map<number, string>;
    hovered: Map<number, string>;
    hasPickAction: Set<number>;
    localCellId: number;
    localPuuid: string | undefined;
    dataset: Dataset | undefined;
    inferRoles: boolean | undefined;
    staticData: StaticData | undefined;
};

type MappedTeam = {
    players: ChampSelectPlayerState[];
    picks: Map<Role, string>;
    hovers: Map<Role, string>;
};

function mapTeam(mapping: TeamMapping): MappedTeam {
    const rows = mapping.players.map((player) => {
        const cellId = player.cellId ?? -1;
        const assignedRole = parseAssignedPosition(player.assignedPosition);
        const playerChampion = championKeyOf(player.championId);

        // A completed pick action is the only unambiguous lock. When a session
        // carries no pick actions at all (ARAM, some customs, a reconnect
        // payload) the player's own championId is all we have — and there it
        // really is the final champion.
        const lockedKey =
            mapping.locked.get(cellId) ??
            (!mapping.hasPickAction.has(cellId) ? playerChampion : null);

        const hoverCandidate =
            mapping.hovered.get(cellId) ??
            championKeyOf(player.championPickIntent) ??
            (lockedKey === null ? playerChampion : null);
        const hoveredKey = hoverCandidate === lockedKey ? null : hoverCandidate;

        return {
            cellId,
            puuid: nonEmpty(player.puuid),
            assignedRole,
            role: null as Role | null,
            championKey: lockedKey,
            hoveredChampionKey: hoveredKey,
            championName: championName(mapping.staticData, lockedKey ?? hoveredKey),
            spellIds: {
                spell1: numberOrNull(player.spell1Id),
                spell2: numberOrNull(player.spell2Id),
            },
            isLocalPlayer:
                (mapping.localCellId >= 0 && cellId === mapping.localCellId) ||
                (mapping.localPuuid !== undefined &&
                    player.puuid === mapping.localPuuid),
        } satisfies ChampSelectPlayerState;
    });

    const cells: RoleAssignmentCell[] = rows.map((row) => ({
        cellId: row.cellId,
        assignedRole: row.assignedRole,
        championKey: row.championKey ?? row.hoveredChampionKey,
    }));
    const roleByCell = assignRoles(cells, {
        dataset: mapping.dataset,
        infer: mapping.inferRoles,
    });

    const picks = new Map<Role, string>();
    const hovers = new Map<Role, string>();
    for (const row of rows) {
        const role = roleByCell.get(row.cellId) ?? null;
        row.role = role;
        if (role === null) continue;
        if (row.championKey) picks.set(role, row.championKey);
        else if (row.hoveredChampionKey) hovers.set(role, row.hoveredChampionKey);
    }

    return { players: rows, picks, hovers };
}

function localPlayer(
    row: ChampSelectPlayerState | null,
    cellId: number,
    actions: readonly LcuChampSelectAction[],
): ChampSelectLocalPlayer {
    return {
        cellId,
        puuid: row?.puuid ?? null,
        assignedRole: row?.assignedRole ?? null,
        championKey: row?.championKey ?? null,
        hoveredChampionKey: row?.hoveredChampionKey ?? null,
        pickActionId: openActionId(actions, cellId, "pick"),
        banActionId: openActionId(actions, cellId, "ban"),
    };
}

/**
 * The action a hover would target: the one in progress, else the next one that
 * has not completed yet.
 */
function openActionId(
    actions: readonly LcuChampSelectAction[],
    cellId: number,
    type: "pick" | "ban",
): number | null {
    if (cellId < 0) return null;
    const mine = actions.filter(
        (action) => action.actorCellId === cellId && action.type === type,
    );
    const inProgress = mine.find((action) => action.isInProgress && !action.completed);
    const pending = inProgress ?? mine.find((action) => !action.completed);
    return pending?.id ?? null;
}

// ---------------------------------------------------------------- actions ---

function flattenActions(
    actions: LcuChampSelectSession["actions"],
): LcuChampSelectAction[] {
    if (!Array.isArray(actions)) return [];
    const flat: LcuChampSelectAction[] = [];
    for (const group of actions) {
        if (!Array.isArray(group)) continue;
        for (const action of group) {
            if (action && typeof action === "object") flat.push(action);
        }
    }
    return flat;
}

function lockedChampionsByCell(
    actions: readonly LcuChampSelectAction[],
): Map<number, string> {
    const locked = new Map<number, string>();
    for (const action of actions) {
        if (action.type !== "pick" || !action.completed) continue;
        const key = championKeyOf(action.championId);
        if (key) locked.set(action.actorCellId, key);
    }
    return locked;
}

function hoveredChampionsByCell(
    actions: readonly LcuChampSelectAction[],
): Map<number, string> {
    const hovered = new Map<number, string>();
    for (const action of actions) {
        if (action.type !== "pick" || action.completed) continue;
        const key = championKeyOf(action.championId);
        // The latest in-progress action wins, so a re-hover replaces the old one.
        if (key) hovered.set(action.actorCellId, key);
    }
    return hovered;
}

function cellsWithPickActions(actions: readonly LcuChampSelectAction[]): Set<number> {
    const cells = new Set<number>();
    for (const action of actions) {
        if (action.type === "pick") cells.add(action.actorCellId);
    }
    return cells;
}

function pickOrderOf(actions: readonly LcuChampSelectAction[]): number[] {
    const order: number[] = [];
    for (const action of actions) {
        if (action.type !== "pick") continue;
        if (action.actorCellId < 0) continue;
        if (order.includes(action.actorCellId)) continue;
        order.push(action.actorCellId);
    }
    return order;
}

function currentActorCellId(
    actions: readonly LcuChampSelectAction[],
    localCellId: number,
): number | null {
    const inProgress = actions.filter(
        (action) => action.isInProgress && !action.completed,
    );
    if (inProgress.length === 0) return null;
    // Simultaneous bans put several cells in progress at once; the local
    // player's own turn is the one a UI cares about.
    const mine = inProgress.find((action) => action.actorCellId === localCellId);
    return (mine ?? inProgress[0]!).actorCellId;
}

function mergeBans(
    sessionBans: number[] | undefined,
    actions: readonly LcuChampSelectAction[],
    isAlly: boolean,
): string[] {
    const bans: string[] = [];
    const seen = new Set<string>();

    const push = (championId: number | undefined) => {
        const key = championKeyOf(championId);
        if (!key || seen.has(key)) return;
        seen.add(key);
        bans.push(key);
    };

    for (const championId of sessionBans ?? []) push(championId);
    for (const action of actions) {
        if (action.type !== "ban" || !action.completed) continue;
        if (action.isAllyAction !== isAlly) continue;
        push(action.championId);
    }

    return bans;
}

// ----------------------------------------------------------------- values ---

function readBench(session: LcuChampSelectSession): string[] {
    const ids =
        session.benchChampionIds ??
        (session.benchChampions ?? []).map((entry) => entry?.championId);
    const keys: string[] = [];
    for (const id of ids) {
        const key = championKeyOf(id);
        if (key && !keys.includes(key)) keys.push(key);
    }
    return keys;
}

/** Champion display name, when a static-data snapshot was provided. */
function championName(
    staticData: StaticData | undefined,
    championKey: string | null,
): string | null {
    if (!staticData || !championKey) return null;
    return staticData.championsByKey.get(championKey)?.name ?? null;
}

function nonEmpty(value: string | undefined): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    // The client zero-fills hidden puuids in some queues.
    if (/^0+(-0+)*$/.test(trimmed)) return null;
    return trimmed;
}

function numberOrNull(value: number | undefined): number | null {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? value
        : null;
}
