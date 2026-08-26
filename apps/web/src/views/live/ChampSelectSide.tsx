import { Crosshair, Eye, User } from "lucide-react";
import type { ChampionSummary } from "../../api/types";
import { cn } from "../../lib/cn";
import { roleLongLabels } from "../../lib/format";
import { Badge, ChampionAvatar, RoleIcon } from "../../ui";
import type { ChampSelectRow, LiveSide } from "./helpers";

export type ChampSelectSideProps = {
    side: LiveSide;
    title: string;
    rows: readonly ChampSelectRow[];
    byKey: Map<string, ChampionSummary>;
    className?: string;
};

/**
 * One side of the champion-select mirror: five positions, in order.
 *
 * A hovered champion is drawn dimmed and labelled "survol" — it is not a pick
 * and must never look like one. A position the client did not assign is marked
 * as inferred, because on the enemy side it very often is.
 */
export function ChampSelectSide({
    side,
    title,
    rows,
    byKey,
    className,
}: ChampSelectSideProps) {
    return (
        <section
            className={cn("flex min-w-0 flex-col gap-2", className)}
            aria-label={title}
        >
            <h3
                className={cn(
                    "text-xs font-semibold tracking-wider uppercase",
                    side === "ally" ? "text-team-ally" : "text-team-enemy",
                )}
            >
                {title}
            </h3>
            <ul className="flex flex-col gap-1.5">
                {rows.map((row) => (
                    <ChampSelectRowItem
                        key={row.role}
                        row={row}
                        side={side}
                        champion={
                            row.championKey ? byKey.get(row.championKey) : undefined
                        }
                    />
                ))}
            </ul>
        </section>
    );
}

function ChampSelectRowItem({
    row,
    side,
    champion,
}: {
    row: ChampSelectRow;
    side: LiveSide;
    champion: ChampionSummary | undefined;
}) {
    const name =
        champion?.name ??
        row.championName ??
        (row.championKey ? `#${row.championKey}` : null);

    return (
        <li
            className={cn(
                "flex items-center gap-2.5 rounded-card border px-2 py-1.5 transition-colors",
                row.acting ? "border-gold/60 bg-gold/8" : "border-line bg-surface-2/60",
            )}
        >
            <span
                className={cn(
                    "shrink-0",
                    side === "ally" ? "text-team-ally" : "text-team-enemy",
                )}
            >
                <RoleIcon role={row.role} size="sm" labelled={false} />
            </span>
            <ChampionAvatar
                size="sm"
                dimmed={row.hovered || row.championKey === null}
                ring={row.isLocalPlayer ? "gold" : side === "ally" ? "ally" : "enemy"}
                champion={
                    champion ?? (row.championKey ? { key: row.championKey } : null)
                }
                name={name}
            />
            <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm text-ink">
                    {name ?? <span className="text-ink-subtle italic">En attente</span>}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-ink-subtle">
                    {roleLongLabels[row.role]}
                    {!row.assigned && row.championKey !== null && (
                        <span title="Position déduite par le moteur, le client ne l'a pas communiquée">
                            (position déduite)
                        </span>
                    )}
                </span>
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1">
                {row.hovered && (
                    <Badge
                        tone="warning"
                        size="sm"
                        icon={<Eye className="h-3 w-3" />}
                        title="Champion survolé, pas encore verrouillé"
                    >
                        Survol
                    </Badge>
                )}
                {row.isLocalPlayer && (
                    <Badge tone="gold" size="sm" icon={<User className="h-3 w-3" />}>
                        Vous
                    </Badge>
                )}
                {row.acting && (
                    <Badge
                        tone="gold"
                        size="sm"
                        dot
                        icon={<Crosshair className="h-3 w-3" />}
                    >
                        En cours
                    </Badge>
                )}
            </span>
        </li>
    );
}
