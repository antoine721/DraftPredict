import type { ChampionRoleData, Dataset, Role } from "@draftpredict/core";
import { ROLES, TIME_BUCKET_COUNT } from "@draftpredict/core";

/**
 * Sanity checks for a built dataset.
 *
 * A dataset is the one artefact the whole app trusts blindly — the engine
 * indexes into it without guards and a single `NaN` propagates into every
 * winrate on screen. `verify` is therefore run before a dataset is published:
 * it walks the payload in full (this is a build-time tool, not a request path)
 * and reports every invariant that a correctly aggregated dataset must satisfy.
 */

export type VerifyStatus = "pass" | "warn" | "fail";

export type VerifyCheck = {
    name: string;
    status: VerifyStatus;
    message: string;
    /** Up to `maxIssues` example failures. */
    details?: string[];
};

export type VerifySummary = {
    version: string;
    date: string;
    champions: number;
    championsWithGames: number;
    totalGames: number;
    totalWins: number;
    matchupEntries: number;
    synergyEntries: number;
    /** Implied number of matches: total champion games / 10. */
    impliedMatches: number;
};

export type VerifyReport = {
    ok: boolean;
    summary: VerifySummary;
    checks: VerifyCheck[];
    failures: number;
    warnings: number;
};

export type VerifyOptions = {
    /** Champion keys the dataset is expected to cover (from static data). */
    expectedChampionKeys?: readonly string[];
    /** A champion needs this many games to count as "covered". Default 1. */
    minGames?: number;
    /** Fraction of expected champions that must be covered. Default 0.5. */
    minCoverage?: number;
    /** How far the global winrate may sit from 50%. Default 0.02. */
    winrateTolerance?: number;
    /** Champion-role winrate band, for entries above `plausibleMinGames`. */
    winrateBand?: [number, number];
    plausibleMinGames?: number;
    /**
     * How far the two directions of a matchup/synergy count may drift before
     * it is treated as corruption rather than rounding: `max(absolute,
     * relative * games)`. Datasets scraped per champion (and the synthetic
     * fixture) are routinely off by one; a real disagreement is much larger.
     */
    symmetryTolerance?: { absolute?: number; relative?: number };
    /** Examples kept per failing check. Default 5. */
    maxIssues?: number;
    /** Treat warnings as failures. */
    strict?: boolean;
    /** Skip the (expensive) JSON round-trip check. */
    skipRoundTrip?: boolean;
};

const EPSILON = 1e-6;

export function verifyDataset(payload: unknown, options: VerifyOptions = {}): VerifyReport {
    const maxIssues = options.maxIssues ?? 5;
    const checks: VerifyCheck[] = [];

    const structural = checkTopLevel(payload);
    if (structural) {
        return report([structural], emptySummary(), options);
    }

    const dataset = payload as Dataset;
    const keys = Object.keys(dataset.championData);

    const issues = {
        structure: [] as string[],
        finite: [] as string[],
        bounds: [] as string[],
        time: [] as string[],
        matchupSymmetry: [] as string[],
        matchupDrift: [] as string[],
        synergySymmetry: [] as string[],
        synergyDrift: [] as string[],
        winrates: [] as string[],
    };

    let totalGames = 0;
    let totalWins = 0;
    let matchupEntries = 0;
    let synergyEntries = 0;
    let championsWithGames = 0;

    const push = (bucket: string[], message: string): void => {
        if (bucket.length < maxIssues) bucket.push(message);
    };

    const symmetryAbsolute = options.symmetryTolerance?.absolute ?? 1;
    const symmetryRelative = options.symmetryTolerance?.relative ?? 0.02;
    /** `true` when the two directions are close enough to be rounding. */
    const withinTolerance = (a: number, b: number): boolean =>
        Math.abs(a - b) <=
        Math.max(symmetryAbsolute, symmetryRelative * Math.max(a, b)) + EPSILON;

    const band = options.winrateBand ?? [0.3, 0.7];
    const plausibleMinGames = options.plausibleMinGames ?? 200;

    for (const key of keys) {
        const champion = dataset.championData[key];
        if (!champion || typeof champion !== "object") {
            push(issues.structure, `championData["${key}"] is not an object`);
            continue;
        }
        if (typeof champion.key !== "string" || champion.key !== key) {
            push(
                issues.structure,
                `championData["${key}"].key is "${String(champion.key)}"`,
            );
        }
        if (!champion.statsByRole) {
            push(issues.structure, `championData["${key}"] has no statsByRole`);
            continue;
        }

        let championGames = 0;

        for (const role of ROLES) {
            const roleData: ChampionRoleData | undefined = champion.statsByRole[role];
            if (!roleData) {
                push(issues.structure, `${key}/${role}: missing role data`);
                continue;
            }
            if (
                typeof roleData.games !== "number" ||
                typeof roleData.wins !== "number"
            ) {
                push(issues.structure, `${key}/${role}: wins/games are not numbers`);
                continue;
            }

            if (!finite(roleData.games) || !finite(roleData.wins)) {
                push(issues.finite, `${key}/${role}: wins/games are not finite`);
            }
            if (!inBounds(roleData.wins, roleData.games)) {
                push(
                    issues.bounds,
                    `${key}/${role}: wins ${roleData.wins} out of [0, ${roleData.games}]`,
                );
            }

            championGames += roleData.games;
            totalGames += roleData.games;
            totalWins += roleData.wins;

            checkDamage(key, role, roleData, issues.finite, push);
            checkTime(key, role, roleData, issues.time, push);

            if (
                roleData.games >= plausibleMinGames &&
                roleData.games > 0 &&
                (roleData.wins / roleData.games < band[0] ||
                    roleData.wins / roleData.games > band[1])
            ) {
                push(
                    issues.winrates,
                    `${key}/${role}: winrate ${(roleData.wins / roleData.games).toFixed(3)} over ${roleData.games} games`,
                );
            }

            for (const otherRole of ROLES) {
                const matchups = roleData.matchup?.[otherRole];
                if (matchups) {
                    for (const [otherKey, entry] of Object.entries(matchups)) {
                        matchupEntries += 1;
                        verifyLeaf(
                            `${key}/${role} vs ${otherKey}/${otherRole}`,
                            entry,
                            otherKey,
                            issues,
                            push,
                        );
                        const mirror =
                            dataset.championData[otherKey]?.statsByRole?.[otherRole]
                                ?.matchup?.[role]?.[key];
                        const mirrored = mirror?.games ?? 0;
                        if (withinTolerance(entry.games, mirrored)) {
                            if (Math.abs(entry.games - mirrored) > EPSILON) {
                                push(
                                    issues.matchupDrift,
                                    `${key}/${role} vs ${otherKey}/${otherRole}: ${entry.games} games vs ${mirrored} mirrored`,
                                );
                            }
                        } else {
                            push(
                                issues.matchupSymmetry,
                                mirror
                                    ? `${key}/${role} vs ${otherKey}/${otherRole}: ${entry.games} games vs ${mirrored} mirrored`
                                    : `${key}/${role} vs ${otherKey}/${otherRole}: no mirrored entry (${entry.games} games)`,
                            );
                        }
                    }
                }

                const synergies = roleData.synergy?.[otherRole];
                if (!synergies) continue;
                for (const [otherKey, entry] of Object.entries(synergies)) {
                    synergyEntries += 1;
                    verifyLeaf(
                        `${key}/${role} with ${otherKey}/${otherRole}`,
                        entry,
                        otherKey,
                        issues,
                        push,
                    );
                    if (otherKey === key && otherRole === role) {
                        push(
                            issues.synergySymmetry,
                            `${key}/${role}: synergy with itself`,
                        );
                        continue;
                    }
                    const mirror =
                        dataset.championData[otherKey]?.statsByRole?.[otherRole]
                            ?.synergy?.[role]?.[key];
                    const mirrored = mirror?.games ?? 0;
                    if (withinTolerance(entry.games, mirrored)) {
                        if (Math.abs(entry.games - mirrored) > EPSILON) {
                            push(
                                issues.synergyDrift,
                                `${key}/${role} with ${otherKey}/${otherRole}: ${entry.games} games vs ${mirrored} mirrored`,
                            );
                        }
                    } else {
                        push(
                            issues.synergySymmetry,
                            mirror
                                ? `${key}/${role} with ${otherKey}/${otherRole}: ${entry.games} games vs ${mirrored} mirrored`
                                : `${key}/${role} with ${otherKey}/${otherRole}: no mirrored entry (${entry.games} games)`,
                        );
                    }
                }
            }
        }

        if (championGames > 0) championsWithGames += 1;
    }

    const summary: VerifySummary = {
        version: String(dataset.version ?? ""),
        date: String(dataset.date ?? ""),
        champions: keys.length,
        championsWithGames,
        totalGames,
        totalWins,
        matchupEntries,
        synergyEntries,
        impliedMatches: totalGames / 10,
    };

    checks.push(
        result("structure", issues.structure, "every champion has five role entries"),
    );
    checks.push(
        result("finite-numbers", issues.finite, "no NaN or Infinity anywhere"),
    );
    checks.push(result("stat-bounds", issues.bounds, "0 <= wins <= games everywhere"));
    checks.push(
        result("stats-by-time", issues.time, `${TIME_BUCKET_COUNT} consistent duration buckets`),
    );
    checks.push(
        result(
            "matchup-symmetry",
            issues.matchupSymmetry,
            "matchup counts agree in both directions",
        ),
    );
    checks.push(
        result(
            "synergy-symmetry",
            issues.synergySymmetry,
            "synergy counts agree in both directions",
        ),
    );
    checks.push(
        result(
            "symmetry-drift",
            [...issues.matchupDrift, ...issues.synergyDrift],
            "no rounding drift between the two directions of a pair",
            "warn",
        ),
    );
    checks.push(
        result("plausible-winrates", issues.winrates, "champion winrates sit inside a believable band", "warn"),
    );

    checks.push(checkGlobalWinrate(totalWins, totalGames, options));
    checks.push(checkCoverage(dataset, summary, options));
    checks.push(checkCatalogues(dataset));
    checks.push(checkVersion(dataset));
    if (!options.skipRoundTrip) checks.push(checkRoundTrip(dataset, summary));

    return report(checks, summary, options);
}

function verifyLeaf(
    label: string,
    entry: { championKey?: string; wins: number; games: number },
    expectedKey: string,
    issues: { finite: string[]; bounds: string[]; structure: string[] },
    push: (bucket: string[], message: string) => void,
): void {
    if (typeof entry.games !== "number" || typeof entry.wins !== "number") {
        push(issues.structure, `${label}: wins/games are not numbers`);
        return;
    }
    if (!finite(entry.games) || !finite(entry.wins)) {
        push(issues.finite, `${label}: wins/games are not finite`);
    }
    if (!inBounds(entry.wins, entry.games)) {
        push(issues.bounds, `${label}: wins ${entry.wins} out of [0, ${entry.games}]`);
    }
    if (entry.championKey !== undefined && entry.championKey !== expectedKey) {
        push(
            issues.structure,
            `${label}: entry championKey is "${entry.championKey}"`,
        );
    }
}

function checkDamage(
    key: string,
    role: Role,
    roleData: ChampionRoleData,
    bucket: string[],
    push: (bucket: string[], message: string) => void,
): void {
    const profile = roleData.damageProfile;
    if (!profile) {
        push(bucket, `${key}/${role}: no damage profile`);
        return;
    }
    for (const channel of ["magic", "physical", "true"] as const) {
        const value = profile[channel];
        if (typeof value !== "number" || !finite(value) || value < 0) {
            push(bucket, `${key}/${role}: damageProfile.${channel} is ${String(value)}`);
        }
    }
}

function checkTime(
    key: string,
    role: Role,
    roleData: ChampionRoleData,
    bucket: string[],
    push: (bucket: string[], message: string) => void,
): void {
    const buckets = roleData.statsByTime;
    if (!Array.isArray(buckets) || buckets.length !== TIME_BUCKET_COUNT) {
        push(
            bucket,
            `${key}/${role}: statsByTime has ${Array.isArray(buckets) ? buckets.length : "no"} buckets`,
        );
        return;
    }
    let sum = 0;
    for (const [index, stats] of buckets.entries()) {
        if (!stats || !finite(stats.games) || !finite(stats.wins)) {
            push(bucket, `${key}/${role}: statsByTime[${index}] is not finite`);
            continue;
        }
        if (!inBounds(stats.wins, stats.games)) {
            push(
                bucket,
                `${key}/${role}: statsByTime[${index}] wins ${stats.wins} out of [0, ${stats.games}]`,
            );
        }
        sum += stats.games;
    }
    if (sum > roleData.games + EPSILON) {
        push(
            bucket,
            `${key}/${role}: statsByTime totals ${sum} games but the role has ${roleData.games}`,
        );
    }
}

function checkGlobalWinrate(
    totalWins: number,
    totalGames: number,
    options: VerifyOptions,
): VerifyCheck {
    if (totalGames === 0) {
        return {
            name: "global-winrate",
            status: "warn",
            message: "dataset has no games at all",
        };
    }
    const winrate = totalWins / totalGames;
    const tolerance = options.winrateTolerance ?? 0.02;
    const ok = Math.abs(winrate - 0.5) <= tolerance;
    return {
        name: "global-winrate",
        status: ok ? "pass" : "fail",
        message: `overall winrate ${(winrate * 100).toFixed(2)}% (expected 50% ± ${(tolerance * 100).toFixed(1)})`,
    };
}

function checkCoverage(
    dataset: Dataset,
    summary: VerifySummary,
    options: VerifyOptions,
): VerifyCheck {
    const minGames = options.minGames ?? 1;
    const expected = options.expectedChampionKeys;

    const covered = Object.values(dataset.championData).filter((champion) =>
        ROLES.some((role) => (champion.statsByRole[role]?.games ?? 0) >= minGames),
    ).length;

    const missing = expected
        ? expected.filter((key) => !dataset.championData[key])
        : [];

    const denominator = expected?.length ?? summary.champions;
    const coverage = denominator === 0 ? 0 : covered / denominator;
    const minCoverage = options.minCoverage ?? 0.5;

    if (missing.length > 0) {
        return {
            name: "champion-coverage",
            status: "fail",
            message: `${missing.length} champions are missing from the dataset — the engine indexes championData without a guard`,
            details: missing.slice(0, options.maxIssues ?? 5),
        };
    }

    return {
        name: "champion-coverage",
        status: coverage >= minCoverage ? "pass" : "warn",
        message: `${covered}/${denominator} champions have at least ${minGames} game(s) (${(coverage * 100).toFixed(1)}%)`,
    };
}

function checkCatalogues(dataset: Dataset): VerifyCheck {
    const missing = (
        [
            ["itemData", dataset.itemData],
            ["runeData", dataset.runeData],
            ["runePathData", dataset.runePathData],
            ["statShardData", dataset.statShardData],
            ["summonerSpellData", dataset.summonerSpellData],
        ] as const
    )
        .filter(([, value]) => !value || Object.keys(value).length === 0)
        .map(([name]) => name);

    return {
        name: "catalogues",
        status: missing.length === 0 ? "pass" : "warn",
        message:
            missing.length === 0
                ? "item, rune and summoner-spell catalogues are present"
                : `empty catalogues: ${missing.join(", ")}`,
    };
}

function checkVersion(dataset: Dataset): VerifyCheck {
    const version = String(dataset.version ?? "");
    const date = String(dataset.date ?? "");
    const problems: string[] = [];
    if (version.length === 0) problems.push("version is empty");
    if (date.length === 0) problems.push("date is empty");
    return {
        name: "metadata",
        status: problems.length === 0 ? "pass" : "warn",
        message:
            problems.length === 0
                ? `dataset v${version} dated ${date}`
                : problems.join("; "),
    };
}

/** The dataset has to survive the trip through a file and back unchanged. */
function checkRoundTrip(dataset: Dataset, summary: VerifySummary): VerifyCheck {
    let json: string;
    try {
        json = JSON.stringify(dataset);
    } catch (error) {
        return {
            name: "json-round-trip",
            status: "fail",
            message: `dataset cannot be serialised: ${describe(error)}`,
        };
    }
    let parsed: Dataset;
    try {
        parsed = JSON.parse(json) as Dataset;
    } catch (error) {
        return {
            name: "json-round-trip",
            status: "fail",
            message: `dataset does not parse back: ${describe(error)}`,
        };
    }

    let games = 0;
    let wins = 0;
    for (const champion of Object.values(parsed.championData)) {
        for (const role of ROLES) {
            games += champion.statsByRole[role]?.games ?? 0;
            wins += champion.statsByRole[role]?.wins ?? 0;
        }
    }

    // `JSON.stringify` turns a NaN into `null`, so a dataset that carries one
    // comes back with different totals — which is exactly what this compares.
    const same =
        Object.keys(parsed.championData).length === summary.champions &&
        Math.abs(games - summary.totalGames) < EPSILON &&
        Math.abs(wins - summary.totalWins) < EPSILON;

    return {
        name: "json-round-trip",
        status: same ? "pass" : "fail",
        message: same
            ? `round-trips through JSON unchanged (${formatBytesShort(json.length)})`
            : "round-tripped dataset does not match the original totals",
    };
}

function checkTopLevel(payload: unknown): VerifyCheck | null {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        return {
            name: "structure",
            status: "fail",
            message: "payload is not an object",
        };
    }
    const record = payload as Record<string, unknown>;
    if (
        typeof record.championData !== "object" ||
        record.championData === null ||
        Array.isArray(record.championData)
    ) {
        return {
            name: "structure",
            status: "fail",
            message: "payload has no championData record",
        };
    }
    if (Object.keys(record.championData as object).length === 0) {
        return {
            name: "structure",
            status: "fail",
            message: "championData is empty",
        };
    }
    return null;
}

function result(
    name: string,
    issues: string[],
    passMessage: string,
    failStatus: VerifyStatus = "fail",
): VerifyCheck {
    if (issues.length === 0) {
        return { name, status: "pass", message: passMessage };
    }
    return {
        name,
        status: failStatus,
        message: `${issues.length}+ problem(s)`,
        details: issues,
    };
}

function report(
    checks: VerifyCheck[],
    summary: VerifySummary,
    options: VerifyOptions,
): VerifyReport {
    const failures = checks.filter((check) => check.status === "fail").length;
    const warnings = checks.filter((check) => check.status === "warn").length;
    return {
        ok: failures === 0 && (!options.strict || warnings === 0),
        summary,
        checks,
        failures,
        warnings,
    };
}

function emptySummary(): VerifySummary {
    return {
        version: "",
        date: "",
        champions: 0,
        championsWithGames: 0,
        totalGames: 0,
        totalWins: 0,
        matchupEntries: 0,
        synergyEntries: 0,
        impliedMatches: 0,
    };
}

function finite(value: unknown): boolean {
    return typeof value === "number" && Number.isFinite(value);
}

function inBounds(wins: number, games: number): boolean {
    if (!finite(wins) || !finite(games)) return false;
    return wins >= -EPSILON && wins <= games + EPSILON && games >= 0;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function formatBytesShort(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
