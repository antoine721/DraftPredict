import type { Role } from "@draftpredict/core";
import type { SuggestionEntry, SuggestionsPayload } from "../../api/types";
import { cn } from "../../lib/cn";
import { formatCount, formatPercent, roleLongLabels } from "../../lib/format";
import { winrateBarShare, winrateColor, winrateTextClass } from "../../lib/winrate";
import { ChampionAvatar, RoleIcon, SkeletonList, Tooltip } from "../../ui";

export type MetaTierListProps = {
    payload: SuggestionsPayload | null;
    isLoading: boolean;
    /** Rows per role. */
    count?: number;
    onPick: (role: Role, championKey: string) => void;
};

const TIERS = [
    { min: 0.53, label: "S", className: "border-gold/60 bg-gold/15 text-gold" },
    {
        min: 0.515,
        label: "A",
        className: "border-winrate-good/50 bg-winrate-good/12 text-winrate-good",
    },
    { min: 0.505, label: "B", className: "border-line-strong bg-surface-3 text-ink" },
    {
        min: Number.NEGATIVE_INFINITY,
        label: "C",
        className: "border-line bg-surface-2 text-ink-muted",
    },
] as const;

function tierOf(winrate: number) {
    return TIERS.find((tier) => winrate >= tier.min) ?? TIERS[TIERS.length - 1];
}

/**
 * The meta, per role — what an empty board shows instead of nothing.
 *
 * The ranking is the engine's own: an analysis of an empty draft, which is
 * exactly "this champion's win rate in this role" with the configured rank,
 * region and risk level. Tiers are thresholds on that number, spelled out in
 * the tooltip, not a hand-made ladder.
 */
export function MetaTierList({
    payload,
    isLoading,
    count = 8,
    onPick,
}: MetaTierListProps) {
    if (isLoading && !payload) return <SkeletonList rows={6} />;

    const roles = payload?.roles ?? [];
    if (roles.length === 0) {
        return (
            <p className="text-sm text-ink-muted">
                Classement indisponible : le jeu de données n'a pas pu être chargé.
            </p>
        );
    }

    return (
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {roles.map((bucket) => (
                <section key={bucket.role} className="flex min-w-0 flex-col gap-2">
                    <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-ink-muted uppercase">
                        <RoleIcon role={bucket.role} size="sm" labelled={false} />
                        {roleLongLabels[bucket.role]}
                    </h3>
                    <ol className="flex flex-col gap-1">
                        {bucket.suggestions.slice(0, count).map((entry, index) => (
                            <TierRow
                                key={entry.key}
                                entry={entry}
                                index={index}
                                onPick={() => onPick(bucket.role, entry.key)}
                            />
                        ))}
                    </ol>
                </section>
            ))}
        </div>
    );
}

function TierRow({
    entry,
    index,
    onPick,
}: {
    entry: SuggestionEntry;
    index: number;
    onPick: () => void;
}) {
    const tier = tierOf(entry.winrate);
    return (
        <li>
            <button
                type="button"
                onClick={onPick}
                aria-label={`Placer ${entry.name ?? entry.key} en ${roleLongLabels[entry.role]}`}
                className={cn(
                    "flex w-full items-center gap-2 rounded-card border border-transparent px-1.5 py-1 text-left",
                    "transition-colors hover:border-gold/40 hover:bg-surface-2",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                )}
            >
                <span className="tabular w-4 shrink-0 text-right text-[11px] text-ink-subtle">
                    {index + 1}
                </span>
                <ChampionAvatar champion={entry} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-ink-strong">
                        {entry.name ?? `#${entry.key}`}
                    </span>
                    <span
                        aria-hidden
                        className="mt-0.5 block h-1 w-full overflow-hidden rounded-full bg-surface-3"
                    >
                        <span
                            className="block h-full rounded-full"
                            style={{
                                width: `${winrateBarShare(entry.winrate) * 100}%`,
                                backgroundColor: winrateColor(entry.winrate),
                            }}
                        />
                    </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                    <span
                        className={cn(
                            "tabular text-xs font-semibold",
                            winrateTextClass(entry.winrate),
                        )}
                    >
                        {formatPercent(entry.winrate)}
                    </span>
                    <span className="tabular text-[10px] text-ink-subtle">
                        {formatCount(entry.games)}
                    </span>
                </span>
                <Tooltip
                    content={`Palier ${tier.label} : à partir de ${
                        Number.isFinite(tier.min)
                            ? formatPercent(tier.min, 1)
                            : "toute valeur"
                    } de victoire dans ce rôle.`}
                    side="left"
                    wide
                >
                    <span
                        className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-control border text-[10px] font-bold",
                            tier.className,
                        )}
                    >
                        {tier.label}
                    </span>
                </Tooltip>
            </button>
        </li>
    );
}
