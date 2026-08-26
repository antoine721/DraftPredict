import { cn } from "../../lib/cn";
import { formatSigned } from "../../lib";
import { Badge, Tooltip } from "../../ui";
import { TIER_EXPLANATION } from "./labels";
import type { Tier, TierEstimate } from "./stats";

const TIER_CLASS: Record<Tier, string> = {
    S: "border-gold/60 bg-gold/15 text-gold",
    A: "border-winrate-great/50 bg-winrate-great/12 text-winrate-great",
    B: "border-info/40 bg-info/12 text-info",
    C: "border-line-strong bg-surface-3 text-ink-muted",
    D: "border-negative/40 bg-negative/12 text-negative",
};

/**
 * The tier estimate, always attached to its explanation.
 *
 * A champion the dataset barely knows gets a dash, never a flattering letter.
 */
export function TierBadge({
    estimate,
    size = "sm",
    className,
}: {
    estimate: TierEstimate | null;
    size?: "sm" | "md";
    className?: string;
}) {
    if (!estimate) {
        return (
            <Tooltip content="Moins de 100 parties dans ce rôle : pas assez de données pour estimer un tier.">
                <Badge tone="offline" size={size} className={className}>
                    —
                </Badge>
            </Tooltip>
        );
    }

    return (
        <Tooltip
            wide
            content={
                <span>
                    <span className="font-semibold">Tier {estimate.tier}</span> — score{" "}
                    {formatSigned(estimate.score, 2)} σ (rating{" "}
                    {formatSigned(estimate.ratingZ, 2)} σ, popularité{" "}
                    {formatSigned(estimate.popularityZ, 2)} σ).
                    <br />
                    {TIER_EXPLANATION}
                </span>
            }
        >
            <span
                className={cn(
                    "inline-flex items-center justify-center rounded-full border font-bold",
                    size === "sm" ? "h-5 w-5 text-[11px]" : "h-7 w-7 text-sm",
                    TIER_CLASS[estimate.tier],
                    className,
                )}
                aria-label={`Tier ${estimate.tier}`}
            >
                {estimate.tier}
            </span>
        </Tooltip>
    );
}
