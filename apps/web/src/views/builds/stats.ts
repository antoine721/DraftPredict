import type {
    ChampionDamageProfile,
    Dataset,
    RiskLevel,
    Role,
    Stats,
} from "@draftpredict/core";

/**
 * The maths behind the champion screen.
 *
 * Everything here is pure and framework-free so it can be unit-tested without
 * a DOM. The rating helpers are deliberately re-implemented rather than
 * imported from `@draftpredict/core`: the web bundle keeps that package
 * type-only, and these are four lines of arithmetic whose parity with the
 * engine is asserted in `stats.test.ts`.
 */

export const ROLE_VALUES: readonly Role[] = [0, 1, 2, 3, 4];

/** DraftGap's canonical prior sample sizes, indexed by risk level. */
export const PRIOR_GAMES_BY_RISK: Record<RiskLevel, number> = {
    "very-low": 3000,
    low: 2000,
    medium: 1000,
    high: 500,
    "very-high": 250,
};

export function priorGamesFor(riskLevel: RiskLevel | string | undefined): number {
    if (typeof riskLevel === "string" && riskLevel in PRIOR_GAMES_BY_RISK) {
        return PRIOR_GAMES_BY_RISK[riskLevel as RiskLevel];
    }
    return PRIOR_GAMES_BY_RISK.medium;
}

/** Win probability implied by a rating difference (400 points = 10:1 odds). */
export function ratingToWinrate(rating: number): number {
    return 1 / (1 + Math.pow(10, -rating / 400));
}

/** Rating difference implied by a win probability. */
export function winrateToRating(winrate: number): number {
    return -400 * Math.log10(1 / winrate - 1);
}

// ----------------------------------------------------------------- samples ---

export const EMPTY_SAMPLE: Stats = { wins: 0, games: 0 };

/** `wins / games`, or `fallback` when the sample is empty. */
export function sampleWinrate(sample: Stats, fallback = 0.5): number {
    if (!sample || sample.games <= 0) return fallback;
    const winrate = sample.wins / sample.games;
    return Number.isFinite(winrate) ? winrate : fallback;
}

/**
 * A winrate pulled towards `priorWinrate` by a Bayesian prior of
 * `priorGames` games — the same shrink the engine applies before rating a
 * champion, and the reason a 62 % winrate over 11 games is not worth 62 %.
 */
export function shrinkWinrate(
    sample: Stats,
    priorGames: number,
    priorWinrate = 0.5,
): number {
    const games = Math.max(0, sample?.games ?? 0) + Math.max(0, priorGames);
    if (games <= 0) return priorWinrate;
    return ((sample?.wins ?? 0) + priorGames * priorWinrate) / games;
}

export type Interval = { low: number; high: number; half: number };

/**
 * Wilson score interval — the honest error bar on a winrate.
 *
 * Preferred to the normal approximation because it stays inside [0, 1] and
 * behaves for the tiny samples the matchup matrix is full of.
 */
export function wilsonInterval(sample: Stats, z = 1.96): Interval {
    const games = sample?.games ?? 0;
    if (games <= 0) return { low: 0, high: 1, half: 0.5 };
    const winrate = Math.min(1, Math.max(0, (sample.wins ?? 0) / games));
    const z2 = z * z;
    const denominator = 1 + z2 / games;
    const centre = (winrate + z2 / (2 * games)) / denominator;
    const spread =
        (z * Math.sqrt((winrate * (1 - winrate)) / games + z2 / (4 * games * games))) /
        denominator;
    const low = Math.max(0, centre - spread);
    const high = Math.min(1, centre + spread);
    return { low, high, half: (high - low) / 2 };
}

export type SampleTier = "solid" | "fair" | "thin" | "none";

export const SOLID_SAMPLE = 1000;
export const FAIR_SAMPLE = 250;

/** How much a sample can be trusted, in four steps. */
export function sampleTier(games: number): SampleTier {
    if (!Number.isFinite(games) || games <= 0) return "none";
    if (games >= SOLID_SAMPLE) return "solid";
    if (games >= FAIR_SAMPLE) return "fair";
    return "thin";
}

/** `true` when a number should be de-emphasised rather than read as a fact. */
export function isThinSample(games: number): boolean {
    const tier = sampleTier(games);
    return tier === "thin" || tier === "none";
}

export const SAMPLE_TIER_LABEL: Record<SampleTier, string> = {
    solid: "Échantillon solide",
    fair: "Échantillon correct",
    thin: "Échantillon mince",
    none: "Aucune donnée",
};

// ------------------------------------------------------------------ damage ---

export function normalizeDamage(profile: ChampionDamageProfile): ChampionDamageProfile {
    const total = profile.magic + profile.physical + profile.true;
    if (!Number.isFinite(total) || total <= 0) {
        return { magic: 0, physical: 0, true: 0 };
    }
    return {
        magic: profile.magic / total,
        physical: profile.physical / total,
        true: profile.true / total,
    };
}

export type DamageKind = "physical" | "magic" | "mixed";

/** The dominant damage channel, or `mixed` when neither reaches 60 %. */
export function damageKind(profile: ChampionDamageProfile): DamageKind {
    const normalized = normalizeDamage(profile);
    if (normalized.physical >= 0.6) return "physical";
    if (normalized.magic >= 0.6) return "magic";
    return "mixed";
}

export const DAMAGE_KIND_LABEL: Record<DamageKind, string> = {
    physical: "Dégâts physiques",
    magic: "Dégâts magiques",
    mixed: "Dégâts mixtes",
};

// -------------------------------------------------------- champion / roles ---

export type ChampionRoleRow = {
    championKey: string;
    role: Role;
    games: number;
    wins: number;
    /** Raw `wins / games` in the current-patch sample. */
    winrate: number;
    /** Winrate after the Bayesian shrink — what the rating is built on. */
    adjustedWinrate: number;
    rating: number;
    /** Share of the games played in that role, all champions considered. */
    pickrate: number;
    /** Share of this champion's own games played in that role. */
    roleShare: number;
    damage: ChampionDamageProfile;
    /** The seven duration buckets, kept for the statistics tab. */
    statsByTime: readonly Stats[];
};

export type ChampionRoleIndex = {
    rows: ChampionRoleRow[];
    /** Every row of a champion, best-played role first. */
    byChampion: Map<string, ChampionRoleRow[]>;
    byRole: Map<Role, ChampionRoleRow[]>;
    roleTotals: Record<Role, number>;
    totalGames: number;
};

function rowKey(championKey: string, role: Role): string {
    return `${championKey}:${role}`;
}

/** Every champion × role sample of a dataset, rated and ranked. */
export function buildChampionRoleIndex(
    dataset: Dataset,
    priorGames: number,
): ChampionRoleIndex {
    const roleTotals = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 } as Record<Role, number>;
    const champions = Object.values(dataset.championData ?? {});

    for (const champion of champions) {
        for (const role of ROLE_VALUES) {
            roleTotals[role] += champion.statsByRole?.[role]?.games ?? 0;
        }
    }

    const rows: ChampionRoleRow[] = [];
    const byChampion = new Map<string, ChampionRoleRow[]>();
    const byRole = new Map<Role, ChampionRoleRow[]>();

    for (const champion of champions) {
        const championTotal = ROLE_VALUES.reduce<number>(
            (total, role) => total + (champion.statsByRole?.[role]?.games ?? 0),
            0,
        );
        const championRows: ChampionRoleRow[] = [];

        for (const role of ROLE_VALUES) {
            const stats = champion.statsByRole?.[role];
            if (!stats || stats.games <= 0) continue;
            const adjustedWinrate = shrinkWinrate(stats, priorGames);
            const row: ChampionRoleRow = {
                championKey: champion.key,
                role,
                games: stats.games,
                wins: stats.wins,
                winrate: sampleWinrate(stats),
                adjustedWinrate,
                rating: winrateToRating(adjustedWinrate),
                pickrate: roleTotals[role] > 0 ? stats.games / roleTotals[role] : 0,
                roleShare: championTotal > 0 ? stats.games / championTotal : 0,
                damage: normalizeDamage(
                    stats.damageProfile ?? { magic: 0, physical: 0, true: 0 },
                ),
                statsByTime: stats.statsByTime ?? [],
            };
            championRows.push(row);
            rows.push(row);
            const bucket = byRole.get(role);
            if (bucket) bucket.push(row);
            else byRole.set(role, [row]);
        }

        championRows.sort((a, b) => b.games - a.games);
        byChampion.set(champion.key, championRows);
    }

    for (const bucket of byRole.values()) bucket.sort((a, b) => b.rating - a.rating);

    return {
        rows,
        byChampion,
        byRole,
        roleTotals,
        totalGames: ROLE_VALUES.reduce<number>(
            (total, role) => total + roleTotals[role],
            0,
        ),
    };
}

/**
 * The roles a champion is actually played in: at least `minGames` games *and*
 * a meaningful share of its own play. Everything else is noise from a handful
 * of off-meta games and must not get a tab.
 */
export function playableRoles(
    rows: readonly ChampionRoleRow[],
    minGames = 50,
    minShare = 0.02,
): ChampionRoleRow[] {
    return rows
        .filter((row) => row.games >= minGames && row.roleShare >= minShare)
        .sort((a, b) => b.games - a.games);
}

// -------------------------------------------------------------------- tier ---

export type Tier = "S" | "A" | "B" | "C" | "D";

export type TierEstimate = {
    tier: Tier;
    /** Composite score in standard deviations. */
    score: number;
    ratingZ: number;
    popularityZ: number;
};

/** Score thresholds, from the top down. */
const TIER_CUTS: readonly { tier: Tier; min: number }[] = [
    { tier: "S", min: 1.5 },
    { tier: "A", min: 0.6 },
    { tier: "B", min: -0.3 },
    { tier: "C", min: -1.2 },
];

export const TIER_POPULARITY_WEIGHT = 0.5;
export const TIER_MIN_GAMES = 100;

function meanAndDeviation(values: readonly number[]): { mean: number; sd: number } {
    if (values.length === 0) return { mean: 0, sd: 0 };
    const mean = values.reduce((total, value) => total + value, 0) / values.length;
    const variance =
        values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
    return { mean, sd: Math.sqrt(variance) };
}

export function tierFromScore(score: number): Tier {
    for (const cut of TIER_CUTS) {
        if (score >= cut.min) return cut.tier;
    }
    return "D";
}

/**
 * A tier estimate per champion × role.
 *
 * `score = z(rating) + 0.5 · z(ln games)`: how far above the role's average a
 * champion rates, plus half as much credit for how often it is actually
 * played. Champions under {@link TIER_MIN_GAMES} games get no tier at all
 * rather than a flattering one.
 */
export function estimateTiers(index: ChampionRoleIndex): Map<string, TierEstimate> {
    const estimates = new Map<string, TierEstimate>();

    for (const rows of index.byRole.values()) {
        const eligible = rows.filter((row) => row.games >= TIER_MIN_GAMES);
        if (eligible.length < 2) continue;

        const rating = meanAndDeviation(eligible.map((row) => row.rating));
        const popularity = meanAndDeviation(eligible.map((row) => Math.log(row.games)));

        for (const row of eligible) {
            const ratingZ = rating.sd > 0 ? (row.rating - rating.mean) / rating.sd : 0;
            const popularityZ =
                popularity.sd > 0
                    ? (Math.log(row.games) - popularity.mean) / popularity.sd
                    : 0;
            const score = ratingZ + TIER_POPULARITY_WEIGHT * popularityZ;
            estimates.set(rowKey(row.championKey, row.role), {
                tier: tierFromScore(score),
                score,
                ratingZ,
                popularityZ,
            });
        }
    }

    return estimates;
}

export function tierOf(
    estimates: Map<string, TierEstimate>,
    championKey: string,
    role: Role,
): TierEstimate | null {
    return estimates.get(rowKey(championKey, role)) ?? null;
}

// --------------------------------------------------------------- durations ---

export const TIME_BUCKET_START_MINUTES = 20;
export const TIME_BUCKET_WIDTH_MINUTES = 5;

export type DurationPoint = {
    index: number;
    label: string;
    startMinutes: number;
    games: number;
    wins: number;
    winrate: number;
    /** Shrunk towards 50 %, so a 12-game bucket does not spike the curve. */
    adjustedWinrate: number;
};

/**
 * The seven 5-minute duration buckets, from 20 minutes up. The last one is
 * open-ended, which is why it is labelled `50+`.
 */
export function durationSeries(
    statsByTime: readonly Stats[] | undefined,
    priorGames = 200,
): DurationPoint[] {
    const buckets = statsByTime ?? [];
    return buckets.map((stats, index) => {
        const startMinutes =
            TIME_BUCKET_START_MINUTES + index * TIME_BUCKET_WIDTH_MINUTES;
        const last = index === buckets.length - 1;
        return {
            index,
            label: last
                ? `${startMinutes}+`
                : `${startMinutes}-${startMinutes + TIME_BUCKET_WIDTH_MINUTES}`,
            startMinutes,
            games: stats?.games ?? 0,
            wins: stats?.wins ?? 0,
            winrate: sampleWinrate(stats ?? EMPTY_SAMPLE),
            adjustedWinrate: shrinkWinrate(stats ?? EMPTY_SAMPLE, priorGames),
        };
    });
}

// ------------------------------------------------------- matchups & duos ---

function roleStats(dataset: Dataset, championKey: string, role: Role): Stats {
    return dataset.championData?.[championKey]?.statsByRole?.[role] ?? EMPTY_SAMPLE;
}

function pairStats(
    dataset: Dataset,
    championKey: string,
    role: Role,
    kind: "matchup" | "synergy",
    otherRole: Role,
    otherKey: string,
): Stats {
    const entry =
        dataset.championData?.[championKey]?.statsByRole?.[role]?.[kind]?.[otherRole]?.[
            otherKey
        ];
    return entry ? { wins: entry.wins, games: entry.games } : EMPTY_SAMPLE;
}

export type PairRow = {
    championKey: string;
    /** The role the *other* champion is played in. */
    role: Role;
    /** Games in the shared sample (an average of both directions). */
    games: number;
    wins: number;
    /** Raw winrate of the pairing. */
    winrate: number;
    /** Rating of the pairing once both champions' own strength is removed. */
    rating: number;
    /** `ratingToWinrate(rating) - 0.5` — what the pairing is worth. */
    winrateDelta: number;
};

/**
 * The rating of a lane matchup, mirroring `analyzeMatchups` in the engine:
 * both directions of the matrix are averaged, shrunk towards the winrate the
 * two champions' own strength already predicts, and the prediction is then
 * subtracted so only the matchup itself remains.
 */
export function matchupRow(
    dataset: Dataset,
    championKey: string,
    role: Role,
    enemyKey: string,
    enemyRole: Role,
    priorGames: number,
): PairRow {
    const own = roleStats(dataset, championKey, role);
    const enemy = roleStats(dataset, enemyKey, enemyRole);
    const expectedRating =
        winrateToRating(sampleWinrate(own)) - winrateToRating(sampleWinrate(enemy));
    const expectedWinrate = ratingToWinrate(expectedRating);

    const forward = pairStats(
        dataset,
        championKey,
        role,
        "matchup",
        enemyRole,
        enemyKey,
    );
    const backward = pairStats(
        dataset,
        enemyKey,
        enemyRole,
        "matchup",
        role,
        championKey,
    );

    const wins = (forward.wins + (backward.games - backward.wins)) / 2;
    const games = (forward.games + backward.games) / 2;

    const winrate =
        games > 0
            ? (wins + priorGames * expectedWinrate) / (games + priorGames)
            : expectedWinrate;
    const rating = winrateToRating(winrate) - expectedRating;

    return {
        championKey: enemyKey,
        role: enemyRole,
        games,
        wins,
        winrate: games > 0 ? wins / games : expectedWinrate,
        rating,
        winrateDelta: ratingToWinrate(rating) - 0.5,
    };
}

/** The same, for two champions on the same team — mirrors `analyzeDuos`. */
export function synergyRow(
    dataset: Dataset,
    championKey: string,
    role: Role,
    otherKey: string,
    otherRole: Role,
    priorGames: number,
): PairRow {
    const own = roleStats(dataset, championKey, role);
    const other = roleStats(dataset, otherKey, otherRole);
    const expectedRating =
        winrateToRating(sampleWinrate(own)) + winrateToRating(sampleWinrate(other));
    const expectedWinrate = ratingToWinrate(expectedRating);

    const forward = pairStats(
        dataset,
        championKey,
        role,
        "synergy",
        otherRole,
        otherKey,
    );
    const backward = pairStats(
        dataset,
        otherKey,
        otherRole,
        "synergy",
        role,
        championKey,
    );

    const wins = (forward.wins + backward.wins) / 2;
    const games = (forward.games + backward.games) / 2;

    const winrate =
        games > 0
            ? (wins + priorGames * expectedWinrate) / (games + priorGames)
            : expectedWinrate;
    const rating = winrateToRating(winrate) - expectedRating;

    return {
        championKey: otherKey,
        role: otherRole,
        games,
        wins,
        winrate: games > 0 ? wins / games : expectedWinrate,
        rating,
        winrateDelta: ratingToWinrate(rating) - 0.5,
    };
}

/** Every enemy the matrix knows about, rated. `roles` narrows the sweep. */
export function matchupRows(
    dataset: Dataset,
    championKey: string,
    role: Role,
    priorGames: number,
    roles: readonly Role[] = ROLE_VALUES,
): PairRow[] {
    const matrix = dataset.championData?.[championKey]?.statsByRole?.[role]?.matchup;
    if (!matrix) return [];
    const rows: PairRow[] = [];
    for (const enemyRole of roles) {
        for (const enemyKey of Object.keys(matrix[enemyRole] ?? {})) {
            rows.push(
                matchupRow(dataset, championKey, role, enemyKey, enemyRole, priorGames),
            );
        }
    }
    return rows.sort((a, b) => b.rating - a.rating);
}

/** Every team mate the matrix knows about, rated. */
export function synergyRows(
    dataset: Dataset,
    championKey: string,
    role: Role,
    priorGames: number,
    roles: readonly Role[] = ROLE_VALUES,
): PairRow[] {
    const matrix = dataset.championData?.[championKey]?.statsByRole?.[role]?.synergy;
    if (!matrix) return [];
    const rows: PairRow[] = [];
    for (const otherRole of roles) {
        if (otherRole === role) continue;
        for (const otherKey of Object.keys(matrix[otherRole] ?? {})) {
            rows.push(
                synergyRow(dataset, championKey, role, otherKey, otherRole, priorGames),
            );
        }
    }
    return rows.sort((a, b) => b.rating - a.rating);
}

/** The role a `role` player is most often paired with — bot ↔ support. */
export function partnerRole(role: Role): Role | null {
    if (role === 3) return 4;
    if (role === 4) return 3;
    return null;
}

// ------------------------------------------------------------- build query ---

/** `[[122, 0]]` -> `"122:0"`, the `vs` query the builds route expects. */
export function encodeVersus(entries: readonly [string, Role][]): string | undefined {
    if (entries.length === 0) return undefined;
    return entries.map(([key, role]) => `${key}:${role}`).join(",");
}
