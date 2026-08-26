import type { ChampionDamageProfile } from "@draftpredict/core";
import { cn } from "../../lib/cn";
import { formatPercent } from "../../lib";
import { Tooltip } from "../../ui";
import { normalizeDamage } from "./stats";

/**
 * The champion's damage profile as a single stacked bar.
 *
 * Physical / magic / true, in the colours the rest of the app uses for the
 * two teams plus gold — enough to tell an AD champion from an AP one at a
 * glance, which is what an enemy team building resistances needs.
 */
export function DamageBar({
    profile,
    showLegend = true,
    className,
}: {
    profile: ChampionDamageProfile;
    showLegend?: boolean;
    className?: string;
}) {
    const shares = normalizeDamage(profile);
    const total = shares.physical + shares.magic + shares.true;

    if (total <= 0) {
        return (
            <p className={cn("text-xs text-ink-subtle", className)}>
                Profil de dégâts indisponible.
            </p>
        );
    }

    const segments = [
        {
            key: "physical",
            label: "Physiques",
            value: shares.physical,
            className: "bg-team-enemy",
        },
        {
            key: "magic",
            label: "Magiques",
            value: shares.magic,
            className: "bg-team-ally",
        },
        { key: "true", label: "Bruts", value: shares.true, className: "bg-gold" },
    ];

    return (
        <div className={cn("flex w-full min-w-0 flex-col gap-1.5", className)}>
            <Tooltip
                wide
                wrapperClassName="block w-full"
                content={segments
                    .map(
                        (segment) =>
                            `${segment.label} ${formatPercent(segment.value, 0)}`,
                    )
                    .join(" · ")}
            >
                <div
                    className="flex h-2 w-full overflow-hidden rounded-full bg-surface-3"
                    role="img"
                    aria-label={`Profil de dégâts : ${segments
                        .map(
                            (segment) =>
                                `${segment.label} ${formatPercent(segment.value, 0)}`,
                        )
                        .join(", ")}`}
                >
                    {segments.map((segment) => (
                        <div
                            key={segment.key}
                            className={cn("h-full", segment.className)}
                            style={{ width: `${(segment.value * 100).toFixed(2)}%` }}
                        />
                    ))}
                </div>
            </Tooltip>
            {showLegend && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                    {segments.map((segment) => (
                        <span
                            key={segment.key}
                            className="inline-flex items-center gap-1.5"
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    "h-1.5 w-1.5 rounded-full",
                                    segment.className,
                                )}
                            />
                            {segment.label}
                            <span className="tabular text-ink">
                                {formatPercent(segment.value, 0)}
                            </span>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
