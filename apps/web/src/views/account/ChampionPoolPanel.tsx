import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { PlaystyleProfile } from "../../api";
import { cn } from "../../lib/cn";
import {
    formatCount,
    formatNumber,
    formatPercent,
    roleLongLabels,
} from "../../lib/format";
import { winrateTextClass } from "../../lib/winrate";
import { ChampionAvatar, EmptyState, Panel, RoleIcon, Tooltip } from "../../ui";
import { championPath } from "../../app/routes";
import { RoleDistribution } from "./RoleDistribution";
import {
    POOL_MIN_GAMES,
    mainPoolRole,
    poolExtremes,
    smoothedWinrate,
    sortPool,
    type PoolEntry,
    type PoolSort,
} from "./helpers";

/**
 * The champion pool, with the numbers that actually describe a pool.
 *
 * Winrate is never shown alone: the sort is on a Laplace-smoothed winrate and
 * the best/worst lists refuse anything under {@link POOL_MIN_GAMES} games,
 * because a 2-0 champion is not a strength. CS per minute is *not* in the
 * playstyle payload, so it is measured on the loaded match history instead and
 * labelled with the number of games it was measured on — a missing value shows
 * as "—" rather than as a zero.
 */

const SORTS: { value: PoolSort; label: string }[] = [
    { value: "games", label: "Parties" },
    { value: "winrate", label: "Winrate" },
    { value: "kda", label: "KDA" },
    { value: "performance", label: "Performance" },
    { value: "mastery", label: "Maîtrise" },
];

export function ChampionPoolPanel({
    profile,
    csPerMinute,
    className,
}: {
    profile: PlaystyleProfile;
    /** Measured on the match history, keyed by champion key. */
    csPerMinute: ReadonlyMap<string, { csPerMinute: number; games: number }>;
    className?: string;
}) {
    const [sort, setSort] = useState<PoolSort>("games");
    const rows = useMemo(
        () => sortPool(profile.championPool, sort),
        [profile.championPool, sort],
    );
    const extremes = useMemo(
        () => poolExtremes(profile.championPool),
        [profile.championPool],
    );

    return (
        <div className={cn("grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]", className)}>
            <Panel
                title="Pool de champions"
                subtitle={`${formatNumber(profile.championPool.length)} champions joués sur les ${formatNumber(profile.matchesAnalyzed)} parties analysées`}
                actions={
                    <div
                        role="group"
                        aria-label="Trier le pool de champions"
                        className="flex flex-wrap items-center gap-1 rounded-control border border-line bg-surface-2 p-1"
                    >
                        {SORTS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                aria-pressed={sort === option.value}
                                onClick={() => setSort(option.value)}
                                className={cn(
                                    "rounded-[calc(var(--radius-control)-2px)] px-2 py-1 text-[11px] font-medium transition-colors",
                                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                                    sort === option.value
                                        ? "bg-surface-4 text-ink-strong"
                                        : "text-ink-muted hover:text-ink",
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                }
                flush
            >
                {rows.length === 0 ? (
                    <EmptyState
                        size="sm"
                        title="Pool vide"
                        description="Aucune partie analysable n'a été trouvée pour ce compte."
                    />
                ) : (
                    <PoolTable rows={rows} csPerMinute={csPerMinute} />
                )}
            </Panel>

            <div className="flex flex-col gap-4">
                <Panel
                    title="Répartition par rôle"
                    subtitle="Sur les parties analysées"
                >
                    <RoleDistribution distribution={profile.roleDistribution} />
                </Panel>

                <Panel
                    title="Meilleurs et pires champions"
                    subtitle={`À partir de ${POOL_MIN_GAMES} parties, winrate lissé`}
                >
                    {extremes.best.length === 0 ? (
                        <EmptyState
                            size="sm"
                            title="Pas assez de parties"
                            description={`Aucun champion n'atteint ${POOL_MIN_GAMES} parties sur cet échantillon : impossible de classer honnêtement.`}
                        />
                    ) : (
                        <div className="flex flex-col gap-4">
                            <ExtremeList
                                title="Vos meilleurs"
                                icon={<TrendingUp className="h-3.5 w-3.5" />}
                                tone="positive"
                                entries={extremes.best}
                            />
                            {extremes.worst.length > 0 && (
                                <ExtremeList
                                    title="Vos plus difficiles"
                                    icon={<TrendingDown className="h-3.5 w-3.5" />}
                                    tone="negative"
                                    entries={extremes.worst}
                                />
                            )}
                            {extremes.ignored > 0 && (
                                <p className="text-[11px] text-ink-subtle">
                                    {formatNumber(extremes.ignored)} champion
                                    {extremes.ignored > 1 ? "s" : ""} joué
                                    {extremes.ignored > 1 ? "s" : ""} moins de{" "}
                                    {POOL_MIN_GAMES} fois — non classé
                                    {extremes.ignored > 1 ? "s" : ""}.
                                </p>
                            )}
                        </div>
                    )}
                </Panel>
            </div>
        </div>
    );
}

function PoolTable({
    rows,
    csPerMinute,
}: {
    rows: readonly PoolEntry[];
    csPerMinute: ReadonlyMap<string, { csPerMinute: number; games: number }>;
}) {
    return (
        <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full min-w-[42rem] text-sm">
                <caption className="sr-only">
                    Champions joués, avec parties, winrate, KDA, CS par minute et
                    maîtrise
                </caption>
                <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-subtle">
                        <th scope="col" className="px-3 py-2 font-medium">
                            Champion
                        </th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">
                            Parties
                        </th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">
                            Winrate
                        </th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">
                            KDA
                        </th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">
                            CS/min
                        </th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">
                            Perf.
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">
                            Maîtrise
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((entry) => {
                        const role = mainPoolRole(entry);
                        const cs = csPerMinute.get(entry.championKey) ?? null;
                        const thin = entry.games < POOL_MIN_GAMES;
                        return (
                            <tr
                                key={entry.championKey}
                                className="border-b border-line-soft last:border-0 hover:bg-surface-hover"
                            >
                                <th
                                    scope="row"
                                    className="px-3 py-2 text-left font-normal"
                                >
                                    <Link
                                        to={championPath(entry.championKey, role)}
                                        className="flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                                    >
                                        <ChampionAvatar
                                            champion={{
                                                key: entry.championKey,
                                                name: entry.championName,
                                            }}
                                            size="sm"
                                            ring="muted"
                                        />
                                        <span className="min-w-0">
                                            <span className="block truncate font-medium text-ink">
                                                {entry.championName}
                                            </span>
                                            {role !== null && (
                                                <span className="flex items-center gap-1 text-[11px] text-ink-subtle">
                                                    <RoleIcon
                                                        role={role}
                                                        size="xs"
                                                        labelled={false}
                                                    />
                                                    {roleLongLabels[role]}
                                                </span>
                                            )}
                                        </span>
                                    </Link>
                                </th>
                                <td className="tabular px-2 py-2 text-right text-ink">
                                    <Tooltip
                                        content={`${formatNumber(entry.wins)} victoires, ${formatNumber(entry.losses)} défaites`}
                                    >
                                        <span>{formatNumber(entry.games)}</span>
                                    </Tooltip>
                                </td>
                                <td
                                    className={cn(
                                        "tabular px-2 py-2 text-right font-semibold",
                                        thin
                                            ? "text-ink-subtle"
                                            : winrateTextClass(entry.winrate),
                                    )}
                                >
                                    {formatPercent(entry.winrate, 0)}
                                </td>
                                <td className="tabular px-2 py-2 text-right text-ink">
                                    {formatNumber(entry.kda, 2)}
                                </td>
                                <td className="tabular px-2 py-2 text-right text-ink">
                                    {cs ? (
                                        <Tooltip
                                            content={`Mesuré sur ${formatNumber(cs.games)} partie${cs.games > 1 ? "s" : ""} de l'historique chargé.`}
                                        >
                                            <span>
                                                {formatNumber(cs.csPerMinute, 1)}
                                            </span>
                                        </Tooltip>
                                    ) : (
                                        <Tooltip content="Ce champion n'apparaît pas dans l'historique chargé : les CS ne peuvent pas être mesurés.">
                                            <span className="text-ink-subtle">—</span>
                                        </Tooltip>
                                    )}
                                </td>
                                <td className="tabular px-2 py-2 text-right text-ink-muted">
                                    {formatNumber(entry.performance, 0)}
                                </td>
                                <td className="tabular px-3 py-2 text-right text-ink-muted">
                                    {entry.masteryPoints === undefined ? (
                                        <span className="text-ink-subtle">—</span>
                                    ) : (
                                        <Tooltip
                                            content={
                                                entry.masteryLevel === undefined
                                                    ? undefined
                                                    : `Maîtrise ${entry.masteryLevel}`
                                            }
                                        >
                                            <span>
                                                {formatCount(entry.masteryPoints)}
                                            </span>
                                        </Tooltip>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function ExtremeList({
    title,
    icon,
    tone,
    entries,
}: {
    title: string;
    icon: React.ReactNode;
    tone: "positive" | "negative";
    entries: readonly PoolEntry[];
}) {
    return (
        <section>
            <h4
                className={cn(
                    "mb-2 flex items-center gap-1.5 text-xs font-medium",
                    tone === "positive" ? "text-positive" : "text-negative",
                )}
            >
                {icon}
                {title}
            </h4>
            <ul className="flex flex-col gap-1.5">
                {entries.map((entry) => (
                    <li
                        key={entry.championKey}
                        className="flex items-center gap-2.5 rounded-card border border-line bg-surface-2/60 px-2.5 py-1.5"
                    >
                        <ChampionAvatar
                            champion={{
                                key: entry.championKey,
                                name: entry.championName,
                            }}
                            size="xs"
                            ring="muted"
                        />
                        <span className="min-w-0 flex-1 truncate text-xs text-ink">
                            {entry.championName}
                        </span>
                        <Tooltip
                            wide
                            content={`${formatNumber(entry.wins)}V / ${formatNumber(entry.losses)}D — winrate lissé ${formatPercent(smoothedWinrate(entry), 0)}, utilisé pour le classement.`}
                        >
                            <span
                                className={cn(
                                    "tabular text-xs font-semibold",
                                    winrateTextClass(entry.winrate),
                                )}
                            >
                                {formatPercent(entry.winrate, 0)}
                            </span>
                        </Tooltip>
                        <span className="tabular w-16 shrink-0 text-right text-[11px] text-ink-subtle">
                            {formatNumber(entry.games)} parties
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
