import type { ReactNode } from "react";
import type { BuildEntry } from "../../api";
import { cn } from "../../lib/cn";
import { formatPercent } from "../../lib";
import { DeltaBar, Tooltip } from "../../ui";
import { DeltaValue, SampleSize, ThinSampleMark, WinrateValue } from "./Metrics";
import { baseRating, matchupDelta, matchupEntry } from "./build-helpers";
import { isThinSample, ratingToWinrate } from "./stats";

/**
 * One rated choice — an item, a spell pair, a skill order.
 *
 * Four columns, always in the same order: what it is, how often it wins, what
 * it is worth once the champion's own strength is removed, and how many games
 * that rests on. The last column is never optional.
 */
export function EntryRow({
    entry,
    icon,
    title,
    subtitle,
    rank,
    recommended = false,
    enemyKey,
    enemyName,
    className,
}: {
    entry: BuildEntry;
    icon: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    /** 1-based position, shown as a step number. */
    rank?: number;
    recommended?: boolean;
    /** When a matchup build is requested, the enemy the delta is against. */
    enemyKey?: string | null;
    enemyName?: string | null;
    className?: string;
}) {
    const match = matchupEntry(entry, enemyKey ?? null);
    const matchDelta = matchupDelta(match);
    const generic = ratingToWinrate(baseRating(entry)) - 0.5;

    return (
        <li
            className={cn(
                "flex items-center gap-3 rounded-card border px-2 py-1.5 transition-colors",
                recommended
                    ? "border-gold/40 bg-gold/8"
                    : "border-line-soft bg-surface-2/60 hover:bg-surface-3",
                isThinSample(entry.games) && "opacity-70",
                className,
            )}
        >
            {rank !== undefined && (
                <span className="tabular w-5 shrink-0 text-center text-xs font-semibold text-ink-subtle">
                    {rank}
                </span>
            )}
            {icon}
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-ink-strong">
                        {title}
                    </span>
                    <ThinSampleMark games={entry.games} />
                </div>
                {subtitle !== undefined && (
                    <div className="truncate text-[11px] text-ink-subtle">
                        {subtitle}
                    </div>
                )}
            </div>

            <div className="hidden w-28 shrink-0 lg:block">
                <DeltaBar delta={entry.winrateDelta} hideValue scale={0.04} />
            </div>

            <Tooltip
                wide
                content={
                    <span>
                        Winrate brut de ce choix : {formatPercent(entry.winrate)}.
                        <br />
                        Apport une fois la force propre du champion retirée :{" "}
                        {formatPercent(0.5 + entry.winrateDelta)} (
                        {match ? "duel inclus" : "toutes situations"}).
                    </span>
                }
            >
                <span className="w-16 shrink-0 text-right">
                    <WinrateValue winrate={entry.winrate} games={entry.games} />
                </span>
            </Tooltip>

            <span className="w-16 shrink-0 text-right text-xs">
                <DeltaValue delta={entry.winrateDelta} games={entry.games} />
            </span>

            {enemyKey ? (
                <Tooltip
                    wide
                    content={
                        match ? (
                            <span>
                                Apport propre au duel contre{" "}
                                {enemyName ?? match.name ?? "l'adversaire"} :{" "}
                                {formatPercent(0.5 + (matchDelta ?? 0))} sur{" "}
                                {Math.round(match.games)} parties. Hors duel, ce choix
                                vaut {formatPercent(0.5 + generic)}.
                            </span>
                        ) : (
                            <span>
                                Aucune donnée de duel pour ce choix contre{" "}
                                {enemyName ?? "cet adversaire"} : seul l'apport général
                                est affiché.
                            </span>
                        )
                    }
                >
                    <span className="w-16 shrink-0 text-right text-xs">
                        <DeltaValue delta={matchDelta} games={match?.games} />
                    </span>
                </Tooltip>
            ) : null}

            <span className="w-14 shrink-0 text-right">
                <SampleSize games={entry.games} wins={entry.wins} showDot={false} />
            </span>
        </li>
    );
}

/** The header that labels {@link EntryRow}'s columns. */
export function EntryRowHeader({
    withRank = false,
    enemyName,
    className,
}: {
    withRank?: boolean;
    enemyName?: string | null;
    className?: string;
}) {
    return (
        <li
            aria-hidden
            className={cn(
                "flex items-center gap-3 px-2 pb-1 text-[10px] tracking-wider text-ink-subtle uppercase",
                className,
            )}
        >
            {withRank && <span className="w-5 shrink-0" />}
            <span className="w-10 shrink-0" />
            <span className="min-w-0 flex-1">Choix</span>
            <span className="hidden w-28 shrink-0 lg:block" />
            <span className="w-16 shrink-0 text-right">Winrate</span>
            <span className="w-16 shrink-0 text-right">Apport</span>
            {enemyName ? (
                <span className="w-16 shrink-0 truncate text-right">
                    vs {enemyName}
                </span>
            ) : null}
            <span className="w-14 shrink-0 text-right">Parties</span>
        </li>
    );
}
