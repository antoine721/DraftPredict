import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LayoutGrid, List, Star } from "lucide-react";
import type { Role } from "@draftpredict/core";
import type { ChampionSummary } from "../../api";
import { cn } from "../../lib/cn";
import { formatCount, formatPercent, matchesSearch, roleLabels } from "../../lib";
import { usePreferencesStore } from "../../state";
import {
    Badge,
    ChampionAvatar,
    EmptyState,
    IconButton,
    Panel,
    RoleIcon,
    SearchInput,
    Select,
    SkeletonList,
    Tooltip,
} from "../../ui";
import { useFocusSearchTarget } from "../../app/shortcuts";
import { championPath } from "../../app/routes";
import { ChampionCard } from "./ChampionCard";
import { WinrateValue } from "./Metrics";
import { TierBadge } from "./TierBadge";
import {
    BANRATE_EXPLANATION,
    DAMAGE_SHORT_LABEL,
    PICKRATE_EXPLANATION,
    tagLabel,
} from "./labels";
import {
    ROLE_VALUES,
    damageKind,
    type ChampionRoleRow,
    type DamageKind,
    type TierEstimate,
} from "./stats";
import type { ChampionStats } from "./hooks";

/**
 * The champion catalogue.
 *
 * A data screen: 173 champions, filtered by role, class and damage type,
 * sorted by whatever column the user cares about, in a dense table or a grid
 * of tiles depending on the stored preference. Every number is per role,
 * because a champion's winrate as a whole is meaningless.
 */

type SortKey = "meta" | "winrate" | "pickrate" | "games" | "name";
type RoleFilter = "all" | `${Role}`;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: "meta", label: "Tri : méta (tier)" },
    { value: "winrate", label: "Tri : winrate" },
    { value: "pickrate", label: "Tri : sélection" },
    { value: "games", label: "Tri : parties" },
    { value: "name", label: "Tri : nom" },
];

const DAMAGE_OPTIONS: { value: DamageKind | "all"; label: string }[] = [
    { value: "all", label: "Tous dégâts" },
    { value: "physical", label: "Dégâts physiques" },
    { value: "magic", label: "Dégâts magiques" },
    { value: "mixed", label: "Dégâts mixtes" },
];

export type IndexRow = {
    champion: ChampionSummary;
    row: ChampionRoleRow | null;
    others: ChampionRoleRow[];
    tier: TierEstimate | null;
    favourite: boolean;
};

/** Pure enough to test: filters, then sorts, then pins favourites on top. */
export function orderIndexRows(
    rows: readonly IndexRow[],
    sort: SortKey,
    ascending: boolean,
): IndexRow[] {
    const direction = ascending ? 1 : -1;
    const score = (entry: IndexRow): number => {
        if (!entry.row) return Number.NEGATIVE_INFINITY;
        switch (sort) {
            case "winrate":
                return entry.row.adjustedWinrate;
            case "pickrate":
                return entry.row.pickrate;
            case "games":
                return entry.row.games;
            case "meta":
                return entry.tier?.score ?? Number.NEGATIVE_INFINITY;
            default:
                return 0;
        }
    };

    return [...rows].sort((a, b) => {
        if (a.favourite !== b.favourite) return a.favourite ? -1 : 1;
        if (sort === "name") {
            return a.champion.name.localeCompare(b.champion.name, "fr") * direction;
        }
        const delta = (score(a) - score(b)) * direction;
        if (delta !== 0) return delta;
        return a.champion.name.localeCompare(b.champion.name, "fr");
    });
}

export function ChampionIndex({
    champions,
    stats,
    isLoading,
}: {
    champions: readonly ChampionSummary[];
    stats: ChampionStats;
    isLoading: boolean;
}) {
    const [search, setSearch] = useState("");
    const [role, setRole] = useState<RoleFilter>("all");
    const [tag, setTag] = useState("all");
    const [damage, setDamage] = useState<DamageKind | "all">("all");
    const [sort, setSort] = useState<SortKey>("meta");
    const [ascending, setAscending] = useState(false);

    const layout = usePreferencesStore((state) => state.championLayout);
    const setLayout = usePreferencesStore((state) => state.setChampionLayout);
    const favourites = usePreferencesStore((state) => state.favouriteChampions);
    const toggleFavourite = usePreferencesStore((state) => state.toggleFavourite);

    // Clicking a column header sorts by it, and clicking it again flips the
    // direction — names start ascending, numbers start with the best first.
    const sortBy = (key: SortKey) => {
        if (key === sort) {
            setAscending((value) => !value);
            return;
        }
        setSort(key);
        setAscending(key === "name");
    };

    const searchRef = useRef<HTMLInputElement | null>(null);
    useFocusSearchTarget(searchRef);

    const tags = useMemo(() => {
        const found = new Set<string>();
        for (const champion of champions)
            for (const value of champion.tags) found.add(value);
        return [...found].sort((a, b) => tagLabel(a).localeCompare(tagLabel(b), "fr"));
    }, [champions]);

    const { rows, hiddenForRole } = useMemo(() => {
        const selectedRole = role === "all" ? null : (Number(role) as Role);
        const favouriteSet = new Set(favourites);
        const collected: IndexRow[] = [];
        let hidden = 0;

        for (const champion of champions) {
            if (
                search &&
                !matchesSearch(
                    `${champion.name} ${champion.id} ${champion.title}`,
                    search,
                )
            ) {
                continue;
            }
            if (tag !== "all" && !champion.tags.includes(tag)) continue;

            const championRows = stats.rowsFor(champion.key);
            const row =
                selectedRole === null
                    ? (championRows[0] ?? null)
                    : (championRows.find(
                          (candidate) => candidate.role === selectedRole,
                      ) ?? null);

            if (selectedRole !== null && !row) {
                hidden += 1;
                continue;
            }
            if (damage !== "all" && (!row || damageKind(row.damage) !== damage))
                continue;

            collected.push({
                champion,
                row,
                others: championRows
                    .filter((candidate) => candidate.role !== row?.role)
                    .slice(0, 2),
                tier: row
                    ? (stats.tiers.get(`${champion.key}:${row.role}`) ?? null)
                    : null,
                favourite: favouriteSet.has(champion.key),
            });
        }

        return {
            rows: orderIndexRows(collected, sort, ascending),
            hiddenForRole: hidden,
        };
    }, [champions, search, tag, damage, role, sort, ascending, favourites, stats]);

    const roleFilters: { value: RoleFilter; label: string }[] = [
        { value: "all", label: "Tous" },
        ...ROLE_VALUES.map((value) => ({
            value: String(value) as RoleFilter,
            label: roleLabels[value],
        })),
    ];

    return (
        <Panel
            flush
            title={`Champions (${rows.length})`}
            subtitle={
                role === "all"
                    ? "Statistiques du rôle le plus joué de chaque champion"
                    : `Statistiques ${roleLabels[Number(role) as Role]} — ${hiddenForRole} champions sans données dans ce rôle sont masqués`
            }
            actions={
                <div className="flex items-center gap-1">
                    <IconButton
                        label="Affichage en grille"
                        variant={layout === "grid" ? "secondary" : "ghost"}
                        size="sm"
                        aria-pressed={layout === "grid"}
                        icon={<LayoutGrid className="h-4 w-4" />}
                        onClick={() => setLayout("grid")}
                    />
                    <IconButton
                        label="Affichage en liste"
                        variant={layout === "list" ? "secondary" : "ghost"}
                        size="sm"
                        aria-pressed={layout === "list"}
                        icon={<List className="h-4 w-4" />}
                        onClick={() => setLayout("list")}
                    />
                </div>
            }
        >
            <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-56 flex-1">
                        <SearchInput
                            ref={searchRef}
                            value={search}
                            onValueChange={setSearch}
                            onClear={() => setSearch("")}
                            aria-label="Rechercher un champion"
                            size="sm"
                        />
                    </div>
                    <Select
                        size="sm"
                        aria-label="Filtrer par classe"
                        containerClassName="w-auto"
                        value={tag}
                        onValueChange={setTag}
                        options={[
                            { value: "all", label: "Toutes classes" },
                            ...tags.map((value) => ({ value, label: tagLabel(value) })),
                        ]}
                    />
                    <Select
                        size="sm"
                        aria-label="Filtrer par type de dégâts"
                        containerClassName="w-auto"
                        value={damage}
                        onValueChange={(value) => setDamage(value)}
                        options={DAMAGE_OPTIONS}
                    />
                    <Select
                        size="sm"
                        aria-label="Trier les champions"
                        containerClassName="w-auto"
                        value={sort}
                        onValueChange={(value) => setSort(value)}
                        options={SORT_OPTIONS}
                    />
                    <IconButton
                        label={ascending ? "Ordre croissant" : "Ordre décroissant"}
                        variant="ghost"
                        size="sm"
                        icon={<span aria-hidden>{ascending ? "↑" : "↓"}</span>}
                        onClick={() => setAscending((value) => !value)}
                    />
                </div>

                <div
                    role="group"
                    aria-label="Filtrer par rôle"
                    className="flex flex-wrap gap-1.5"
                >
                    {roleFilters.map((filter) => {
                        const active = filter.value === role;
                        return (
                            <button
                                key={filter.value}
                                type="button"
                                onClick={() => setRole(filter.value)}
                                aria-pressed={active}
                                className={cn(
                                    "inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-xs font-medium transition-colors",
                                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                                    active
                                        ? "border-gold/50 bg-gold/12 text-gold"
                                        : "border-line bg-surface-2 text-ink-muted hover:text-ink",
                                )}
                            >
                                {filter.value !== "all" && (
                                    <RoleIcon
                                        role={Number(filter.value) as Role}
                                        size="xs"
                                    />
                                )}
                                {filter.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {isLoading ? (
                <div className="p-4">
                    <SkeletonList rows={8} />
                </div>
            ) : rows.length === 0 ? (
                <EmptyState
                    title="Aucun champion ne correspond"
                    description="Élargissez la recherche ou retirez un filtre."
                />
            ) : layout === "grid" ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2 p-3">
                    {rows.map((entry) => (
                        <ChampionCard
                            key={entry.champion.key}
                            champion={entry.champion}
                            row={entry.row}
                            tier={entry.tier}
                            otherRoles={entry.others}
                            favourite={entry.favourite}
                            onToggleFavourite={toggleFavourite}
                        />
                    ))}
                </div>
            ) : (
                <ChampionTable
                    rows={rows}
                    sort={sort}
                    ascending={ascending}
                    onSort={sortBy}
                    onToggleFavourite={toggleFavourite}
                />
            )}
        </Panel>
    );
}

/** The dense table layout. Exported so it can be rendered on its own. */
export function ChampionTable({
    rows,
    sort = "meta",
    ascending = false,
    onSort,
    onToggleFavourite,
}: {
    rows: readonly IndexRow[];
    sort?: SortKey;
    ascending?: boolean;
    /** Omit to render static headers. */
    onSort?: (key: SortKey) => void;
    onToggleFavourite: (championKey: string) => void;
}) {
    const heading = (
        key: SortKey,
        label: ReactNode,
        align: "left" | "right" | "center",
    ) => {
        const active = sort === key;
        return (
            <th
                scope="col"
                aria-sort={active ? (ascending ? "ascending" : "descending") : "none"}
                className={cn(
                    "py-2 font-medium",
                    align === "right" && "text-right",
                    align === "center" && "text-center",
                )}
            >
                {onSort ? (
                    <button
                        type="button"
                        onClick={() => onSort(key)}
                        className={cn(
                            "inline-flex items-center gap-1 rounded-control transition-colors",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                            active ? "text-gold" : "hover:text-ink",
                        )}
                    >
                        {label}
                        <span aria-hidden className={active ? "" : "opacity-0"}>
                            {ascending ? "↑" : "↓"}
                        </span>
                    </button>
                ) : (
                    label
                )}
            </th>
        );
    };

    return (
        <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-surface-1/95 backdrop-blur">
                    <tr className="text-left text-xs text-ink-subtle">
                        <th scope="col" className="w-8 py-2 pl-3" />
                        {heading("name", "Champion", "left")}
                        <th scope="col" className="py-2 font-medium">
                            Rôle
                        </th>
                        {heading("meta", "Tier", "center")}
                        {heading("winrate", "Winrate", "right")}
                        {heading(
                            "pickrate",
                            <Tooltip content={PICKRATE_EXPLANATION}>
                                <span>Sélection</span>
                            </Tooltip>,
                            "right",
                        )}
                        <th scope="col" className="py-2 text-right font-medium">
                            <Tooltip wide content={BANRATE_EXPLANATION}>
                                <span>Bans</span>
                            </Tooltip>
                        </th>
                        {heading("games", "Parties", "right")}
                        <th scope="col" className="py-2 pr-3 text-right font-medium">
                            Dégâts
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((entry) => {
                        const kind = entry.row ? damageKind(entry.row.damage) : null;
                        return (
                            <tr
                                key={entry.champion.key}
                                className="border-t border-line-soft transition-colors hover:bg-surface-2"
                            >
                                <td className="py-1.5 pl-3">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onToggleFavourite(entry.champion.key)
                                        }
                                        aria-pressed={entry.favourite}
                                        aria-label={
                                            entry.favourite
                                                ? `Retirer ${entry.champion.name} des favoris`
                                                : `Ajouter ${entry.champion.name} aux favoris`
                                        }
                                        className={cn(
                                            "rounded-full p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                                            entry.favourite
                                                ? "text-gold"
                                                : "text-ink-subtle hover:text-ink",
                                        )}
                                    >
                                        <Star
                                            className="h-3.5 w-3.5"
                                            fill={
                                                entry.favourite
                                                    ? "currentColor"
                                                    : "none"
                                            }
                                        />
                                    </button>
                                </td>
                                <td className="py-1.5">
                                    <Link
                                        to={championPath(
                                            entry.champion.key,
                                            entry.row?.role ?? null,
                                        )}
                                        className="flex min-w-0 items-center gap-2 rounded-control outline-none hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                                    >
                                        <ChampionAvatar
                                            champion={entry.champion}
                                            size="sm"
                                        />
                                        <span className="min-w-0">
                                            <span className="block truncate font-medium text-ink-strong">
                                                {entry.champion.name}
                                            </span>
                                            <span className="block truncate text-[11px] text-ink-subtle">
                                                {entry.champion.tags
                                                    .map(tagLabel)
                                                    .join(" · ")}
                                            </span>
                                        </span>
                                    </Link>
                                </td>
                                <td className="py-1.5">
                                    {entry.row ? (
                                        <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                                            <RoleIcon role={entry.row.role} size="sm" />
                                            {roleLabels[entry.row.role]}
                                        </span>
                                    ) : (
                                        <span className="text-xs text-ink-subtle">
                                            —
                                        </span>
                                    )}
                                </td>
                                <td className="py-1.5 text-center">
                                    <TierBadge estimate={entry.tier} />
                                </td>
                                <td className="py-1.5 text-right">
                                    {entry.row ? (
                                        <WinrateValue
                                            winrate={entry.row.winrate}
                                            games={entry.row.games}
                                        />
                                    ) : (
                                        "—"
                                    )}
                                </td>
                                <td className="tabular py-1.5 text-right text-xs text-ink-muted">
                                    {entry.row
                                        ? formatPercent(entry.row.pickrate, 1)
                                        : "—"}
                                </td>
                                <td className="tabular py-1.5 text-right text-xs text-ink-subtle">
                                    n/d
                                </td>
                                <td className="tabular py-1.5 text-right text-xs text-ink-muted">
                                    {entry.row ? formatCount(entry.row.games) : "—"}
                                </td>
                                <td className="py-1.5 pr-3 text-right">
                                    {kind ? (
                                        <Badge tone="neutral">
                                            {DAMAGE_SHORT_LABEL[kind]}
                                        </Badge>
                                    ) : (
                                        <span className="text-xs text-ink-subtle">
                                            —
                                        </span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
