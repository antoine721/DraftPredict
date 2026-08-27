import { Ban } from "lucide-react";
import type { Team } from "@draftpredict/core";
import type { ChampionSummary } from "../../api/types";
import { cn } from "../../lib/cn";
import { ChampionAvatar, Tooltip } from "../../ui";

export type BanRowProps = {
    team: Team;
    /** Champion keys, in the order the client revealed them. */
    bans: readonly string[];
    byKey: Map<string, ChampionSummary>;
    onAdd: () => void;
    onRemove: (championKey: string) => void;
};

const SLOTS = [0, 1, 2, 3, 4] as const;

/** The five ban slots of one team. Clicking a filled ban lifts it. */
export function BanRow({ team, bans, byKey, onAdd, onRemove }: BanRowProps) {
    const side = team === "ally" ? "votre équipe" : "l'équipe adverse";
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink-subtle">Bans</span>
            <ul
                className={cn(
                    "flex gap-1.5",
                    team === "opponent" && "flex-row-reverse",
                )}
            >
                {SLOTS.map((index) => {
                    const key = bans[index] ?? null;
                    const champion = key ? (byKey.get(key) ?? null) : null;
                    const name = champion?.name ?? (key ? `#${key}` : null);
                    return (
                        <li key={index}>
                            <Tooltip
                                content={
                                    key
                                        ? `${name} banni par ${side} — cliquer pour retirer`
                                        : `Ajouter un ban pour ${side}`
                                }
                            >
                                <button
                                    type="button"
                                    onClick={() => (key ? onRemove(key) : onAdd())}
                                    aria-label={
                                        key
                                            ? `Retirer le ban ${name}`
                                            : `Ajouter un ban pour ${side}`
                                    }
                                    className={cn(
                                        "relative flex h-9 w-9 items-center justify-center rounded-card border transition-colors",
                                        key
                                            ? "border-line-strong bg-surface-2 hover:border-negative/70"
                                            : "border-dashed border-line bg-surface-1/60 text-ink-subtle hover:border-gold/60 hover:text-ink",
                                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                                    )}
                                >
                                    {key ? (
                                        <>
                                            <ChampionAvatar
                                                champion={champion}
                                                name={name}
                                                size="sm"
                                                dimmed
                                                className="h-full w-full"
                                            />
                                            <span
                                                aria-hidden
                                                className="absolute inset-0 flex items-center justify-center text-negative/90"
                                            >
                                                <Ban className="h-4.5 w-4.5" />
                                            </span>
                                        </>
                                    ) : (
                                        <Ban className="h-3.5 w-3.5" aria-hidden />
                                    )}
                                </button>
                            </Tooltip>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
