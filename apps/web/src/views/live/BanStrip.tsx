import type { ChampionSummary } from "../../api/types";
import { cn } from "../../lib/cn";
import { ChampionAvatar } from "../../ui";

export type BanStripProps = {
    championKeys: readonly string[];
    byKey: Map<string, ChampionSummary>;
    /** Expected number of tiles; missing ones are drawn as empty slots. */
    slots?: number;
    side: "ally" | "opponent";
    label: string;
    className?: string;
};

/**
 * The bans of one side.
 *
 * Empty slots are drawn too: "three bans so far" and "three bans in total" are
 * different pieces of information during champion select, and only the empty
 * tiles tell them apart.
 */
export function BanStrip({
    championKeys,
    byKey,
    slots = 5,
    side,
    label,
    className,
}: BanStripProps) {
    const tiles = Array.from(
        { length: Math.max(slots, championKeys.length) },
        (_, index) => championKeys[index] ?? null,
    );
    return (
        <div className={cn("flex items-center gap-2", className)}>
            <span className="text-[11px] font-medium tracking-wider text-ink-subtle uppercase">
                {label}
            </span>
            {tiles.length === 0 && (
                <span className="text-[11px] text-ink-subtle">
                    Aucun ban communiqué
                </span>
            )}
            <ul className="flex flex-wrap items-center gap-1" aria-label={label}>
                {tiles.map((championKey, index) => {
                    const champion = championKey ? byKey.get(championKey) : undefined;
                    const name =
                        champion?.name ?? (championKey ? `#${championKey}` : null);
                    return (
                        <li key={`${championKey ?? "empty"}-${index}`}>
                            {championKey ? (
                                <ChampionAvatar
                                    size="xs"
                                    dimmed
                                    ring={side === "ally" ? "ally" : "enemy"}
                                    champion={champion ?? { key: championKey }}
                                    name={name}
                                    title={`${name} — banni`}
                                />
                            ) : (
                                <span
                                    aria-label="Ban non utilisé"
                                    className="block h-6 w-6 rounded-control border border-dashed border-line-strong bg-surface-2/40"
                                />
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
