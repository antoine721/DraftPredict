import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import { ROLES, type Role } from "@draftpredict/core";
import type { ChampionSummary } from "../../api/types";
import { cn } from "../../lib/cn";
import {
    formatCount,
    formatPercent,
    formatSignedPercent,
    roleLabels,
    roleLongLabels,
} from "../../lib/format";
import {
    deltaColor,
    winrateBarShare,
    winrateColor,
    winrateTextClass,
} from "../../lib/winrate";
import {
    Badge,
    ChampionAvatar,
    Dialog,
    RoleIcon,
    SearchInput,
    Spinner,
} from "../../ui";
import { filterChampions } from "./search";
import type { PickerTarget, Ranking } from "./types";

export type ChampionPickerProps = {
    open: boolean;
    target: PickerTarget | null;
    champions: readonly ChampionSummary[];
    /** Picked or banned champions: visible, greyed out, unpickable. */
    unavailable: ReadonlySet<string>;
    ranking: Ranking;
    /** Champions with a usable sample per role, for the role filter. */
    rolePools: Map<Role, Set<string>>;
    onPick: (championKey: string) => void;
    onClose: () => void;
};

type RoleFilter = Role | "all";

/**
 * The champion picker.
 *
 * It is the one component a player uses under a 30-second timer, so it is
 * built around the keyboard: the field has focus as soon as it opens, ↑ and ↓
 * walk the list (skipping champions that are already picked or banned), Enter
 * commits and Escape closes. The list is ordered by what the champion is worth
 * *in the slot being filled*, not alphabetically.
 */
export function ChampionPicker({
    open,
    target,
    champions,
    unavailable,
    ranking,
    rolePools,
    onPick,
    onClose,
}: ChampionPickerProps) {
    const baseId = useId();
    const [query, setQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
    const [activeIndex, setActiveIndex] = useState(0);
    const listRef = useRef<HTMLUListElement | null>(null);

    const targetRole = target?.role ?? null;
    const isBan = target?.mode === "ban";

    // A fresh picker for every slot: an old query on a new slot is a trap.
    useEffect(() => {
        if (!open) return;
        setQuery("");
        setActiveIndex(0);
        setRoleFilter(target && target.mode === "pick" ? target.role : "all");
    }, [open, target?.team, target?.role, target?.mode]);

    const results = useMemo(() => {
        const pool =
            roleFilter === "all"
                ? champions
                : champions.filter((champion) => {
                      const roles = rolePools.get(roleFilter);
                      return roles ? roles.has(champion.key) : true;
                  });
        return filterChampions(
            pool,
            query,
            (champion) => ranking.byKey.get(champion.key)?.rating ?? -1e9,
        );
    }, [champions, query, roleFilter, rolePools, ranking]);

    const pickable = useMemo(
        () => results.map((champion) => !unavailable.has(champion.key)),
        [results, unavailable],
    );

    useEffect(() => {
        const first = pickable.findIndex(Boolean);
        setActiveIndex(first === -1 ? 0 : first);
    }, [query, roleFilter, results.length]);

    useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        const node = list.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
        node?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, results.length]);

    function move(delta: number): void {
        if (results.length === 0) return;
        let next = activeIndex;
        for (let step = 0; step < results.length; step += 1) {
            next = (next + delta + results.length) % results.length;
            if (pickable[next]) break;
        }
        setActiveIndex(next);
    }

    function commit(index: number): void {
        const champion = results[index];
        if (!champion || !pickable[index]) return;
        onPick(champion.key);
    }

    function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            move(1);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            move(-1);
        } else if (event.key === "Home") {
            event.preventDefault();
            setActiveIndex(pickable.findIndex(Boolean));
        } else if (event.key === "End") {
            event.preventDefault();
            setActiveIndex(pickable.lastIndexOf(true));
        } else if (event.key === "Enter") {
            event.preventDefault();
            commit(activeIndex);
        }
    }

    const side = target?.team === "opponent" ? "équipe adverse" : "votre équipe";
    const title = isBan
        ? `Bannir un champion — ${side}`
        : `Choisir un champion — ${targetRole === null ? "" : roleLongLabels[targetRole]} (${side})`;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            size="lg"
            title={title}
            description={
                isBan
                    ? "Le ban est retiré du pool pour les deux équipes."
                    : `Classement ${ranking.contextual ? "calculé pour ce draft" : "méta, hors contexte du draft"}.`
            }
            className="max-h-[86vh]"
        >
            <div className="flex flex-col gap-3">
                <SearchInput
                    autoFocus
                    value={query}
                    onValueChange={setQuery}
                    onClear={() => setQuery("")}
                    onKeyDown={onKeyDown}
                    placeholder="Nom, surnom ou initiales (mf, asol, j4…)"
                    aria-label="Rechercher un champion"
                    aria-controls={`${baseId}-list`}
                    aria-activedescendant={
                        results.length > 0
                            ? `${baseId}-option-${activeIndex}`
                            : undefined
                    }
                />

                <div className="flex flex-wrap items-center gap-1.5">
                    <FilterChip
                        active={roleFilter === "all"}
                        onClick={() => setRoleFilter("all")}
                    >
                        Tous
                    </FilterChip>
                    {ROLES.map((role) => (
                        <FilterChip
                            key={role}
                            active={roleFilter === role}
                            onClick={() => setRoleFilter(role)}
                        >
                            <RoleIcon role={role} size="sm" labelled={false} />
                            {roleLabels[role]}
                        </FilterChip>
                    ))}
                    {ranking.isLoading && <Spinner size="xs" className="ml-1" />}
                </div>

                <div
                    aria-hidden
                    className="flex items-center gap-3 border-b border-line px-2 pb-1 text-xs text-ink-subtle"
                >
                    <span className="flex-1">Champion</span>
                    <span className="w-24 text-right">
                        {ranking.contextual ? "Victoire si pick" : "Victoire du rôle"}
                    </span>
                    {ranking.contextual && (
                        <span className="w-14 text-right">Gain</span>
                    )}
                </div>

                <ul
                    id={`${baseId}-list`}
                    ref={listRef}
                    role="listbox"
                    aria-label="Champions"
                    className="scrollbar-slim -mx-1 flex max-h-[52vh] flex-col gap-0.5 overflow-y-auto px-1"
                >
                    {results.map((champion, index) => {
                        const info = ranking.byKey.get(champion.key);
                        const available = pickable[index];
                        const active = index === activeIndex;
                        return (
                            <li
                                key={champion.key}
                                id={`${baseId}-option-${index}`}
                                data-index={index}
                                role="option"
                                aria-selected={active}
                                aria-disabled={!available}
                                onClick={() => commit(index)}
                                onMouseMove={() => available && setActiveIndex(index)}
                                className={cn(
                                    "flex items-center gap-3 rounded-card border border-transparent px-2 py-1.5",
                                    available
                                        ? "cursor-pointer"
                                        : "cursor-not-allowed opacity-45",
                                    active &&
                                        available &&
                                        "border-gold/60 bg-surface-3",
                                )}
                            >
                                <ChampionAvatar
                                    champion={champion}
                                    size="sm"
                                    dimmed={!available}
                                />
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="truncate text-sm font-medium text-ink-strong">
                                        {champion.name}
                                    </span>
                                    <span className="truncate text-[11px] text-ink-subtle">
                                        {available
                                            ? champion.title
                                            : "Déjà pris ou banni"}
                                    </span>
                                </span>

                                {info ? (
                                    <span className="flex items-center gap-3">
                                        <span
                                            aria-hidden
                                            className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-surface-3 sm:block"
                                        >
                                            <span
                                                className="block h-full rounded-full"
                                                style={{
                                                    width: `${winrateBarShare(info.winrate) * 100}%`,
                                                    backgroundColor: winrateColor(
                                                        info.winrate,
                                                    ),
                                                }}
                                            />
                                        </span>
                                        <span className="flex w-24 flex-col text-right">
                                            <span
                                                className={cn(
                                                    "tabular text-sm font-semibold",
                                                    winrateTextClass(info.winrate),
                                                )}
                                            >
                                                {formatPercent(info.winrate)}
                                            </span>
                                            <span className="tabular text-[11px] text-ink-subtle">
                                                {formatCount(info.games)} parties
                                            </span>
                                        </span>
                                        {ranking.contextual && (
                                            <span
                                                className="tabular w-14 text-right text-xs font-semibold"
                                                style={{
                                                    color: deltaColor(info.delta),
                                                }}
                                            >
                                                {formatSignedPercent(info.delta)}
                                            </span>
                                        )}
                                    </span>
                                ) : (
                                    <span className="text-[11px] text-ink-subtle">
                                        échantillon insuffisant
                                    </span>
                                )}
                            </li>
                        );
                    })}
                    {results.length === 0 && (
                        <li className="px-2 py-8 text-center text-sm text-ink-muted">
                            Aucun champion ne correspond à « {query} ».
                        </li>
                    )}
                </ul>

                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-[11px] text-ink-subtle">
                    <span className="flex items-center gap-1">
                        <Info className="h-3 w-3" aria-hidden />
                        {results.length} champions
                        {roleFilter === "all"
                            ? ""
                            : ` avec des données en ${roleLabels[roleFilter]}`}
                    </span>
                    <span>↑ ↓ naviguer</span>
                    <span>Entrée choisir</span>
                    <span>Échap fermer</span>
                    {!ranking.contextual && !isBan && (
                        <Badge tone="neutral">Classement méta</Badge>
                    )}
                </p>
            </div>
        </Dialog>
    );
}

function FilterChip({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-control border px-2 py-1 text-xs font-medium transition-colors",
                active
                    ? "border-gold/60 bg-gold/12 text-gold"
                    : "border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
            )}
        >
            {children}
        </button>
    );
}
