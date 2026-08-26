/**
 * `@draftpredict/riot` — Riot Games API client, match analysis and playstyle
 * profiling.
 *
 * The client never puts the API key in a URL and redacts it from every error
 * and log line. Match analysis and playstyle profiling are pure functions with
 * no I/O, so they can run on the server, in the desktop app or in tests.
 */

// --- routing --------------------------------------------------------------
export {
    PLATFORMS,
    PLATFORM_IDS,
    REGIONAL_ROUTES,
    getPlatformInfo,
    isPlatformId,
    isRegionalRoute,
    parsePlatform,
    platformBaseUrl,
    platformForRegion,
    platformHost,
    platformToRegional,
    regionForPlatform,
    regionalBaseUrl,
    regionalForPlatform,
    regionalHost,
    type PlatformId,
    type PlatformInfo,
    type RegionalRoute,
} from "./routing.js";

// --- errors ---------------------------------------------------------------
export {
    REDACTED,
    RiotApiError,
    RiotAuthError,
    RiotNetworkError,
    RiotNotFoundError,
    RiotRateLimitError,
    isRetryable,
    isRiotApiError,
    redactApiKey,
    redactValue,
    type RateLimitType,
    type RiotApiErrorOptions,
} from "./errors.js";

// --- rate limiting & caching ---------------------------------------------
export {
    DEV_KEY_RATE_LIMITS,
    PRODUCTION_KEY_RATE_LIMITS,
    RateLimiter,
    type BucketSnapshot,
    type RateLimitRule,
    type RateLimiterOptions,
    type RateLimiterSnapshot,
} from "./rate-limiter.js";

export {
    DEFAULT_CACHE_TTLS,
    TtlCache,
    type RiotMethod,
    type TtlCacheOptions,
} from "./cache.js";

// --- transport ------------------------------------------------------------
export {
    RiotHttpClient,
    computeBackoffMs,
    parseLimitType,
    parseRetryAfter,
    type LogMeta,
    type Logger,
    type RateLimitEvent,
    type RiotFetch,
    type RiotFetchInit,
    type RiotHttpOptions,
    type RiotRequestSpec,
    type RiotResponseLike,
} from "./http.js";

export { buildUrl, encodeSegment, type QueryValue } from "./url.js";

// --- client ---------------------------------------------------------------
export {
    DEFAULT_METHOD_RATE_LIMITS,
    RiotApiClient,
    type RankedSummary,
    type RiotApiClientOptions,
} from "./client.js";

// --- API types ------------------------------------------------------------
export type { RiotAccountDto } from "./types/account.js";
export type { SummonerDto } from "./types/summoner.js";
export type { LeagueEntryDto, LeagueQueueType, MiniSeriesDto } from "./types/league.js";
export type { ChampionMasteryDto } from "./types/mastery.js";
export type {
    MatchChallengesDto,
    MatchDto,
    MatchIdsQuery,
    MatchInfoDto,
    MatchMetadataDto,
    MatchPerksDto,
    MatchTimelineDto,
    MatchTimelineInfoDto,
    ObjectiveDto,
    ParticipantDto,
    TeamDto,
    TimelineEventDto,
    TimelineFrameDto,
    TimelineParticipantFrameDto,
} from "./types/match.js";
export type {
    CurrentGameInfo,
    FeaturedGames,
    SpectatorBannedChampion,
    SpectatorParticipant,
    SpectatorPerks,
} from "./types/spectator.js";

// --- match analysis -------------------------------------------------------
export {
    REMAKE_DURATION_SECONDS,
    resolveDurationSeconds,
    summarizeMatch,
    summarizeMatchForAll,
    summarizeMatchOrNull,
    type MatchDamageSummary,
    type MatchObjectiveSummary,
    type MatchPlayerSummary,
    type MatchRunesSummary,
    type MatchSide,
    type MatchSummary,
    type MatchTeamObjectiveCounts,
    type MatchTeamSummary,
    type MatchVisionSummary,
} from "./match/summary.js";

export { assignTeamRoles, normalizeRole } from "./match/roles.js";

export {
    RANKED_QUEUE_IDS,
    SUMMONERS_RIFT_QUEUE_IDS,
    getQueueName,
    isDraftQueue,
    isRankedQueue,
    queueNameById,
} from "./match/queues.js";

export {
    buildDraftFromMatch,
    buildDraftFromSpectatorGame,
    type SpectatorDraftOptions,
} from "./match/draft.js";

// --- playstyle ------------------------------------------------------------
export { profilePlaystyle } from "./playstyle/profile.js";

export { ARCHETYPES, pickArchetype } from "./playstyle/archetype.js";

export {
    AXIS_METRIC_WEIGHTS,
    LONG_GAME_SECONDS,
    MIN_CONFIDENT_GAMES,
    METRIC_AXES,
    SHORT_GAME_SECONDS,
    axisLabel,
    computeAxes,
    computeAxisDetails,
    computeMetricAxes,
    consistencyScore,
    humanMetric,
    neutralAxes,
    scalingScore,
    standardDeviation,
    type ScalingBuckets,
} from "./playstyle/axes.js";

export {
    BASELINE_METRICS,
    DEFAULT_BASELINES,
    baselineFor,
    clampScore,
    normalizeMetric,
    type BaselineMetric,
    type MetricBaseline,
    type PlaystyleBaselines,
    type RoleBaseline,
} from "./playstyle/baselines.js";

export {
    FALLBACK_ROLE,
    PERFORMANCE_WEIGHTS,
    averageMetrics,
    computeGameMetrics,
    normalizeGameMetrics,
    performanceScore,
    weightedScore,
    type AnalyzedGame,
    type GameMetrics,
} from "./playstyle/metrics.js";

export {
    STRENGTH_THRESHOLD,
    WEAKNESS_THRESHOLD,
    pickStrengths,
    pickWeaknesses,
    strengthLabel,
    weaknessLabel,
} from "./playstyle/traits.js";

export {
    PLAYSTYLE_AXES,
    type ArchetypeKey,
    type AxisDetail,
    type AxisInput,
    type AxisScores,
    type ChampionBreakdown,
    type ChampionPoolEntry,
    type ChampionRoleGames,
    type FormGame,
    type MatchupEntry,
    type MetricAxis,
    type PlaystyleArchetype,
    type PlaystyleAxis,
    type PlaystyleBreakdown,
    type PlaystyleForm,
    type PlaystyleProfile,
    type PlaystyleTotals,
    type PlaystyleTrait,
    type ProfilePlaystyleOptions,
    type RoleBreakdown,
    type RoleDistributionEntry,
} from "./playstyle/types.js";
