import { ChevronDown } from "lucide-react";
import type { MatchSummary } from "../../api";
import { cn } from "../../lib/cn";
import {
    NBSP,
    formatCount,
    formatDuration,
    formatKda,
    formatNumber,
    formatQueue,
    formatRelativeTime,
    roleLongLabels,
} from "../../lib/format";
import { ChampionAvatar, RoleIcon, Tooltip } from "../../ui";
import { MatchDetail } from "./MatchDetail";
import { killLine, matchOutcome } from "./helpers";

/**
 * One game, as one dense line.
 *
 * The row is a disclosure button: expanding it is what triggers the draft
 * analysis, so a hundred rows cost a hundred zero requests until the user asks
 * a question about one of them.
 */
export function MatchRow({
    match,
    expanded,
    onToggle,
}: {
    match: MatchSummary;
    expanded: boolean;
    onToggle: () => void;
}) {
    const outcome = matchOutcome(match);
    const panelId = `match-${match.matchId}`;

    return (
        <li
            className={cn(
                "overflow-hidden rounded-card border bg-surface-2/50",
                outcome.tone === "positive" && "border-positive/25",
                outcome.tone === "negative" && "border-negative/25",
                outcome.tone === "neutral" && "border-line",
            )}
        >
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                aria-controls={panelId}
                aria-label={`${outcome.label} avec ${match.championName}, ${killLine(match)}. Voir le draft et la prédiction.`}
                className={cn(
                    "flex w-full items-center gap-3 px-2.5 py-2 text-left transition-colors",
                    "hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold",
                )}
            >
                <span
                    aria-hidden
                    className={cn(
                        "h-10 w-1 shrink-0 rounded-full",
                        outcome.tone === "positive" && "bg-positive",
                        outcome.tone === "negative" && "bg-negative",
                        outcome.tone === "neutral" && "bg-ink-subtle",
                    )}
                />

                <ChampionAvatar
                    champion={{ key: match.championKey, name: match.championName }}
                    size="md"
                    ring={outcome.tone === "positive" ? "ally" : "enemy"}
                    corner={match.champLevel}
                />

                <span className="min-w-0 w-36 shrink-0">
                    <span className="block truncate text-sm font-medium text-ink">
                        {match.championName}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-ink-subtle">
                        {match.role !== null && (
                            <RoleIcon role={match.role} size="xs" labelled={false} />
                        )}
                        <span className="truncate">
                            {match.role !== null
                                ? roleLongLabels[match.role]
                                : match.teamPosition || "rôle inconnu"}
                        </span>
                    </span>
                </span>

                <span
                    className={cn(
                        "w-20 shrink-0 text-xs font-semibold",
                        outcome.tone === "positive" && "text-positive",
                        outcome.tone === "negative" && "text-negative",
                        outcome.tone === "neutral" && "text-ink-subtle",
                    )}
                >
                    {outcome.label}
                </span>

                <Cell label="KDA" wide>
                    <span className="tabular text-ink">{killLine(match)}</span>
                    <span className="tabular text-[11px] text-ink-subtle">
                        {formatKda(match.kills, match.deaths, match.assists)}
                        {match.deaths > 0 ? " KDA" : ""}
                    </span>
                </Cell>

                <Cell label="CS">
                    <span className="tabular text-ink">{formatNumber(match.cs)}</span>
                    <span className="tabular text-[11px] text-ink-subtle">
                        {formatNumber(match.csPerMinute, 1)}
                        {NBSP}/{NBSP}min
                    </span>
                </Cell>

                <Cell label="Dégâts">
                    <span className="tabular text-ink">
                        {formatCount(match.damage.toChampions)}
                    </span>
                    <Tooltip content="Part des dégâts aux champions de votre équipe.">
                        <span className="tabular text-[11px] text-ink-subtle">
                            {formatNumber(match.damageShare * 100, 0)}
                            {NBSP}%
                        </span>
                    </Tooltip>
                </Cell>

                <Cell label="Durée" className="hidden lg:flex">
                    <span className="tabular text-ink">
                        {formatDuration(match.durationSeconds)}
                    </span>
                    <span className="truncate text-[11px] text-ink-subtle">
                        {formatQueue(match.queue)}
                    </span>
                </Cell>

                <span className="ml-auto hidden shrink-0 text-right text-[11px] text-ink-subtle xl:block">
                    {formatRelativeTime(match.gameEnd || match.gameCreation)}
                </span>

                <ChevronDown
                    aria-hidden
                    className={cn(
                        "h-4 w-4 shrink-0 text-ink-subtle transition-transform",
                        expanded && "rotate-180",
                    )}
                />
            </button>

            <div id={panelId} role="region" hidden={!expanded}>
                {expanded && <MatchDetail match={match} />}
            </div>
        </li>
    );
}

function Cell({
    label,
    children,
    wide = false,
    className,
}: {
    label: string;
    children: React.ReactNode;
    wide?: boolean;
    className?: string;
}) {
    return (
        <span
            className={cn(
                "flex shrink-0 flex-col text-xs",
                wide ? "w-24" : "w-20",
                className,
            )}
        >
            <span className="sr-only">{label}</span>
            {children}
        </span>
    );
}
