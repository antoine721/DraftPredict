import { ROLES, ratingToWinrate, type Role } from "@draftpredict/core";
import type { CurrentGameInfo, SpectatorParticipant } from "@draftpredict/riot";
import type { SerializedDraftState } from "@draftpredict/core";
import type {
    AnalyzePayload,
    ContributionEntry,
    ContributionGroup,
    DraftBreakdown,
    LcuStatus,
    SerializedChampSelectState,
} from "../../api/types";
import { NBSP, roleLongLabels } from "../../lib/format";

/**
 * The pure half of the "Partie en cours" view.
 *
 * Everything that turns a League Client frame, a spectator payload or an
 * analysis into something a French sentence can be built from lives here, with
 * no React and no I/O, so it is unit-tested rather than eyeballed.
 *
 * Three rules run through the file:
 *
 * - **Nothing is invented.** Spectator data carries no positions and no ranks;
 *   roles come from the draft the server inferred, and anything missing stays
 *   `null` so the UI can say "inconnu" instead of guessing.
 * - **The engine's totals are ally-centric.** `totalRating` is
 *   `ally - enemy + allyDuo - enemyDuo + matchup`, so an enemy group is negated
 *   before it can be read as "effect on your win probability". Green is always
 *   good for the team being watched.
 * - **Polling is bounded.** The idle screen is the one users leave open, so the
 *   interval grows on its own and never turns into a busy loop.
 */

export type LiveSide = "ally" | "opponent";

// ------------------------------------------------------------- client state --

/** French label of a League Client gameflow phase. */
export function gameflowPhaseLabel(phase: string | null | undefined): string {
    switch (phase) {
        case "None":
            return "Aucune partie";
        case "Lobby":
            return "Dans le salon";
        case "Matchmaking":
            return "Recherche de partie";
        case "ReadyCheck":
            return "Acceptation de la partie";
        case "ChampSelect":
            return "Sélection des champions";
        case "GameStart":
            return "Lancement de la partie";
        case "InProgress":
            return "Partie en cours";
        case "Reconnect":
            return "Reconnexion en cours";
        case "WaitingForStats":
        case "PreEndOfGame":
            return "Fin de partie";
        case "EndOfGame":
            return "Écran de fin de partie";
        case "TerminatedInError":
            return "Le client a rencontré une erreur";
        case null:
        case undefined:
        case "":
            return "Phase inconnue";
        default:
            return phase;
    }
}

/** French label of a champion-select sub-phase. */
export function champSelectPhaseLabel(phase: string | null | undefined): string {
    switch (phase) {
        case "PLANNING":
            return "Préparation";
        case "BAN_PICK":
            return "Bans & picks";
        case "FINALIZATION":
            return "Finalisation";
        case "GAME_STARTING":
            return "Lancement de la partie";
        case null:
        case undefined:
        case "":
            return "Sélection des champions";
        default:
            return phase;
    }
}

export type ClientStateKind =
    "unknown" | "disabled" | "absent" | "connected" | "champselect" | "ingame";

export type ClientState = {
    kind: ClientStateKind;
    tone: "offline" | "info" | "positive" | "warning" | "neutral";
    title: string;
    description: string;
    /** The client answered at least once. */
    live: boolean;
};

/**
 * What the League Client is doing, said plainly.
 *
 * The four booleans of `LcuStatus` mean four different things and the user
 * only cares about one sentence, so they are collapsed here — including the
 * "polling" fallback, which is slower but still correct and must not be
 * dressed up as a failure.
 */
export function clientState(status: LcuStatus | null | undefined): ClientState {
    if (!status) {
        return {
            kind: "unknown",
            tone: "neutral",
            title: "État du client inconnu",
            description: "DraftPredict n'a pas encore reçu l'état du client League.",
            live: false,
        };
    }
    if (!status.enabled) {
        return {
            kind: "disabled",
            tone: "offline",
            title: "Intégration au client désactivée",
            description:
                "Activez l'intégration au client League dans les paramètres pour refléter la sélection des champions en direct.",
            live: false,
        };
    }
    if (!status.connected) {
        return {
            kind: "absent",
            tone: "offline",
            title: "Client League non détecté",
            description: status.running
                ? "DraftPredict cherche le client. Lancez League of Legends et connectez-vous : la détection est automatique."
                : "Lancez League of Legends : la sélection des champions apparaîtra ici automatiquement.",
            live: false,
        };
    }
    const transport = status.polling
        ? " (mises à jour par sondage : le client n'accepte pas la connexion temps réel, c'est un peu plus lent)"
        : "";
    if (status.inChampSelect || status.phase === "ChampSelect") {
        return {
            kind: "champselect",
            tone: "positive",
            title: "Sélection des champions en cours",
            description: `Le tableau ci-dessous suit le client en direct${transport}.`,
            live: true,
        };
    }
    if (status.phase === "InProgress" || status.phase === "GameStart") {
        return {
            kind: "ingame",
            tone: "positive",
            title: "Partie en cours sur le client",
            description: `Le client est en jeu${transport}.`,
            live: true,
        };
    }
    return {
        kind: "connected",
        tone: "info",
        title: "Client connecté",
        description: `${gameflowPhaseLabel(status.phase)} — rien à afficher tant qu'une partie n'a pas commencé${transport}.`,
        live: true,
    };
}

// --------------------------------------------------------- champion select --

export type ChampSelectRow = {
    role: Role;
    championKey: string | null;
    /** The champion is only hovered: it can still change. */
    hovered: boolean;
    isLocalPlayer: boolean;
    /** This cell is the one acting right now. */
    acting: boolean;
    cellId: number | null;
    championName: string | null;
    /** `true` when the position comes from the client, not from an inference. */
    assigned: boolean;
};

function emptyRow(role: Role): ChampSelectRow {
    return {
        role,
        championKey: null,
        hovered: false,
        isLocalPlayer: false,
        acting: false,
        cellId: null,
        championName: null,
        assigned: false,
    };
}

type PlayerState = SerializedChampSelectState["allyPlayers"][number];

function rowOfPlayer(
    role: Role,
    player: PlayerState,
    actorCellId: number | null,
): ChampSelectRow {
    const locked = player.championKey ?? null;
    const hoveredKey = player.hoveredChampionKey ?? null;
    return {
        role,
        championKey: locked ?? hoveredKey,
        hovered: locked === null && hoveredKey !== null,
        isLocalPlayer: player.isLocalPlayer === true,
        acting: actorCellId !== null && player.cellId === actorCellId,
        cellId: player.cellId,
        championName: player.championName ?? null,
        assigned: player.assignedRole !== null && player.assignedRole !== undefined,
    };
}

/**
 * One row per position for a side of champion select, always five, always in
 * role order.
 *
 * The per-cell detail is used when the client exposes it (it carries hovers,
 * the local player and the acting cell); otherwise the serialized `[role, key]`
 * maps are enough to draw the board. Cells without an assigned position are
 * placed in the free slots rather than dropped.
 */
export function champSelectRows(
    state: SerializedChampSelectState | null | undefined,
    side: LiveSide,
): ChampSelectRow[] {
    const rows = new Map<Role, ChampSelectRow>(
        ROLES.map((role) => [role, emptyRow(role)]),
    );
    if (!state) return ROLES.map((role) => rows.get(role)!);

    const players = (side === "ally" ? state.allyPlayers : state.opponentPlayers) ?? [];
    const actorCellId = state.currentActorCellId ?? null;
    const taken = new Set<Role>();
    const pending: PlayerState[] = [];

    for (const player of players) {
        const role = player.role ?? player.assignedRole;
        if (role === null || role === undefined || taken.has(role)) {
            pending.push(player);
            continue;
        }
        taken.add(role);
        rows.set(role, rowOfPlayer(role, player, actorCellId));
    }
    for (const player of pending) {
        const free = ROLES.find((role) => !taken.has(role));
        if (free === undefined) break;
        taken.add(free);
        rows.set(free, { ...rowOfPlayer(free, player, actorCellId), assigned: false });
    }

    if (players.length === 0) {
        const locked = (side === "ally" ? state.ally : state.opponent) ?? [];
        const hovers =
            (side === "ally" ? state.allyHovers : state.opponentHovers) ?? [];
        for (const [role, championKey] of locked) {
            rows.set(role, { ...emptyRow(role), championKey, assigned: true });
        }
        for (const [role, championKey] of hovers) {
            if (rows.get(role)?.championKey) continue;
            rows.set(role, {
                ...emptyRow(role),
                championKey,
                hovered: true,
                assigned: true,
            });
        }
    }

    return ROLES.map((role) => rows.get(role)!);
}

export type TurnInfo = {
    side: LiveSide | null;
    role: Role | null;
    local: boolean;
    label: string;
};

/** Whose turn it is, or `null` between two actions. */
export function turnInfo(
    state: SerializedChampSelectState | null | undefined,
): TurnInfo | null {
    if (!state) return null;
    if (state.isLocalPlayerTurn) {
        return { side: "ally", role: null, local: true, label: "À vous de jouer" };
    }
    const cellId = state.currentActorCellId;
    if (cellId === null || cellId === undefined) return null;

    const ally = (state.allyPlayers ?? []).find((player) => player.cellId === cellId);
    if (ally) {
        const role = ally.role ?? ally.assignedRole ?? null;
        return {
            side: "ally",
            role,
            local: false,
            label:
                role === null
                    ? "Tour d'un allié"
                    : `Tour d'un allié — ${roleLongLabels[role]}`,
        };
    }
    const enemy = (state.opponentPlayers ?? []).find(
        (player) => player.cellId === cellId,
    );
    const role = enemy ? (enemy.role ?? enemy.assignedRole ?? null) : null;
    return {
        side: "opponent",
        role,
        local: false,
        label:
            role === null
                ? "Tour de l'équipe adverse"
                : `Tour de l'équipe adverse — ${roleLongLabels[role]}`,
    };
}

// ------------------------------------------------------------- live game ----

const QUEUE_LABELS: Record<number, string> = {
    0: "Partie personnalisée",
    400: "Normale draft",
    420: "Classée solo/duo",
    430: "Normale aveugle",
    440: "Classée flexible",
    450: "ARAM",
    480: "Swiftplay",
    490: "Partie rapide",
    700: "Clash",
    720: "Clash ARAM",
    900: "ARURF",
    1020: "Un pour tous",
    1300: "Nexus Blitz",
    1400: "Grimoire ultime",
    1700: "Arena",
    1710: "Arena",
    1900: "URF",
};

/** French name of a queue, falling back to the game mode the API reports. */
export function queueLabel(
    queueId: number | null | undefined,
    gameMode?: string | null,
): string {
    if (typeof queueId === "number" && QUEUE_LABELS[queueId]) {
        return QUEUE_LABELS[queueId]!;
    }
    if (gameMode) return gameMode;
    return typeof queueId === "number" ? `File ${queueId}` : "Partie";
}

/**
 * Seconds elapsed in a spectated game.
 *
 * `gameStartTime` is `0` during the loading screen and `gameLength` is the age
 * of the game *at the moment the server answered*, so the clock keeps running
 * between two polls instead of freezing on the last payload.
 */
export function elapsedSeconds(
    game: Pick<CurrentGameInfo, "gameStartTime" | "gameLength"> | null | undefined,
    fetchedAt: number,
    now: number,
): number {
    if (!game) return 0;
    const drift = Math.max(0, (now - fetchedAt) / 1000);
    const base =
        game.gameStartTime > 0
            ? (now - game.gameStartTime) / 1000
            : (game.gameLength ?? 0) + drift;
    return Math.max(0, Math.round(base));
}

/** `true` while the game exists but nobody is on the map yet. */
export function isLoadingScreen(
    game: Pick<CurrentGameInfo, "gameStartTime" | "gameLength"> | null | undefined,
): boolean {
    if (!game) return false;
    return game.gameStartTime <= 0 && (game.gameLength ?? 0) <= 0;
}

export type LiveParticipant = {
    /** Stable list key. */
    id: string;
    championKey: string;
    role: Role | null;
    /** `Nom#TAG` when Riot exposes it on the spectator payload. */
    riotId: string | null;
    puuid: string | null;
    /** The account this screen is about. */
    isTarget: boolean;
    bot: boolean;
    spellIds: number[];
    /** What the champion alone is worth, from the engine's breakdown. */
    contribution: { winrateDelta: number; wins: number; games: number } | null;
    /**
     * The lane duel against the opposite side. Always expressed from the
     * watched team's point of view, on both rows.
     */
    matchup: {
        opponentKey: string;
        /** Positive means the duel favours the watched team. */
        winrateDelta: number;
        wins: number;
        games: number;
    } | null;
};

export type LiveTeams = {
    ally: LiveParticipant[];
    opponent: LiveParticipant[];
    /** Riot team id of the watched side (100 blue, 200 red). */
    allyTeamId: number;
};

function rolesByChampion(entries: readonly [Role, string][]): Map<string, Role> {
    const map = new Map<string, Role>();
    for (const [role, championKey] of entries) {
        if (!map.has(championKey)) map.set(championKey, role);
    }
    return map;
}

function contributionIndex(
    group: ContributionGroup | undefined,
): Map<string, ContributionEntry> {
    const index = new Map<string, ContributionEntry>();
    for (const entry of group?.entries ?? []) {
        const champion = entry.champions[0];
        if (!champion) continue;
        index.set(`${champion.key}:${champion.role}`, entry);
    }
    return index;
}

function matchupIndex(
    breakdown: DraftBreakdown | undefined,
): Map<
    string,
    { opponentKey: string; winrateDelta: number; wins: number; games: number }
> {
    const index = new Map<
        string,
        { opponentKey: string; winrateDelta: number; wins: number; games: number }
    >();
    for (const entry of breakdown?.matchups?.entries ?? []) {
        const [ally, enemy] = entry.champions;
        if (!ally || !enemy) continue;
        // The engine measures every ally against every enemy; only the
        // same-position pair is the lane duel a player recognises.
        if (ally.role !== enemy.role) continue;
        // Both rows carry the same, ally-centric number: a duel is one fact,
        // and flipping its sign per row would make green mean two things.
        index.set(`${ally.key}:${ally.role}`, {
            opponentKey: enemy.key,
            winrateDelta: entry.winrateDelta,
            wins: entry.wins,
            games: entry.games,
        });
        index.set(`${enemy.key}:${enemy.role}`, {
            opponentKey: ally.key,
            winrateDelta: entry.winrateDelta,
            wins: entry.wins,
            games: entry.games,
        });
    }
    return index;
}

function sortRows(rows: LiveParticipant[]): LiveParticipant[] {
    return [...rows].sort((a, b) => {
        if (a.role === b.role) return 0;
        if (a.role === null) return 1;
        if (b.role === null) return -1;
        return a.role - b.role;
    });
}

/**
 * Both teams of a spectated game, seen from `puuid`'s side.
 *
 * Positions come from the draft the server inferred with `predictRoles` (the
 * spectator API does not carry them); everything the engine measured about a
 * champion — its own rating and its lane duel — is attached to the player who
 * is playing it, which is the only per-player context that rests on real data.
 */
export function liveTeams(
    game: CurrentGameInfo | null | undefined,
    draft: SerializedDraftState | null | undefined,
    puuid: string | null,
    analysis: AnalyzePayload | null | undefined,
): LiveTeams {
    const participants: SpectatorParticipant[] = game?.participants ?? [];
    const me = participants.find(
        (participant) => puuid !== null && participant.puuid === puuid,
    );
    const allyTeamId = me?.teamId ?? participants[0]?.teamId ?? 100;

    const allyRoles = rolesByChampion(draft?.ally ?? []);
    const opponentRoles = rolesByChampion(draft?.opponent ?? []);
    const allyContributions = contributionIndex(analysis?.breakdown?.allyChampions);
    const enemyContributions = contributionIndex(analysis?.breakdown?.enemyChampions);
    const matchups = matchupIndex(analysis?.breakdown);

    const build = (
        participant: SpectatorParticipant,
        side: LiveSide,
    ): LiveParticipant => {
        const championKey = String(participant.championId);
        const role =
            (side === "ally" ? allyRoles : opponentRoles).get(championKey) ?? null;
        const slot = role === null ? null : `${championKey}:${role}`;
        const contribution = slot
            ? ((side === "ally" ? allyContributions : enemyContributions).get(slot) ??
              null)
            : null;
        const duel = slot ? (matchups.get(slot) ?? null) : null;
        return {
            id: `${participant.teamId}-${championKey}-${participant.puuid ?? participant.summonerId ?? "?"}`,
            championKey,
            role,
            riotId: participant.riotId ?? null,
            puuid: participant.puuid ?? null,
            isTarget: puuid !== null && participant.puuid === puuid,
            bot: participant.bot === true,
            spellIds: [participant.spell1Id, participant.spell2Id].filter(
                (id): id is number => typeof id === "number" && id > 0,
            ),
            contribution: contribution
                ? {
                      // Enemy champions help the watched team when they are weak.
                      winrateDelta:
                          side === "ally"
                              ? contribution.winrateDelta
                              : -contribution.winrateDelta,
                      wins: contribution.wins,
                      games: contribution.games,
                  }
                : null,
            matchup: duel,
        };
    };

    return {
        allyTeamId,
        ally: sortRows(
            participants
                .filter((participant) => participant.teamId === allyTeamId)
                .map((participant) => build(participant, "ally")),
        ),
        opponent: sortRows(
            participants
                .filter((participant) => participant.teamId !== allyTeamId)
                .map((participant) => build(participant, "opponent")),
        ),
    };
}

/** Banned champions of a spectated game, split by side. `-1` means "no ban". */
export function liveBans(
    game: CurrentGameInfo | null | undefined,
    allyTeamId: number,
): { ally: string[]; opponent: string[] } {
    const bans = { ally: [] as string[], opponent: [] as string[] };
    const banned = [...(game?.bannedChampions ?? [])].sort(
        (a, b) => a.pickTurn - b.pickTurn,
    );
    for (const ban of banned) {
        if (!ban || ban.championId <= 0) continue;
        const side: LiveSide = ban.teamId === allyTeamId ? "ally" : "opponent";
        bans[side].push(String(ban.championId));
    }
    return bans;
}

// -------------------------------------------------------------- breakdown ---

export type BreakdownRow = {
    id: string;
    label: string;
    /** Signed, ally-centric contribution to the total rating. */
    rating: number;
    /** The same contribution expressed in win-probability points. */
    effect: number;
    /** How many measured pairs/champions the group rests on. */
    entries: number;
    /** Smallest sample inside the group — the one that binds the whole row. */
    minGames: number;
};

function groupStats(...groups: (ContributionGroup | undefined)[]): {
    entries: number;
    minGames: number;
} {
    let entries = 0;
    let minGames = Number.POSITIVE_INFINITY;
    for (const group of groups) {
        for (const entry of group?.entries ?? []) {
            entries += 1;
            if (entry.games > 0 && entry.games < minGames) minGames = entry.games;
        }
    }
    return { entries, minGames: Number.isFinite(minGames) ? minGames : 0 };
}

/**
 * The four things that move the prediction, each as an effect on the watched
 * team's win probability. Ratings are additive, win probabilities are not, so
 * the rating is what is summed and the percentage is only ever displayed.
 */
export function breakdownRows(
    analysis: AnalyzePayload | null | undefined,
): BreakdownRow[] {
    const breakdown = analysis?.breakdown;
    if (!breakdown) return [];
    const rows: BreakdownRow[] = [
        {
            id: "ally-champions",
            label: "Champions de votre équipe",
            rating: breakdown.allyChampions?.totalRating ?? 0,
            ...groupStats(breakdown.allyChampions),
            effect: 0,
        },
        {
            id: "enemy-champions",
            label: "Champions adverses",
            rating: -(breakdown.enemyChampions?.totalRating ?? 0),
            ...groupStats(breakdown.enemyChampions),
            effect: 0,
        },
        {
            id: "duos",
            label: "Synergies",
            rating:
                (breakdown.allyDuos?.totalRating ?? 0) -
                (breakdown.enemyDuos?.totalRating ?? 0),
            ...groupStats(breakdown.allyDuos, breakdown.enemyDuos),
            effect: 0,
        },
        {
            id: "matchups",
            label: "Duels de voie",
            rating: breakdown.matchups?.totalRating ?? 0,
            ...groupStats(breakdown.matchups),
            effect: 0,
        },
    ];
    return rows.map((row) => ({
        ...row,
        effect: ratingToWinrate(row.rating) - 0.5,
    }));
}

/** Champion names of one contribution, for a French label. */
function entryLabel(entry: ContributionEntry, separator: string): string {
    return entry.champions
        .map((champion) => champion.name ?? champion.id ?? `#${champion.key}`)
        .join(` ${separator} `);
}

/**
 * The binding sample of the whole analysis: the smallest one every number
 * rests on. A 53 % prediction built on a 30-game duel is not a 53 %
 * prediction, and the view has to be able to say so.
 */
export function smallestSample(
    analysis: AnalyzePayload | null | undefined,
): { games: number; label: string } | null {
    const breakdown = analysis?.breakdown;
    if (!breakdown) return null;
    const candidates: { entry: ContributionEntry; separator: string }[] = [];
    for (const group of [breakdown.allyChampions, breakdown.enemyChampions]) {
        for (const entry of group?.entries ?? [])
            candidates.push({ entry, separator: "" });
    }
    for (const group of [breakdown.allyDuos, breakdown.enemyDuos]) {
        for (const entry of group?.entries ?? [])
            candidates.push({ entry, separator: "+" });
    }
    for (const entry of breakdown.matchups?.entries ?? []) {
        candidates.push({ entry, separator: "vs" });
    }
    const measured = candidates.filter(
        ({ entry }) => Number.isFinite(entry.games) && entry.games > 0,
    );
    if (measured.length === 0) return null;
    let smallest = measured[0]!;
    for (const candidate of measured) {
        if (candidate.entry.games < smallest.entry.games) smallest = candidate;
    }
    return {
        games: smallest.entry.games,
        label: entryLabel(smallest.entry, smallest.separator).trim(),
    };
}

// ---------------------------------------------------------------- polling ---

export const POLL_BASE_MS = 15_000;
export const POLL_MAX_MS = 120_000;

/**
 * A bounded, deterministic backoff: 15 s, 30 s, 60 s, then 2 min for as long as
 * nothing happens. Deterministic because the screen tells the user when the
 * next check happens, and a jittered interval would make that a lie.
 */
export function pollIntervalMs(
    idleChecks: number,
    base = POLL_BASE_MS,
    max = POLL_MAX_MS,
): number {
    if (!Number.isFinite(idleChecks) || idleChecks <= 0) return base;
    return Math.min(max, base * 2 ** Math.floor(idleChecks));
}

/** `15 s`, `1 min`, `2 min` — an interval a human can read. */
export function intervalLabel(intervalMs: number): string {
    const seconds = Math.max(1, Math.round(intervalMs / 1000));
    if (seconds < 60) return `${seconds}${NBSP}s`;
    const minutes = Math.round(seconds / 60);
    return `${minutes}${NBSP}min`;
}

export type PollingState = {
    /** Something is actually being watched. */
    active: boolean;
    /** Suspended on purpose because the tab is hidden. */
    paused: boolean;
    intervalMs: number;
};

/** One sentence describing what the automatic check is doing right now. */
export function pollingSentence(state: PollingState): string {
    if (!state.active) {
        return "Aucune surveillance automatique : indiquez un compte à suivre ci-dessous.";
    }
    if (state.paused) {
        return "Surveillance en pause : l'onglet est en arrière-plan. Elle reprend dès que vous revenez.";
    }
    return `Vérification automatique toutes les ${intervalLabel(state.intervalMs)} ; l'intervalle s'allonge tant qu'il ne se passe rien.`;
}

// -------------------------------------------------------------- riot ids ----

/** `Nom#TAG` split in two, or `null` when the input is not a Riot ID. */
export function parseRiotId(
    value: string | null | undefined,
): { gameName: string; tagLine: string } | null {
    const trimmed = (value ?? "").trim();
    const hash = trimmed.lastIndexOf("#");
    if (hash <= 0 || hash === trimmed.length - 1) return null;
    return {
        gameName: trimmed.slice(0, hash),
        tagLine: trimmed.slice(hash + 1),
    };
}

/** The identity of the account being watched, however it was resolved. */
export type LiveTarget = {
    puuid: string;
    label: string;
    /** `lcu` — read from the running client; `search` — typed by the user. */
    source: "lcu" | "search";
    platform?: string;
};
