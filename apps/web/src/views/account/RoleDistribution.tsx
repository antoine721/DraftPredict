import type { Role } from "@draftpredict/core";
import { cn } from "../../lib/cn";
import { formatNumber, formatPercent, roleLongLabels } from "../../lib/format";
import { winrateTextClass } from "../../lib/winrate";
import { EmptyState, RoleIcon, Tooltip } from "../../ui";
import { totalRoleGames, type RoleShare } from "./helpers";

const ROLE_COLORS: Record<Role, string> = {
    0: "bg-[#c8aa6e]",
    1: "bg-[#4ac47a]",
    2: "bg-[#4f9fff]",
    3: "bg-[#e2b341]",
    4: "bg-[#a78bfa]",
};

/**
 * Where the games were played, as one bar.
 *
 * A pie chart of five slices is unreadable at this size and a bar chart wastes
 * a whole panel, so the distribution is a single stacked track: proportions at
 * a glance, exact games and winrate per role underneath.
 */
export function RoleDistribution({
    distribution,
    className,
}: {
    distribution: readonly RoleShare[];
    className?: string;
}) {
    const total = totalRoleGames(distribution);
    if (total === 0) {
        return (
            <EmptyState
                size="sm"
                title="Aucun rôle identifié"
                description="Riot n'a renvoyé de position pour aucune des parties analysées."
            />
        );
    }

    const rows = [...distribution].sort((a, b) => b.games - a.games);

    return (
        <div className={cn("flex flex-col gap-3", className)}>
            <div
                className="flex h-3 w-full overflow-hidden rounded-full bg-surface-3"
                role="img"
                aria-label={`Répartition des rôles : ${rows
                    .map(
                        (row) =>
                            `${roleLongLabels[row.role]} ${formatPercent(row.share, 0)}`,
                    )
                    .join(", ")}`}
            >
                {rows.map((row) => (
                    <Tooltip
                        key={row.role}
                        content={`${roleLongLabels[row.role]} — ${formatNumber(row.games)} parties (${formatPercent(row.share, 0)})`}
                        wrapperClassName="h-full"
                    >
                        <span
                            className={cn("block h-full", ROLE_COLORS[row.role])}
                            style={{ width: `${Math.max(1, row.share * 100)}%` }}
                        />
                    </Tooltip>
                ))}
            </div>

            <ul className="flex flex-col gap-1.5">
                {rows.map((row) => (
                    <li
                        key={row.role}
                        className="flex items-center gap-2.5 text-xs"
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "h-2 w-2 shrink-0 rounded-full",
                                ROLE_COLORS[row.role],
                            )}
                        />
                        <RoleIcon role={row.role} size="sm" labelled={false} />
                        <span className="min-w-0 flex-1 truncate text-ink">
                            {roleLongLabels[row.role]}
                        </span>
                        <span className="tabular w-12 shrink-0 text-right text-ink-muted">
                            {formatPercent(row.share, 0)}
                        </span>
                        <span className="tabular w-20 shrink-0 text-right text-ink-subtle">
                            {formatNumber(row.games)} parties
                        </span>
                        <span
                            className={cn(
                                "tabular w-14 shrink-0 text-right font-semibold",
                                row.games >= 4
                                    ? winrateTextClass(row.winrate)
                                    : "text-ink-subtle",
                            )}
                        >
                            {formatPercent(row.winrate, 0)}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
