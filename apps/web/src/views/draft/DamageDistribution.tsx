import { Swords } from "lucide-react";
import type { DamageDistribution as DamageDistributionPayload } from "../../api/types";
import { cn } from "../../lib/cn";
import { formatPercent } from "../../lib/format";
import { EmptyState } from "../../ui";
import { damageShares, damageVerdict, type DamageShare } from "./helpers";

export type DamageDistributionProps = {
    ally: DamageDistributionPayload | undefined;
    opponent: DamageDistributionPayload | undefined;
};

const TYPES = [
    { key: "magic", label: "Magiques", className: "bg-info" },
    { key: "physical", label: "Physiques", className: "bg-warning" },
    { key: "trueDamage", label: "Bruts", className: "bg-ink-muted" },
] as const;

/**
 * How each team deals its damage.
 *
 * Only the shares are shown: the engine sums champion damage profiles, so the
 * absolute numbers have no unit a player could act on. What matters is whether
 * one resistance shuts a team down.
 */
export function DamageDistribution({ ally, opponent }: DamageDistributionProps) {
    const allyShares = damageShares(ally);
    const enemyShares = damageShares(opponent);
    const hasData =
        allyShares.magic + allyShares.physical + allyShares.trueDamage > 0 ||
        enemyShares.magic + enemyShares.physical + enemyShares.trueDamage > 0;

    if (!hasData) {
        return (
            <EmptyState
                size="sm"
                icon={<Swords className="h-6 w-6" />}
                title="Aucun profil de dégâts"
                description="Placez des champions pour voir la répartition magique / physique / brute."
            />
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <TeamDamage
                label="Votre équipe"
                shares={allyShares}
                verdict={damageVerdict(ally)}
                accent="text-team-ally"
            />
            <TeamDamage
                label="Équipe adverse"
                shares={enemyShares}
                verdict={damageVerdict(opponent)}
                accent="text-team-enemy"
            />

            <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2">
                {TYPES.map((type) => (
                    <li
                        key={type.key}
                        className="flex items-center gap-1.5 text-[11px] text-ink-muted"
                    >
                        <span
                            aria-hidden
                            className={cn("h-2 w-2 rounded-full", type.className)}
                        />
                        {type.label}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function TeamDamage({
    label,
    shares,
    verdict,
    accent,
}: {
    label: string;
    shares: DamageShare;
    verdict: string | null;
    accent: string;
}) {
    const description = TYPES.map(
        (type) => `${type.label} ${formatPercent(shares[type.key], 0)}`,
    ).join(", ");

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
                <span className={cn("text-xs font-semibold", accent)}>{label}</span>
                <span className="tabular text-[11px] text-ink-muted">
                    {description}
                </span>
            </div>
            <div
                role="img"
                aria-label={`${label} : ${description}`}
                className="flex h-3 w-full overflow-hidden rounded-full bg-surface-3"
            >
                {TYPES.map((type) => {
                    const share = shares[type.key];
                    if (share <= 0) return null;
                    return (
                        <span
                            key={type.key}
                            title={`${type.label} : ${formatPercent(share)}`}
                            className={cn(
                                "block h-full transition-[width] duration-500",
                                type.className,
                            )}
                            style={{ width: `${share * 100}%` }}
                        />
                    );
                })}
            </div>
            {verdict && <p className="text-[11px] text-ink-subtle">{verdict}</p>}
        </div>
    );
}
