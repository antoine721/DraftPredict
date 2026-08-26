import { Link } from "react-router-dom";
import type { MasteryEntry } from "../../api";
import { cn } from "../../lib/cn";
import { formatCount, formatRelativeTime } from "../../lib/format";
import { ChampionAvatar, EmptyState, Tooltip } from "../../ui";
import { championPath } from "../../app/routes";

/**
 * Top champion masteries.
 *
 * Mastery points are the one number on this screen that has nothing to do with
 * performance — they measure time spent, not skill — so they are shown as
 * such, with the last time the champion was played next to them.
 */
export function MasteryList({
    mastery,
    limit = 8,
    className,
}: {
    mastery: readonly MasteryEntry[];
    limit?: number;
    className?: string;
}) {
    if (mastery.length === 0) {
        return (
            <EmptyState
                size="sm"
                title="Aucune maîtrise"
                description="Riot ne renvoie aucune maîtrise de champion pour ce compte."
            />
        );
    }

    return (
        <ul className={cn("flex flex-wrap gap-2", className)}>
            {mastery.slice(0, limit).map((entry) => (
                <li key={entry.championId}>
                    <Tooltip
                        wide
                        content={
                            <span>
                                <span className="font-semibold">
                                    {entry.champion.name ?? `#${entry.championId}`}
                                </span>
                                <br />
                                Maîtrise {entry.championLevel} —{" "}
                                {formatCount(entry.championPoints)} points
                                {entry.lastPlayTime > 0 && (
                                    <>
                                        <br />
                                        Dernière partie{" "}
                                        {formatRelativeTime(entry.lastPlayTime)}
                                    </>
                                )}
                            </span>
                        }
                    >
                        <Link
                            to={championPath(entry.champion.key)}
                            className={cn(
                                "flex w-24 flex-col items-center gap-1.5 rounded-card border border-line bg-surface-2/60 p-2",
                                "transition-colors hover:border-gold/50 hover:bg-surface-3",
                                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                            )}
                        >
                            <ChampionAvatar
                                champion={entry.champion}
                                size="md"
                                ring="muted"
                                corner={entry.championLevel}
                            />
                            <span className="w-full truncate text-center text-[11px] font-medium text-ink">
                                {entry.champion.name ?? `#${entry.championId}`}
                            </span>
                            <span className="tabular text-[10px] text-ink-subtle">
                                {formatCount(entry.championPoints)} pts
                            </span>
                        </Link>
                    </Tooltip>
                </li>
            ))}
        </ul>
    );
}
