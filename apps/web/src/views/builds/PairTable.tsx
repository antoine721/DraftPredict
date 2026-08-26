import type { ReactNode } from "react";
import type { ChampionSummary } from "../../api";
import { cn } from "../../lib/cn";
import { formatPercent, roleLabels } from "../../lib";
import { Button, ChampionAvatar, EmptyState, RoleIcon, Tooltip } from "../../ui";
import { DeltaValue, SampleSize, ThinSampleMark, WinrateValue } from "./Metrics";
import type { PairRow } from "./stats";

/**
 * The shared body of the matchup and synergy tables.
 *
 * The delta is the number that matters — a pairing's own worth, once both
 * champions' strength has been removed — and it is always shown next to the
 * sample it was measured on, because the matchup matrix is where tiny samples
 * live.
 */
export function PairTable({
    rows,
    byKey,
    emptyLabel,
    showRole = true,
    action,
    limit,
}: {
    rows: readonly PairRow[];
    byKey: Map<string, ChampionSummary>;
    emptyLabel: string;
    showRole?: boolean;
    /** Rendered at the end of each row, e.g. "voir le build". */
    action?: (row: PairRow) => ReactNode;
    limit?: number;
}) {
    const visible = limit === undefined ? rows : rows.slice(0, limit);

    if (visible.length === 0) {
        return <EmptyState size="sm" title={emptyLabel} />;
    }

    return (
        <ul className="flex flex-col gap-1">
            <li
                aria-hidden
                className="flex items-center gap-3 px-2 pb-1 text-[10px] tracking-wider text-ink-subtle uppercase"
            >
                <span className="w-8 shrink-0" />
                <span className="min-w-0 flex-1">Champion</span>
                <span className="w-16 shrink-0 text-right">Winrate</span>
                <span className="w-16 shrink-0 text-right">Apport</span>
                <span className="w-14 shrink-0 text-right">Parties</span>
                {action && <span className="w-24 shrink-0" />}
            </li>
            {visible.map((row) => {
                const champion = byKey.get(row.championKey) ?? null;
                return (
                    <li
                        key={`${row.championKey}:${row.role}`}
                        className={cn(
                            "flex items-center gap-3 rounded-card border border-line-soft bg-surface-2/60 px-2 py-1.5",
                            row.games < 50 && "opacity-70",
                        )}
                    >
                        <ChampionAvatar
                            champion={champion ?? { name: `#${row.championKey}` }}
                            size="sm"
                        />
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="truncate text-sm text-ink-strong">
                                {champion?.name ?? `Champion ${row.championKey}`}
                            </span>
                            {showRole && (
                                <Tooltip content={roleLabels[row.role]}>
                                    <span className="text-ink-subtle">
                                        <RoleIcon role={row.role} size="xs" />
                                    </span>
                                </Tooltip>
                            )}
                            <ThinSampleMark games={row.games} />
                        </span>
                        <Tooltip
                            wide
                            content={`Taux de victoire brut de l'affrontement : ${formatPercent(
                                row.winrate,
                            )} sur ${Math.round(row.games)} parties.`}
                        >
                            <span className="w-16 shrink-0 text-right">
                                <WinrateValue winrate={row.winrate} games={row.games} />
                            </span>
                        </Tooltip>
                        <span className="w-16 shrink-0 text-right text-xs">
                            <DeltaValue delta={row.winrateDelta} games={row.games} />
                        </span>
                        <span className="w-14 shrink-0 text-right">
                            <SampleSize
                                games={row.games}
                                wins={row.wins}
                                showDot={false}
                            />
                        </span>
                        {action && (
                            <span className="w-24 shrink-0 text-right">
                                {action(row)}
                            </span>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

/** The "build vs X" call to action used by the matchup table. */
export function VersusButton({
    label,
    active,
    onClick,
}: {
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <Button
            size="sm"
            variant={active ? "secondary" : "ghost"}
            aria-pressed={active}
            onClick={onClick}
        >
            {active ? "Build actif" : `vs ${label}`}
        </Button>
    );
}
