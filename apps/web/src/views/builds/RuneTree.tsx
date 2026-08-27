import { useMemo, useState } from "react";
import { Copy, RotateCcw } from "lucide-react";
import type { BuildEntry, BuildsPayload, StaticRunesResponse } from "../../api";
import { cn } from "../../lib/cn";
import { formatCount, formatPercent, formatSignedPercent } from "../../lib";
import { deltaColor } from "../../lib/winrate";
import { Button, EmptyState, Panel, RuneIcon, Tooltip } from "../../ui";
import { DeltaValue, SampleSize, WinrateValue } from "./Metrics";
import {
    findEntry,
    matchupDelta,
    matchupEntry,
    recommendedSecondary,
    runeBranch,
    runeSlotIndex,
    sumDelta,
    type RuneRow,
} from "./build-helpers";

/**
 * The rune page, laid out like the in-game tree.
 *
 * The route only rates the runes of the path it recommends, so the primary
 * branch is the one path the data covers; every option of every row still
 * carries its own winrate, and the user can build a second page side by side
 * to see what a swap is worth.
 */

const SHARD_ROWS = [
    { key: "offense", label: "Offensif" },
    { key: "flex", label: "Polyvalent" },
    { key: "defense", label: "Défensif" },
] as const;

const PRIMARY_ROW_LABELS = ["Rune clé", "1re rune", "2e rune", "3e rune"];
const SECONDARY_ROW_LABELS: Record<number, string> = {
    1: "1re rune",
    2: "2e rune",
    3: "3e rune",
};

type Selection = {
    primary: Record<number, number | string>;
    secondary: (number | string)[];
    shards: (number | string | null)[];
};

type SetupId = "a" | "b";

function selectionEntries(
    selection: Selection,
    primaryRows: readonly RuneRow[],
    secondaryRows: readonly RuneRow[],
    shardRows: readonly BuildEntry[][],
): (BuildEntry | null)[] {
    const primary = primaryRows.map((row) =>
        findEntry([row], selection.primary[row.slot]),
    );
    const secondary = selection.secondary.map((id) => findEntry(secondaryRows, id));
    const shards = selection.shards.map((id, index) =>
        id === null
            ? null
            : (shardRows[index]?.find((entry) => String(entry.id) === String(id)) ??
              null),
    );
    return [...primary, ...secondary, ...shards];
}

export function RuneTree({
    runes,
    staticRunes,
    enemyKey,
    enemyName,
}: {
    runes: BuildsPayload["runes"];
    staticRunes: StaticRunesResponse | undefined;
    enemyKey: string | null;
    enemyName: string | null;
}) {
    const slots = useMemo(() => runeSlotIndex(staticRunes), [staticRunes]);
    const primary = useMemo(
        () => runeBranch(runes.primary, slots, staticRunes),
        [runes.primary, slots, staticRunes],
    );
    const secondary = useMemo(
        () => runeBranch(runes.secondary, slots, staticRunes),
        [runes.secondary, slots, staticRunes],
    );

    const shardRows = useMemo(
        () => SHARD_ROWS.map((row) => runes.shards?.[row.key] ?? []),
        [runes.shards],
    );

    const recommended = useMemo<Selection>(() => {
        const primarySelection: Record<number, number | string> = {};
        for (const row of primary.rows) {
            const best = row.entries[0];
            if (best) primarySelection[row.slot] = best.id;
        }
        return {
            primary: primarySelection,
            secondary: recommendedSecondary(secondary.rows),
            shards: shardRows.map((row) => row[0]?.id ?? null),
        };
    }, [primary.rows, secondary.rows, shardRows]);

    const [setups, setSetups] = useState<Record<SetupId, Selection> | null>(null);
    const [active, setActive] = useState<SetupId>("a");
    const [comparing, setComparing] = useState(false);

    const current: Record<SetupId, Selection> = setups ?? {
        a: recommended,
        b: recommended,
    };

    const update = (id: SetupId, next: Selection) => {
        setSetups({ ...current, [id]: next });
    };

    if (
        primary.rows.length === 0 &&
        secondary.rows.length === 0 &&
        primary.orphans.length === 0
    ) {
        return (
            <Panel title="Runes">
                <EmptyState
                    title="Aucune donnée de runes"
                    description="Le jeu de données chargé ne contient pas d'échantillon de runes pour ce champion dans ce rôle."
                />
            </Panel>
        );
    }

    const editable = comparing ? active : "a";

    const pick = (row: RuneRow, entry: BuildEntry, branch: "primary" | "secondary") => {
        const selection = current[editable];
        if (branch === "primary") {
            update(editable, {
                ...selection,
                primary: { ...selection.primary, [row.slot]: entry.id },
            });
            return;
        }
        // A secondary branch gives exactly two runes, one per row at most.
        const rowIds = new Set(row.entries.map((option) => String(option.id)));
        const kept = selection.secondary.filter((id) => !rowIds.has(String(id)));
        const next = [...kept, entry.id].slice(-2);
        update(editable, { ...selection, secondary: next });
    };

    const pickShard = (index: number, entry: BuildEntry) => {
        const selection = current[editable];
        const shards = [...selection.shards];
        shards[index] = entry.id;
        update(editable, { ...selection, shards });
    };

    const totals = {
        a: sumDelta(
            selectionEntries(current.a, primary.rows, secondary.rows, shardRows),
        ),
        b: sumDelta(
            selectionEntries(current.b, primary.rows, secondary.rows, shardRows),
        ),
    };

    return (
        <div className="flex flex-col gap-4">
            <Panel
                title="Runes"
                subtitle={
                    primary.path
                        ? `Voie principale recommandée : ${primary.path.name}${
                              secondary.path
                                  ? ` — secondaire : ${secondary.path.name}`
                                  : ""
                          }`
                        : "Voie principale recommandée"
                }
                actions={
                    <div className="flex items-center gap-2">
                        {comparing && (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    icon={<Copy className="h-3.5 w-3.5" />}
                                    onClick={() => update("b", current.a)}
                                >
                                    Copier A → B
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                                    onClick={() => setSetups(null)}
                                >
                                    Réinitialiser
                                </Button>
                            </>
                        )}
                        <Button
                            variant={comparing ? "secondary" : "ghost"}
                            size="sm"
                            aria-pressed={comparing}
                            onClick={() => setComparing((value) => !value)}
                        >
                            {comparing
                                ? "Fermer la comparaison"
                                : "Comparer deux pages"}
                        </Button>
                    </div>
                }
            >
                {comparing && (
                    <div className="mb-4 flex flex-col gap-2 rounded-card border border-line-soft bg-surface-2/60 p-3">
                        <div
                            role="group"
                            aria-label="Page de runes modifiée"
                            className="flex flex-wrap items-center gap-2"
                        >
                            {(["a", "b"] as SetupId[]).map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setActive(id)}
                                    aria-pressed={active === id}
                                    className={cn(
                                        "flex items-baseline gap-2 rounded-control border px-3 py-1.5 text-xs font-medium transition-colors",
                                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                                        active === id
                                            ? "border-gold/50 bg-gold/12 text-gold"
                                            : "border-line bg-surface-2 text-ink-muted hover:text-ink",
                                    )}
                                >
                                    Page {id.toUpperCase()}
                                    <span
                                        className="tabular font-semibold"
                                        style={{ color: deltaColor(totals[id]) }}
                                    >
                                        {formatSignedPercent(totals[id])}
                                    </span>
                                </button>
                            ))}
                            <span className="tabular text-xs text-ink-muted">
                                Écart A → B :{" "}
                                <span
                                    className="font-semibold"
                                    style={{ color: deltaColor(totals.b - totals.a) }}
                                >
                                    {formatSignedPercent(totals.b - totals.a)}
                                </span>
                            </span>
                        </div>
                        <p className="text-[11px] text-ink-subtle">
                            Somme des apports mesurés rune par rune : un ordre de
                            grandeur pour comparer deux pages, pas le taux de victoire
                            de la page entière — les runes ne se cumulent pas
                            linéairement.
                        </p>
                    </div>
                )}

                <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                    <Branch
                        title="Voie principale"
                        pathName={primary.path?.name ?? null}
                        pathIcon={primary.path?.icon ?? null}
                        rows={primary.rows}
                        rowLabel={(slot) =>
                            PRIMARY_ROW_LABELS[slot] ?? `Rangée ${slot + 1}`
                        }
                        keystoneRow={0}
                        isSelected={(entry, row) =>
                            String(current[editable].primary[row.slot] ?? "") ===
                            String(entry.id)
                        }
                        isOther={(entry, row) =>
                            comparing &&
                            String(
                                current[editable === "a" ? "b" : "a"].primary[
                                    row.slot
                                ] ?? "",
                            ) === String(entry.id)
                        }
                        onPick={(row, entry) => pick(row, entry, "primary")}
                        enemyKey={enemyKey}
                        enemyName={enemyName}
                    />

                    <div className="flex flex-col gap-4">
                        <Branch
                            title="Voie secondaire"
                            pathName={secondary.path?.name ?? null}
                            pathIcon={secondary.path?.icon ?? null}
                            rows={secondary.rows}
                            rowLabel={(slot) =>
                                SECONDARY_ROW_LABELS[slot] ?? `Rangée ${slot}`
                            }
                            isSelected={(entry) =>
                                current[editable].secondary.some(
                                    (id) => String(id) === String(entry.id),
                                )
                            }
                            isOther={(entry) =>
                                comparing &&
                                current[editable === "a" ? "b" : "a"].secondary.some(
                                    (id) => String(id) === String(entry.id),
                                )
                            }
                            onPick={(row, entry) => pick(row, entry, "secondary")}
                            enemyKey={enemyKey}
                            enemyName={enemyName}
                            footer="Deux runes au maximum, jamais deux dans la même rangée."
                        />

                        <div className="flex flex-col gap-2">
                            <h3 className="text-xs font-medium text-ink-subtle">
                                Fragments de statistiques
                            </h3>
                            {SHARD_ROWS.map((row, index) => (
                                <div key={row.key} className="flex flex-col gap-1">
                                    <span className="text-xs text-ink-subtle">
                                        {row.label}
                                    </span>
                                    {shardRows[index].length === 0 ? (
                                        <p className="text-xs text-ink-subtle">
                                            Aucune donnée pour cette rangée.
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-3 gap-1.5">
                                            {shardRows[index].map((entry) => (
                                                <RuneOption
                                                    key={String(entry.id)}
                                                    entry={entry}
                                                    selected={
                                                        String(
                                                            current[editable].shards[
                                                                index
                                                            ] ?? "",
                                                        ) === String(entry.id)
                                                    }
                                                    otherSetup={
                                                        comparing &&
                                                        String(
                                                            current[
                                                                editable === "a"
                                                                    ? "b"
                                                                    : "a"
                                                            ].shards[index] ?? "",
                                                        ) === String(entry.id)
                                                    }
                                                    recommended={
                                                        String(
                                                            shardRows[index][0]?.id,
                                                        ) === String(entry.id)
                                                    }
                                                    onPick={() =>
                                                        pickShard(index, entry)
                                                    }
                                                    enemyKey={enemyKey}
                                                    enemyName={enemyName}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {(primary.orphans.length > 0 || secondary.orphans.length > 0) && (
                    <p className="mt-3 text-xs text-ink-subtle">
                        {primary.orphans.length + secondary.orphans.length} rune(s)
                        notée(s) par le serveur sont absentes du catalogue statique et
                        ne peuvent pas être placées dans l'arbre.
                    </p>
                )}
            </Panel>
        </div>
    );
}

function Branch({
    title,
    pathName,
    pathIcon,
    rows,
    rowLabel,
    keystoneRow,
    isSelected,
    isOther,
    onPick,
    enemyKey,
    enemyName,
    footer,
}: {
    title: string;
    pathName: string | null;
    pathIcon: string | null;
    rows: readonly RuneRow[];
    rowLabel: (slot: number) => string;
    keystoneRow?: number;
    isSelected: (entry: BuildEntry, row: RuneRow) => boolean;
    isOther: (entry: BuildEntry, row: RuneRow) => boolean;
    onPick: (row: RuneRow, entry: BuildEntry) => void;
    enemyKey: string | null;
    enemyName: string | null;
    footer?: string;
}) {
    return (
        <section className="flex min-w-0 flex-col gap-3 rounded-card border border-line-soft bg-surface-2/40 p-3">
            <header className="flex items-center gap-2">
                {pathIcon && (
                    <RuneIcon src={pathIcon} name={pathName} size="sm" keystone />
                )}
                <div className="min-w-0">
                    <h3 className="text-xs font-semibold text-ink-strong">{title}</h3>
                    <p className="truncate text-[11px] text-ink-muted">
                        {pathName ?? "Voie inconnue"}
                    </p>
                </div>
            </header>

            {rows.length === 0 ? (
                <p className="text-xs text-ink-subtle">
                    Aucune rune notée pour cette voie.
                </p>
            ) : (
                rows.map((row) => (
                    <div key={row.slot} className="flex flex-col gap-1">
                        <span className="text-xs text-ink-subtle">
                            {rowLabel(row.slot)}
                        </span>
                        <div
                            className={cn(
                                "grid gap-1.5",
                                row.entries.length > 3
                                    ? "grid-cols-2 sm:grid-cols-4"
                                    : "grid-cols-3",
                            )}
                        >
                            {row.entries.map((entry, index) => (
                                <RuneOption
                                    key={String(entry.id)}
                                    entry={entry}
                                    keystone={row.slot === keystoneRow}
                                    selected={isSelected(entry, row)}
                                    otherSetup={isOther(entry, row)}
                                    recommended={index === 0}
                                    onPick={() => onPick(row, entry)}
                                    enemyKey={enemyKey}
                                    enemyName={enemyName}
                                />
                            ))}
                        </div>
                    </div>
                ))
            )}
            {footer && <p className="text-[11px] text-ink-subtle">{footer}</p>}
        </section>
    );
}

function RuneOption({
    entry,
    keystone = false,
    selected,
    otherSetup,
    recommended,
    onPick,
    enemyKey,
    enemyName,
}: {
    entry: BuildEntry;
    keystone?: boolean;
    selected: boolean;
    otherSetup: boolean;
    recommended: boolean;
    onPick: () => void;
    enemyKey: string | null;
    enemyName: string | null;
}) {
    const match = matchupEntry(entry, enemyKey);
    const matchDelta = matchupDelta(match);
    const label = entry.name ?? `#${entry.id}`;

    return (
        <Tooltip
            wide
            wrapperClassName="block"
            content={
                <span>
                    <span className="font-semibold">{label}</span>
                    <br />
                    Winrate {formatPercent(entry.winrate)} sur{" "}
                    {formatCount(entry.games)} parties.
                    <br />
                    Apport : {formatSignedPercent(entry.winrateDelta)}
                    {recommended ? " — meilleur choix de la rangée." : "."}
                    {match ? (
                        <>
                            <br />
                            Contre {enemyName ?? match.name ?? "l'adversaire"} :{" "}
                            {formatSignedPercent(matchDelta ?? 0)} sur{" "}
                            {Math.round(match.games)} parties.
                        </>
                    ) : null}
                </span>
            }
        >
            <button
                type="button"
                onClick={onPick}
                aria-pressed={selected}
                className={cn(
                    "flex w-full min-w-0 flex-col items-center gap-1 rounded-card border px-1.5 py-2 text-center transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                    selected
                        ? "border-gold/60 bg-gold/12"
                        : "border-line-soft bg-surface-2 hover:bg-surface-3",
                    otherSetup && !selected && "border-info/50 bg-info/8",
                )}
            >
                <RuneIcon
                    src={entry.icon}
                    name={label}
                    size={keystone ? "md" : "sm"}
                    keystone={keystone}
                    className={selected ? undefined : "opacity-80"}
                />
                <span className="w-full truncate text-[11px] leading-tight text-ink">
                    {label}
                </span>
                <span className="flex items-baseline gap-1.5">
                    <WinrateValue
                        winrate={entry.winrate}
                        games={entry.games}
                        className="text-[11px]"
                    />
                    <DeltaValue
                        delta={entry.winrateDelta}
                        games={entry.games}
                        className="text-[11px]"
                    />
                </span>
                <SampleSize games={entry.games} wins={entry.wins} showDot={false} />
                {recommended && (
                    <span className="rounded-full bg-gold/15 px-1.5 text-[9px] font-semibold text-gold">
                        Recommandé
                    </span>
                )}
            </button>
        </Tooltip>
    );
}
