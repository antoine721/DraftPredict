import { Sparkles } from "lucide-react";
import type { Role } from "@draftpredict/core";
import type { ApiError } from "../../api";
import type { SuggestionEntry, SuggestionsPayload } from "../../api/types";
import { cn } from "../../lib/cn";
import {
    formatCount,
    formatPercent,
    formatSignedPercent,
    roleLongLabels,
} from "../../lib/format";
import { deltaColor, winrateTextClass } from "../../lib/winrate";
import {
    Badge,
    ChampionAvatar,
    EmptyState,
    ErrorState,
    RoleIcon,
    SkeletonList,
} from "../../ui";
import { suggestionReason } from "./helpers";

export type SuggestionListProps = {
    payload: SuggestionsPayload | null;
    isLoading: boolean;
    error: ApiError | null;
    /** Rows per role. */
    limit: number;
    /** The local player's role in champion select: shown first, and labelled. */
    priorityRole?: Role | null;
    onPreview: (entry: SuggestionEntry | null) => void;
    onPick: (entry: SuggestionEntry) => void;
};

/**
 * The ranked picks for every open ally role.
 *
 * Hovering — or focusing — a row previews the champion on the board and moves
 * the gauge to the probability it would produce; clicking commits it. The
 * numbers are the server's: `winrate` is the probability *after* the pick, and
 * `winrateDelta` is what it changes compared to the board as it stands.
 */
export function SuggestionList({
    payload,
    isLoading,
    error,
    limit,
    priorityRole = null,
    onPreview,
    onPick,
}: SuggestionListProps) {
    if (error) return <ErrorState error={error} size="sm" />;
    if (isLoading && !payload) return <SkeletonList rows={5} />;

    const roles = (payload?.roles ?? [])
        .filter((entry) => entry.open)
        // In champion select, the role you are about to pick comes first.
        .sort((a, b) => {
            if (a.role === priorityRole) return -1;
            if (b.role === priorityRole) return 1;
            return a.role - b.role;
        });
    if (roles.length === 0) {
        return (
            <EmptyState
                size="sm"
                icon={<Sparkles className="h-6 w-6" />}
                title="Votre équipe est complète"
                description="Il n'y a plus de rôle à conseiller. Videz un emplacement pour comparer d'autres choix."
            />
        );
    }

    const baseline = payload?.baseline.winrate ?? 0.5;

    return (
        <div className="grid gap-x-6 gap-y-5 md:grid-cols-2 2xl:grid-cols-3">
            {roles.map((bucket) => (
                <RoleSuggestions
                    key={bucket.role}
                    role={bucket.role}
                    entries={bucket.suggestions.slice(0, limit)}
                    baseline={baseline}
                    yours={bucket.role === priorityRole}
                    onPreview={onPreview}
                    onPick={onPick}
                />
            ))}
        </div>
    );
}

function RoleSuggestions({
    role,
    entries,
    baseline,
    yours,
    onPreview,
    onPick,
}: {
    role: Role;
    entries: SuggestionEntry[];
    baseline: number;
    yours: boolean;
    onPreview: (entry: SuggestionEntry | null) => void;
    onPick: (entry: SuggestionEntry) => void;
}) {
    return (
        <section className="flex min-w-0 flex-col gap-2">
            <h3
                className={cn(
                    "flex items-center gap-2 text-xs font-semibold tracking-wider uppercase",
                    yours ? "text-gold" : "text-ink-muted",
                )}
            >
                <RoleIcon role={role} size="sm" labelled={false} />
                {roleLongLabels[role]}
                {yours && <Badge tone="gold">Votre rôle</Badge>}
            </h3>

            {entries.length === 0 ? (
                <p className="text-xs text-ink-subtle">
                    Aucun champion ne dépasse le seuil de parties pour ce rôle.
                </p>
            ) : (
                <ol className="flex flex-col gap-1">
                    {entries.map((entry, index) => (
                        <li key={entry.key}>
                            <button
                                type="button"
                                onClick={() => onPick(entry)}
                                onMouseEnter={() => onPreview(entry)}
                                onMouseLeave={() => onPreview(null)}
                                onFocus={() => onPreview(entry)}
                                onBlur={() => onPreview(null)}
                                aria-label={`Choisir ${entry.name ?? entry.key} en ${roleLongLabels[role]} — ${formatPercent(entry.winrate)} de victoire`}
                                className={cn(
                                    "group/suggestion flex w-full items-center gap-2.5 rounded-card border border-transparent px-2 py-1.5 text-left",
                                    "transition-colors hover:border-gold/40 hover:bg-surface-2",
                                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                                )}
                            >
                                <span className="tabular w-4 shrink-0 text-right text-[11px] text-ink-subtle">
                                    {index + 1}
                                </span>
                                <ChampionAvatar
                                    champion={entry}
                                    size="sm"
                                    role={entry.role}
                                />
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="truncate text-sm font-medium text-ink-strong">
                                        {entry.name ?? `#${entry.key}`}
                                    </span>
                                    <span className="truncate text-[11px] text-ink-subtle">
                                        {suggestionReason(entry, baseline, index)}
                                    </span>
                                </span>
                                <span className="flex shrink-0 flex-col items-end">
                                    <span
                                        className={cn(
                                            "tabular text-sm font-semibold",
                                            winrateTextClass(entry.winrate),
                                        )}
                                    >
                                        {formatPercent(entry.winrate)}
                                    </span>
                                    <span
                                        className="tabular text-[11px] font-semibold"
                                        style={{
                                            color: deltaColor(entry.winrateDelta),
                                        }}
                                    >
                                        {formatSignedPercent(entry.winrateDelta)}
                                    </span>
                                </span>
                                <span className="tabular hidden w-16 shrink-0 text-right text-[11px] text-ink-subtle sm:block">
                                    {formatCount(entry.games)}
                                </span>
                            </button>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
