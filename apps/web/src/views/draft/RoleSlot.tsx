import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Plus, X } from "lucide-react";
import { ROLES, type Role, type Team } from "@draftpredict/core";
import type { ChampionSummary } from "../../api/types";
import { cn } from "../../lib/cn";
import {
    formatCount,
    formatPercent,
    roleLabels,
    roleLongLabels,
} from "../../lib/format";
import { winrateTextClass } from "../../lib/winrate";
import { Badge, ChampionAvatar, IconButton, RoleIcon } from "../../ui";

export type RoleSlotGhost = "preview" | "hover" | null;

export type RoleSlotProps = {
    team: Team;
    role: Role;
    champion: ChampionSummary | null;
    championKey: string | null;
    /** The champion's own numbers in this role, from the analysis breakdown. */
    sample: { winrate: number; games: number } | null;
    selected: boolean;
    /** Renders the champion as not-yet-committed: a suggestion or an LCU hover. */
    ghost: RoleSlotGhost;
    /** This cell is the one currently picking in champion select. */
    acting?: boolean;
    onSelect: () => void;
    onClear: () => void;
    onSwapRole: (role: Role) => void;
};

/**
 * One of the ten cells of the board.
 *
 * The whole cell is a button that opens the picker — that is the action a
 * player wants 95 % of the time — and the two secondary actions (clear, move
 * to another role) appear on hover and on keyboard focus, never nested inside
 * that button.
 */
export function RoleSlot({
    team,
    role,
    champion,
    championKey,
    sample,
    selected,
    ghost,
    acting = false,
    onSelect,
    onClear,
    onSwapRole,
}: RoleSlotProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const mirrored = team === "opponent";
    const filled = championKey !== null;
    const name = champion?.name ?? (filled ? `#${championKey}` : null);

    useEffect(() => {
        if (!menuOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setMenuOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [menuOpen]);

    return (
        <div className="group/slot relative">
            <button
                type="button"
                onClick={onSelect}
                aria-label={
                    filled
                        ? `${name} en ${roleLongLabels[role]} — changer de champion`
                        : `Choisir un champion en ${roleLongLabels[role]}`
                }
                aria-pressed={selected}
                className={cn(
                    "flex w-full items-center gap-3 rounded-card border px-2.5 py-2 text-left transition-colors",
                    mirrored && "flex-row-reverse text-right",
                    filled
                        ? "border-line bg-surface-2/80 hover:border-gold/50 hover:bg-surface-3"
                        : "border-dashed border-line-strong bg-surface-1/60 hover:border-gold/60 hover:bg-surface-2",
                    selected && "border-gold/70 bg-surface-3 shadow-glow-gold",
                    acting && !selected && "border-team-ally/60",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                )}
            >
                <span
                    className={cn(
                        "flex w-9 shrink-0 flex-col items-center gap-0.5",
                        team === "ally" ? "text-team-ally" : "text-team-enemy",
                    )}
                >
                    <RoleIcon role={role} size="md" labelled={false} />
                    <span className="text-[10px] font-semibold tracking-wide text-ink-subtle uppercase">
                        {roleLabels[role]}
                    </span>
                </span>

                <ChampionAvatar
                    champion={champion}
                    name={name}
                    size="md"
                    ring={team === "ally" ? "ally" : "enemy"}
                    dimmed={ghost !== null}
                    className={cn(!filled && "opacity-30")}
                />

                <span className="flex min-w-0 flex-1 flex-col">
                    <span
                        className={cn(
                            "truncate text-sm font-semibold",
                            filled ? "text-ink-strong" : "text-ink-subtle",
                        )}
                    >
                        {name ?? "Emplacement libre"}
                    </span>
                    {filled && sample ? (
                        <span className="tabular truncate text-xs text-ink-muted">
                            <span className={winrateTextClass(sample.winrate)}>
                                {formatPercent(sample.winrate)}
                            </span>{" "}
                            · {formatCount(sample.games)} parties
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 truncate text-xs text-ink-subtle">
                            {filled ? (
                                "Échantillon indisponible"
                            ) : (
                                <>
                                    <Plus className="h-3 w-3" aria-hidden />
                                    Choisir un champion
                                </>
                            )}
                        </span>
                    )}
                    {ghost !== null && (
                        <Badge
                            tone={ghost === "hover" ? "info" : "gold"}
                            className={cn("mt-1 w-fit", mirrored && "self-end")}
                        >
                            {ghost === "hover" ? "Survol client" : "Aperçu"}
                        </Badge>
                    )}
                </span>
            </button>

            {filled && (
                <div
                    className={cn(
                        // Invisible *and* inert: an opacity-0 button would still
                        // swallow clicks aimed at the slot itself.
                        "absolute top-1 flex gap-0.5 opacity-0 transition-opacity",
                        "pointer-events-none group-hover/slot:pointer-events-auto group-focus-within/slot:pointer-events-auto",
                        "group-hover/slot:opacity-100 group-focus-within/slot:opacity-100",
                        mirrored ? "left-1" : "right-1",
                    )}
                >
                    <IconButton
                        label={`Déplacer ${name} vers un autre rôle`}
                        size="sm"
                        variant="subtle"
                        icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        onClick={() => setMenuOpen((open) => !open)}
                    />
                    <IconButton
                        label={`Retirer ${name}`}
                        size="sm"
                        variant="subtle"
                        icon={<X className="h-3.5 w-3.5" />}
                        onClick={onClear}
                    />
                </div>
            )}

            {menuOpen && (
                <div
                    ref={menuRef}
                    role="menu"
                    aria-label="Déplacer vers"
                    onBlur={(event) => {
                        if (
                            !event.currentTarget.contains(event.relatedTarget as Node)
                        ) {
                            setMenuOpen(false);
                        }
                    }}
                    className={cn(
                        "animate-rise absolute z-30 mt-1 flex flex-col gap-0.5 rounded-card border border-line-strong",
                        "bg-surface-3 p-1 shadow-pop",
                        mirrored ? "top-8 left-1" : "top-8 right-1",
                    )}
                >
                    <span className="px-2 py-1 text-xs text-ink-subtle">
                        Déplacer vers
                    </span>
                    {ROLES.filter((other) => other !== role).map((other) => (
                        <button
                            key={other}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                onSwapRole(other);
                                setMenuOpen(false);
                            }}
                            className="flex items-center gap-2 rounded-control px-2 py-1.5 text-left text-xs text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-gold"
                        >
                            <RoleIcon role={other} size="sm" labelled={false} />
                            {roleLongLabels[other]}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
