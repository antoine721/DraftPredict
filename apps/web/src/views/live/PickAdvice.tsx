import type { Role } from "@draftpredict/core";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import type { SuggestionsPayload } from "../../api/types";
import { ROUTES } from "../../app/routes";
import { cn } from "../../lib/cn";
import {
    formatCount,
    formatPercent,
    formatSignedPercent,
    roleLongLabels,
} from "../../lib/format";
import { deltaColor } from "../../lib/winrate";
import { ChampionAvatar } from "../../ui";

export type PickAdviceProps = {
    suggestions: SuggestionsPayload | null;
    /** The position to advise on, when the client told us which one it is. */
    role: Role | null;
    limit?: number;
    className?: string;
};

/**
 * The top picks the server already computed for the champion select it pushed.
 *
 * Deliberately short: this screen mirrors what is happening, it does not
 * replace the draft board, so it shows the three best options and hands over.
 */
export function PickAdvice({
    suggestions,
    role,
    limit = 3,
    className,
}: PickAdviceProps) {
    if (!suggestions) return null;

    const bucket =
        role === null
            ? null
            : (suggestions.roles.find((entry) => entry.role === role && entry.open) ??
              null);
    const entries = (bucket?.suggestions ?? suggestions.best ?? []).slice(0, limit);
    if (entries.length === 0) return null;

    const baseline = suggestions.baseline?.winrate ?? 0.5;

    return (
        <div className={cn("flex flex-col gap-2", className)}>
            <h4 className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-ink-subtle uppercase">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {bucket
                    ? `Meilleurs choix en ${roleLongLabels[bucket.role]}`
                    : "Meilleurs choix, toutes positions ouvertes"}
            </h4>
            <ul className="flex flex-col gap-1.5">
                {entries.map((entry) => (
                    <li
                        key={`${entry.key}-${entry.role}`}
                        className="flex items-center gap-2 rounded-card border border-line bg-surface-2/60 px-2 py-1.5"
                    >
                        <ChampionAvatar size="sm" champion={entry} role={entry.role} />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">
                            {entry.name ?? `#${entry.key}`}
                        </span>
                        <span className="flex shrink-0 flex-col items-end">
                            <span
                                className="tabular text-xs font-semibold"
                                style={{ color: deltaColor(entry.winrateDelta) }}
                            >
                                {formatSignedPercent(entry.winrateDelta)}
                            </span>
                            <span className="tabular text-[11px] text-ink-subtle">
                                {formatPercent(entry.winrate)} ·{" "}
                                {formatCount(entry.games)} parties
                            </span>
                        </span>
                    </li>
                ))}
            </ul>
            <p className="text-[11px] text-ink-subtle">
                Écarts mesurés par rapport à {formatPercent(baseline)}, la probabilité
                du draft actuel.{" "}
                <Link
                    to={ROUTES.draft.path}
                    className="text-gold underline-offset-2 hover:underline"
                >
                    Voir toutes les suggestions
                </Link>
            </p>
        </div>
    );
}
