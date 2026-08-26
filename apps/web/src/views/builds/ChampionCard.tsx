import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import type { ChampionSummary } from "../../api";
import { cn } from "../../lib/cn";
import { formatPercent, roleLabels } from "../../lib";
import { ChampionAvatar, Card, RoleIcon, Tooltip, WinrateBar } from "../../ui";
import { championPath } from "../../app/routes";
import { SampleSize, WinrateValue } from "./Metrics";
import { TierBadge } from "./TierBadge";
import { DAMAGE_SHORT_LABEL, PICKRATE_EXPLANATION, tagLabel } from "./labels";
import { damageKind, type ChampionRoleRow, type TierEstimate } from "./stats";

/**
 * One champion in the grid.
 *
 * A tile, not a poster: the portrait is small and the four numbers a player
 * compares champions on — winrate, pick share, sample and tier — are the
 * content. The whole card is one link; the favourite star sits on top of it.
 */
export function ChampionCard({
    champion,
    row,
    tier,
    favourite,
    onToggleFavourite,
    otherRoles = [],
}: {
    champion: ChampionSummary;
    /** The role sample this card describes; `null` when the role has no data. */
    row: ChampionRoleRow | null;
    tier: TierEstimate | null;
    favourite: boolean;
    onToggleFavourite: (championKey: string) => void;
    /** Other roles the champion is played in, for the little role strip. */
    otherRoles?: ChampionRoleRow[];
}) {
    const kind = row ? damageKind(row.damage) : null;

    return (
        <Card
            padding="sm"
            className="group relative flex min-w-0 flex-col gap-2 transition-colors hover:border-gold/50 hover:bg-surface-3 focus-within:border-gold/50"
        >
            <div className="flex min-w-0 items-start gap-2.5">
                <ChampionAvatar
                    champion={champion}
                    size="md"
                    role={row?.role ?? null}
                />
                <div className="min-w-0 flex-1">
                    <Link
                        to={championPath(champion.key, row?.role ?? null)}
                        className="rounded-control text-sm font-semibold text-ink-strong outline-none after:absolute after:inset-0 after:content-[''] group-focus-within:text-gold hover:text-gold"
                    >
                        {champion.name}
                    </Link>
                    <p className="truncate text-[11px] text-ink-subtle">
                        {champion.tags.map(tagLabel).join(" · ") || champion.title}
                    </p>
                </div>
                <TierBadge estimate={tier} />
            </div>

            {row ? (
                <>
                    <div className="flex items-baseline justify-between gap-2">
                        <WinrateValue winrate={row.winrate} games={row.games} />
                        <Tooltip content={PICKRATE_EXPLANATION}>
                            <span className="tabular text-xs text-ink-muted">
                                {formatPercent(row.pickrate, 1)} sél.
                            </span>
                        </Tooltip>
                    </div>
                    <WinrateBar winrate={row.winrate} size="sm" hideValue />
                    <div className="flex items-center justify-between gap-2">
                        <SampleSize games={row.games} wins={row.wins} />
                        <span className="flex items-center gap-1.5">
                            {kind && (
                                <span className="rounded-control border border-line px-1.5 py-0.5 text-[10px] text-ink-muted">
                                    {DAMAGE_SHORT_LABEL[kind]}
                                </span>
                            )}
                            {otherRoles.map((other) => (
                                <Tooltip
                                    key={other.role}
                                    content={`Aussi joué ${roleLabels[other.role]} — ${formatPercent(
                                        other.winrate,
                                    )}`}
                                >
                                    <span className="text-ink-subtle">
                                        <RoleIcon role={other.role} size="xs" />
                                    </span>
                                </Tooltip>
                            ))}
                        </span>
                    </div>
                </>
            ) : (
                <p className="text-xs text-ink-subtle">Aucune partie dans ce rôle.</p>
            )}

            <button
                type="button"
                onClick={() => onToggleFavourite(champion.key)}
                aria-pressed={favourite}
                aria-label={
                    favourite
                        ? `Retirer ${champion.name} des favoris`
                        : `Ajouter ${champion.name} aux favoris`
                }
                className={cn(
                    "absolute top-1 right-1 z-10 rounded-full p-1 transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                    favourite
                        ? "text-gold"
                        : "text-ink-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink",
                )}
            >
                <Star
                    className="h-3.5 w-3.5"
                    fill={favourite ? "currentColor" : "none"}
                />
            </button>
        </Card>
    );
}
