import type {
    AnalyzeDraftConfig,
    ChampionDamageProfile,
    Dataset,
    DraftResult,
    Rank,
    Region,
    RiskLevel,
    Role,
    SerializedDraftState,
    WinrateByTime,
} from "@draftpredict/core";
import type { ChampSelectState } from "@draftpredict/lcu";
import type {
    ChampionMasteryDto,
    CurrentGameInfo,
    LeagueEntryDto,
    MatchSummary,
    PlaystyleProfile,
    RankedSummary,
    RiotAccountDto,
    SummonerDto,
} from "@draftpredict/riot";

/**
 * The wire types of `apps/server`, mirrored for the browser.
 *
 * They are written against `docs/API.md` and the route handlers, and they
 * re-use the real domain types from `@draftpredict/core`, `/riot` and `/lcu`
 * (type-only imports — no runtime code from those packages ends up in the
 * bundle). If the server changes, this file changes with it.
 */

// ----------------------------------------------------------------- errors ---

export type ApiErrorBody = {
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
};

/** Every code `apps/server` can produce. Match on these, never on messages. */
export const API_ERROR_CODES = [
    "VALIDATION_ERROR",
    "UNKNOWN_CHAMPION",
    "CHAMPION_ON_BOTH_TEAMS",
    "DUPLICATE_ROLE",
    "INVALID_RIOT_ID",
    "RIOT_KEY_INVALID",
    "RIOT_KEY_REJECTED",
    "UNKNOWN_PLATFORM",
    "NOT_FOUND",
    "LCU_NO_SUMMONER",
    "RIOT_KEY_MISSING",
    "RATE_LIMITED",
    "DATASET_UNAVAILABLE",
    "INTERNAL_ERROR",
    "NETWORK_ERROR",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number] | (string & {});

// ---------------------------------------------------------------- dataset ---

export type DatasetWindow = "patch" | "full";
export type DatasetSource = "memory" | "disk" | "provider" | "stale";

export type DatasetMeta = {
    rank: Rank;
    region: Region;
    window: DatasetWindow;
    patch: string | null;
    /** Provider that actually answered: `local-file`, `draftgap-remote`, `bundled-fixture`. */
    provider: string;
    source: DatasetSource;
    version: string;
    /** `YYYY-MM-DD`. */
    date: string;
    championCount: number;
    loadedAt: number;
    /** `true` when the numbers are the synthetic offline fixture. */
    offline: boolean;
};

/** Both windows at once — what every analysis response carries. */
export type DatasetPairMeta = {
    rank: Rank;
    region: Region;
    provider: string;
    date: string;
    offline: boolean;
    patch: DatasetMeta;
    full: DatasetMeta;
};

export type DatasetResponse = {
    meta: DatasetMeta;
    providers: string[];
    /** Only present with `include=full` — tens of megabytes. */
    dataset?: Dataset;
};

export type DatasetProvidersResponse = {
    providers: string[];
    last: DatasetMeta | null;
};

export type DatasetRefreshResponse = { dataset: DatasetPairMeta };

export type DatasetQuery = {
    rank?: Rank;
    region?: Region;
    patch?: string;
    window?: DatasetWindow;
    include?: "meta" | "full";
};

// ----------------------------------------------------------------- health ---

export type StaticDataSource = "bundled" | "cache";

export type HealthResponse = {
    status: "ok" | "degraded";
    version: string;
    uptimeMs: number;
    staticData: {
        version: string;
        language: string;
        source: StaticDataSource;
        champions: number;
    };
    dataset:
        | ({ available: true; providers: string[] } & DatasetMeta)
        | { available: false; error: string | null };
    lcu: LcuStatus;
    riot: { configured: boolean; platform: string };
    web: { served: boolean; root: string | null };
    websocket: { clients: number; heartbeatMs: number };
};

// ----------------------------------------------------------------- config ---

export type ConfigOrigin = "default" | "env" | "file";
export type ThemePreference = "dark" | "light" | "system";

/** Note the absence of `riotApiKey`: the key never crosses the wire. */
export type PublicConfig = {
    platform: string;
    rank: Rank;
    region: Region;
    riskLevel: RiskLevel;
    minGames: number;
    ignoreChampionWinrates: boolean;
    lcuEnabled: boolean;
    allowRemoteDataset: boolean;
    datasetLocalRoot: string | null;
    language: string;
    theme: ThemePreference;
    hasRiotApiKey: boolean;
    /** `RGAPI-****1234`, or `null`. */
    riotApiKeyPreview: string | null;
    riotApiKeySource: ConfigOrigin | null;
    configPath: string;
};

export type ConfigResponse = {
    config: PublicConfig;
    dataset: { providers: string[]; last: DatasetMeta | null };
    staticData: { version: string; source: StaticDataSource; language: string };
};

export type RiotKeyProbeResult = {
    attempted: boolean;
    ok: boolean;
    status: "ok" | "unauthorized" | "unreachable" | "skipped";
    message: string;
};

/** Every field optional — only what you send is changed. */
export type ConfigUpdate = {
    /** `null` or `""` clears the stored key. */
    riotApiKey?: string | null;
    platform?: string;
    rank?: Rank | string;
    region?: Region | string;
    riskLevel?: RiskLevel | string;
    minGames?: number;
    ignoreChampionWinrates?: boolean;
    lcuEnabled?: boolean;
    allowRemoteDataset?: boolean;
    datasetLocalRoot?: string | null;
    language?: string;
    theme?: ThemePreference;
    /** `false` skips the live Riot probe. */
    validateKey?: boolean;
};

export type ConfigUpdateResponse = {
    config: PublicConfig;
    probe: RiotKeyProbeResult;
};

// ----------------------------------------------------------------- static ---

export type ChampionSummary = {
    /** Dataset key: the numeric champion key as a string, e.g. `"266"`. */
    key: string;
    /** Data Dragon id, e.g. `"MonkeyKing"`. */
    id: string;
    name: string;
    title: string;
    tags: string[];
    /** Data Dragon CDN URL — may be unreachable, always provide a fallback. */
    icon: string;
};

export type StaticSummary = {
    version: string;
    language: string;
    source: StaticDataSource;
    counts: {
        champions: number;
        items: number;
        runes: number;
        summonerSpells: number;
    };
    champions: ChampionSummary[];
};

export type ChampionSpellDetail = {
    id: string;
    slot: "Q" | "W" | "E" | "R";
    name: string;
    description: string;
    cooldown: string;
    cost: string;
    costType: string;
    range: string;
    icon: string;
};

export type ChampionDetail = ChampionSummary & {
    partype: string;
    info: { attack: number; defense: number; magic: number; difficulty: number } | null;
    stats: Record<string, number>;
    splash: string;
    loading: string;
    passive: { name: string; description: string; icon: string } | null;
    spells: ChampionSpellDetail[];
};

export type StaticChampionsResponse = {
    version: string;
    language: string;
    source: StaticDataSource;
    champions: ChampionDetail[];
};

export type ItemDetail = {
    id: number;
    name: string;
    plaintext: string;
    description: string;
    gold: { base: number; total: number; sell: number; purchasable: boolean };
    tags: string[];
    from: number[];
    into: number[];
    depth: number;
    stats: Record<string, number>;
    icon: string;
};

export type StaticItemsResponse = { version: string; items: ItemDetail[] };

export type RuneDetail = {
    id: number;
    key: string;
    name: string;
    shortDesc: string;
    longDesc: string;
    slot: number;
    index: number;
    icon: string;
};

export type RunePathDetail = {
    id: number;
    key: string;
    name: string;
    icon: string;
    /** `slots[0]` is the keystone row. */
    slots: RuneDetail[][];
};

export type StatShardDetail = {
    id: number;
    key: string;
    name: string;
    icon: string;
    positions: {
        slot: "offense" | "flex" | "defense";
        slotIndex: number;
        index: number;
    }[];
};

export type StaticRunesResponse = {
    version: string;
    paths: RunePathDetail[];
    /** Always three rows, offense first. */
    shardRows: StatShardDetail[][];
};

export type SummonerSpellDetail = {
    key: number;
    id: string;
    name: string;
    description: string;
    cooldown: number;
    summonerLevel: number;
    modes: string[];
    icon: string;
};

export type StaticSummonerSpellsResponse = {
    version: string;
    summonerSpells: SummonerSpellDetail[];
};

export type StaticSearchResponse = {
    query: string;
    results: ChampionSummary[];
};

// ------------------------------------------------------------------ draft ---

/** `[role, championKey][]` — `Map` is not JSON-serialisable. */
export type TeamEntries = [Role, string][];

export type DraftBans = { ally: string[]; opponent: string[] };

export type DraftConfigInput = {
    riskLevel?: RiskLevel | string;
    minGames?: number;
    ignoreChampionWinrates?: boolean;
};

export type DraftRequest = {
    team: TeamEntries;
    enemy: TeamEntries;
    bans?: DraftBans;
    config?: DraftConfigInput;
    rank?: Rank;
    region?: Region;
    patch?: string;
};

export type SuggestionsRequest = DraftRequest & {
    /** Per role, 1-100. Default 10. */
    limit?: number;
    /** Restrict the sweep. Default: every open ally role. */
    roles?: Role[];
};

export type BansRequest = DraftRequest & {
    /** 1-200. Default 20. */
    limit?: number;
};

export type ChampionRef = {
    key: string;
    id: string | null;
    name: string | null;
    icon: string | null;
};

export type ContributionEntry = {
    /** One champion for a solo rating, two for a duo or a matchup. */
    champions: (ChampionRef & { role: Role })[];
    rating: number;
    /** `ratingToWinrate(rating) - 0.5` — render bars from this. */
    winrateDelta: number;
    /** Can be fractional: the engine blends samples with a Bayesian prior. */
    wins: number;
    games: number;
};

export type ContributionGroup = {
    entries: ContributionEntry[];
    totalRating: number;
};

export type DraftBreakdown = {
    allyChampions: ContributionGroup;
    enemyChampions: ContributionGroup;
    allyDuos: ContributionGroup;
    enemyDuos: ContributionGroup;
    /** `champions[0]` is the ally, `champions[1]` the enemy. */
    matchups: ContributionGroup;
};

export type DamageDistribution = ChampionDamageProfile & { total: number };

export type AnalyzePayload = {
    dataset: DatasetPairMeta;
    config: AnalyzeDraftConfig;
    state: SerializedDraftState;
    /** Raw engine output. */
    result: DraftResult;
    /** The same numbers, resolved and expressed as win-probability deltas. */
    breakdown: DraftBreakdown;
    /** Always 5 buckets, 20 to 40 minutes. */
    winrateByTime: WinrateByTime[];
    damageDistribution: { ally: DamageDistribution; opponent: DamageDistribution };
};

export type DraftBaseline = { totalRating: number; winrate: number };

export type SuggestionEntry = ChampionRef & {
    role: Role;
    rating: number;
    /** Ally win probability if this champion is picked. */
    winrate: number;
    /** `winrate - baseline.winrate`. */
    winrateDelta: number;
    games: number;
};

export type SuggestionsPayload = {
    dataset: DatasetPairMeta;
    config: AnalyzeDraftConfig;
    state: SerializedDraftState;
    baseline: DraftBaseline;
    roles: { role: Role; open: boolean; suggestions: SuggestionEntry[] }[];
    /** Best suggestions across every open role, best first. */
    best: SuggestionEntry[];
};

export type BanEntry = ChampionRef & {
    role: Role;
    rating: number;
    /** Ally win probability if the enemy got this champion. */
    winrate: number;
    /** `baseline.winrate - winrate`: positive means banning it helps. */
    winrateLoss: number;
    games: number;
};

export type BansPayload = {
    dataset: DatasetPairMeta;
    config: AnalyzeDraftConfig;
    state: SerializedDraftState;
    baseline: DraftBaseline;
    bans: BanEntry[];
};

// ----------------------------------------------------------------- builds ---

export type BuildMatchupEntry = {
    championKey: string;
    name: string | null;
    role: Role;
    rating: number;
    wins: number;
    games: number;
};

export type BuildEntry = {
    /** Numeric id for items/runes/spells, or the set/skill string (`"WEQ"`). */
    id: number | string;
    name: string | null;
    /** `null` for skill orders — render a letter instead. */
    icon: string | null;
    /** Multi-item sets and spell pairs resolve to their components. */
    components?: { id: number; name: string | null; icon: string | null }[];
    rating: number;
    /** Raw `wins / games` of the choice in the current patch sample. */
    winrate: number;
    /** `ratingToWinrate(rating) - 0.5` — what the choice is worth. */
    winrateDelta: number;
    wins: number;
    games: number;
    /** Populated only when `vs` was supplied. */
    matchups: BuildMatchupEntry[];
};

export type BuildsPayload = {
    dataset: DatasetPairMeta;
    champion: ChampionRef;
    role: Role;
    config: AnalyzeDraftConfig;
    source: {
        provider: string;
        description: string;
        /** `true` while the numbers come from the offline fixture. */
        offline: boolean;
        games: number;
        wins: number;
    };
    matchups: { championKey: string; name: string | null; role: Role }[];
    items: {
        boots: BuildEntry[];
        startingSets: BuildEntry[];
        /** Legitimately EMPTY in the offline fixture — render defensively. */
        sets: BuildEntry[];
        /** One list per build-order slot: first item, second item, … */
        byOrder: BuildEntry[][];
    };
    runes: {
        primary: BuildEntry[];
        secondary: BuildEntry[];
        shards: { offense: BuildEntry[]; flex: BuildEntry[]; defense: BuildEntry[] };
    };
    summonerSpells: BuildEntry[];
    skills: {
        order: BuildEntry[];
        /** 18 rows, one per level. */
        levels: BuildEntry[][];
    };
};

export type BuildsQuery = {
    role?: Role | string;
    /** `"64:1,157:2"` — comma-separated `key` or `key:role`. */
    vs?: string;
    riskLevel?: RiskLevel | string;
    minGames?: number;
    ignoreChampionWinrates?: boolean;
    rank?: Rank;
    region?: Region;
    patch?: string;
};

// ---------------------------------------------------------------- account ---

export type AccountLookupResponse = {
    puuid: string;
    gameName: string;
    tagLine: string;
    platform: string;
};

export type MasteryEntry = ChampionMasteryDto & { champion: ChampionRef };

export type ProfileResponse = {
    platform: string;
    account: RiotAccountDto | null;
    summoner: SummonerDto;
    ranks: RankedSummary;
    mastery: MasteryEntry[];
};

export type MatchesResponse = {
    puuid: string;
    platform: string;
    count: number;
    matches: MatchSummary[];
    /** Match ids Riot returned but whose detail could not be fetched. */
    skipped: string[];
    fetchedAt: number;
};

export type PlaystyleResponse = {
    puuid: string;
    platform: string;
    sampleSize: number;
    cached: boolean;
    fetchedAt: number;
    profile: PlaystyleProfile;
};

export type LiveGameResponse = {
    puuid: string;
    platform: string;
    inGame: boolean;
    game: CurrentGameInfo | null;
    draft: SerializedDraftState | null;
    dataset: DatasetPairMeta;
    analysis: AnalyzePayload | null;
};

export type { LeagueEntryDto, MatchSummary, PlaystyleProfile, RankedSummary };

// -------------------------------------------------------------------- LCU ---

export type LcuSummonerInfo = {
    puuid: string;
    gameName: string | null;
    tagLine: string | null;
    displayName: string | null;
    summonerLevel: number | null;
    profileIconId: number | null;
};

export type LcuStatus = {
    /** The integration is switched on and a watcher exists. */
    enabled: boolean;
    /** The watcher is looking for or following a client. */
    running: boolean;
    /** A League Client is answering right now. */
    connected: boolean;
    /** Events come from polling because the LCU WebSocket could not open. */
    polling: boolean;
    phase: string | null;
    inChampSelect: boolean;
    summoner: LcuSummonerInfo | null;
    /** Last non-fatal watcher failure, already redacted. */
    lastError: string | null;
    updatedAt: number;
};

/** `ChampSelectState` with its four `Map`s flattened to `[role, key][]`. */
export type SerializedChampSelectState = Omit<
    ChampSelectState,
    "ally" | "opponent" | "allyHovers" | "opponentHovers"
> & {
    ally: TeamEntries;
    opponent: TeamEntries;
    allyHovers: TeamEntries;
    opponentHovers: TeamEntries;
};

export type LcuChampSelectResponse = {
    inChampSelect: boolean;
    status: LcuStatus;
    state: SerializedChampSelectState | null;
    analysis: AnalyzePayload | null;
    suggestions: SuggestionsPayload | null;
    updatedAt?: number;
};

/** `GET /api/lcu/summoner` — the raw LCU payload. */
export type LcuSummonerResponse = {
    puuid: string;
    accountId?: number;
    displayName?: string;
    gameName?: string;
    tagLine?: string;
    internalName?: string;
    profileIconId?: number;
    summonerId?: number;
    summonerLevel?: number;
    percentCompleteForNextLevel?: number;
};

// -------------------------------------------------------------- WebSocket ---

export const WS_TOPICS = [
    "lcu",
    "champselect",
    "draft",
    "config",
    "dataset",
    "jobs",
] as const;

export type WsTopic = (typeof WS_TOPICS)[number];

export type ServerMessage =
    | {
          type: "hello";
          clientId: string;
          topics: WsTopic[];
          heartbeatMs: number;
          staticDataVersion: string;
      }
    | { type: "lcu:status"; status: LcuStatus }
    | {
          type: "champselect:update";
          state: SerializedChampSelectState;
          analysis: AnalyzePayload;
          suggestions: SuggestionsPayload;
      }
    | { type: "champselect:end" }
    | {
          type: "draft:analysis";
          requestId: string | null;
          analysis: AnalyzePayload;
          suggestions: SuggestionsPayload | null;
      }
    | { type: "config:update"; config: PublicConfig }
    | { type: "dataset:update"; dataset: DatasetPairMeta }
    | {
          type: "job:progress";
          job: string;
          key: string;
          stage: string;
          loaded: number;
          total: number;
      }
    | { type: "pong"; time: number }
    | {
          type: "error";
          requestId: string | null;
          error: { code: string; message: string; details?: unknown };
      };

export type ServerMessageType = ServerMessage["type"];

export type ServerMessageOf<T extends ServerMessageType> = Extract<
    ServerMessage,
    { type: T }
>;

export type ClientMessage =
    | { type: "ping" }
    | { type: "subscribe"; topics?: WsTopic[] }
    | { type: "unsubscribe"; topics?: WsTopic[] }
    | {
          type: "draft:set";
          requestId?: string;
          team: TeamEntries;
          enemy: TeamEntries;
          bans?: DraftBans;
          config?: DraftConfigInput;
          /** Default `true`; `false` skips the expensive suggestion sweep. */
          suggestions?: boolean;
          /** 1-50. */
          limit?: number;
      };

/** Connection state of the live socket, for the status cluster. */
export type WsConnectionState = "connecting" | "open" | "reconnecting" | "closed";
