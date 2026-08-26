import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { PlaystyleProfile } from "../../api";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";
import { EmptyState, Tooltip } from "../../ui";
import { formatAxisDelta } from "./helpers";
import { axisDescription, axisLabel, traitAdvice, traitLabel } from "./labels";

type Trait = PlaystyleProfile["strengths"][number];

/**
 * Forces and faiblesses, ranked.
 *
 * The API returns stable English `labelKey`s (`playstyle.strength.vision`) and
 * an English `label` as a fallback; only the key is used here, so the screen
 * is French even when the engine's wording changes. Each line carries the axis
 * score, the distance to the role baseline, and one actionable sentence —
 * a bare adjective helps nobody improve.
 */
export function TraitList({
    traits,
    kind,
    className,
}: {
    traits: readonly Trait[];
    kind: "strength" | "weakness";
    className?: string;
}) {
    if (traits.length === 0) {
        return (
            <EmptyState
                size="sm"
                title={
                    kind === "strength"
                        ? "Aucune force marquée"
                        : "Aucune faiblesse marquée"
                }
                description={
                    kind === "strength"
                        ? "Aucun axe ne dépasse nettement la moyenne de votre rôle : votre profil est équilibré."
                        : "Aucun axe ne descend nettement sous la moyenne de votre rôle."
                }
            />
        );
    }

    return (
        <ol className={cn("flex flex-col gap-2", className)}>
            {traits.map((trait, index) => (
                <li
                    key={trait.labelKey}
                    className={cn(
                        "flex items-start gap-3 rounded-card border px-3 py-2.5",
                        kind === "strength"
                            ? "border-positive/30 bg-positive/8"
                            : "border-negative/30 bg-negative/8",
                    )}
                >
                    <span
                        aria-hidden
                        className={cn(
                            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                            kind === "strength"
                                ? "bg-positive/15 text-positive"
                                : "bg-negative/15 text-negative",
                        )}
                    >
                        {kind === "strength" ? (
                            <ThumbsUp className="h-3.5 w-3.5" />
                        ) : (
                            <ThumbsDown className="h-3.5 w-3.5" />
                        )}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                            <p className="min-w-0 text-sm font-medium text-ink">
                                <span className="text-ink-subtle">{index + 1}.</span>{" "}
                                {traitLabel(trait.labelKey, trait.axis)}
                            </p>
                            <Tooltip wide content={axisDescription(trait.axis)}>
                                <span
                                    className={cn(
                                        "tabular shrink-0 text-xs font-semibold",
                                        kind === "strength"
                                            ? "text-positive"
                                            : "text-negative",
                                    )}
                                >
                                    {formatNumber(trait.score, 0)}
                                    <span className="text-ink-subtle">/100</span>{" "}
                                    <span className="font-normal">
                                        ({formatAxisDelta(trait.delta)})
                                    </span>
                                </span>
                            </Tooltip>
                        </div>
                        <p className="mt-0.5 text-xs text-ink-muted">
                            {axisLabel(trait.axis)} —{" "}
                            {traitAdvice(trait.labelKey, trait.axis)}
                        </p>
                    </div>
                </li>
            ))}
        </ol>
    );
}
