import { Ban } from "lucide-react";
import type { ApiError } from "../../api";
import type { BanEntry, BansPayload } from "../../api/types";
import { cn } from "../../lib/cn";
import { formatCount, formatPercent, roleLabels } from "../../lib/format";
import { deltaColor, winrateTextClass } from "../../lib/winrate";
import {
    Badge,
    ChampionAvatar,
    EmptyState,
    ErrorState,
    SkeletonList,
    Tooltip,
} from "../../ui";
import { banReason } from "./helpers";

export type BanSuggestionListProps = {
    payload: BansPayload | null;
    isLoading: boolean;
    error: ApiError | null;
    limit: number;
    /** Ally ban slots are full: rows stay informative but stop acting. */
    full: boolean;
    onBan: (entry: BanEntry) => void;
};

/**
 * Champions that would hurt you most in enemy hands.
 *
 * `winrateLoss` is what your probability drops to if the enemy gets the
 * champion, so the ordering is "most threatening first" — the same order the
 * server computed.
 */
export function BanSuggestionList({
    payload,
    isLoading,
    error,
    limit,
    full,
    onBan,
}: BanSuggestionListProps) {
    if (error) return <ErrorState error={error} size="sm" />;
    if (isLoading && !payload) return <SkeletonList rows={5} />;

    const entries = (payload?.bans ?? []).slice(0, limit);
    if (entries.length === 0) {
        return (
            <EmptyState
                size="sm"
                icon={<Ban className="h-6 w-6" />}
                title="Aucune menace à signaler"
                description="Le moteur n'a trouvé aucun champion nettement dangereux pour ce draft."
            />
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {full && (
                <p className="text-xs text-warning">
                    Vos cinq bans sont posés : retirez-en un pour en ajouter un autre.
                </p>
            )}
            <ol className="grid gap-1 md:grid-cols-2">
                {entries.map((entry, index) => (
                    <li key={entry.key}>
                        <button
                            type="button"
                            disabled={full}
                            onClick={() => onBan(entry)}
                            aria-label={`Bannir ${entry.name ?? entry.key}`}
                            className={cn(
                                "flex w-full items-center gap-2.5 rounded-card border border-transparent px-2 py-1.5 text-left transition-colors",
                                full
                                    ? "cursor-not-allowed opacity-60"
                                    : "hover:border-negative/40 hover:bg-surface-2",
                                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                            )}
                        >
                            <span className="tabular w-4 shrink-0 text-right text-[11px] text-ink-subtle">
                                {index + 1}
                            </span>
                            <ChampionAvatar
                                champion={entry}
                                size="sm"
                                ring="enemy"
                                role={entry.role}
                            />
                            <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-sm font-medium text-ink-strong">
                                    {entry.name ?? `#${entry.key}`}
                                </span>
                                <span className="truncate text-[11px] text-ink-subtle">
                                    {banReason(entry)}
                                </span>
                            </span>
                            <Tooltip
                                content={`Sans ce ban, votre probabilité tombe à ${formatPercent(entry.winrate)}.`}
                                wide
                                side="left"
                            >
                                <span className="flex shrink-0 flex-col items-end">
                                    <span
                                        className="tabular text-sm font-semibold"
                                        style={{
                                            color: deltaColor(-entry.winrateLoss),
                                        }}
                                    >
                                        -{formatPercent(Math.abs(entry.winrateLoss))}
                                    </span>
                                    <span
                                        className={cn(
                                            "tabular text-[11px]",
                                            winrateTextClass(entry.winrate),
                                        )}
                                    >
                                        {formatPercent(entry.winrate)}
                                    </span>
                                </span>
                            </Tooltip>
                            <Badge
                                tone="neutral"
                                className="hidden shrink-0 lg:inline-flex"
                            >
                                {roleLabels[entry.role]} · {formatCount(entry.games)}
                            </Badge>
                        </button>
                    </li>
                ))}
            </ol>
        </div>
    );
}
