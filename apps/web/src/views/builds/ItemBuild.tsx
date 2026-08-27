import { useState } from "react";
import { ChevronRight, Coins, Info } from "lucide-react";
import type { BuildEntry, BuildsPayload, ItemDetail } from "../../api";
import { cn } from "../../lib/cn";
import { formatNumber, formatPercent } from "../../lib";
import { EmptyState, ItemIcon, Panel, Tooltip } from "../../ui";
import { EntryRow, EntryRowHeader } from "./EntryRow";
import { DeltaValue, SampleSize, WinrateValue } from "./Metrics";
import {
    buildGold,
    entryKey,
    entryLabel,
    fullBuild,
    situationalItems,
} from "./build-helpers";

/**
 * Items: what to start with, what boots, in which order, and what to buy when
 * the game goes differently.
 *
 * The complete build is a *recommendation assembled here* whenever the dataset
 * ships no observed full sets — which is the case offline — and it says so
 * rather than pretending a 5-item build was measured as a whole.
 */

const ORDER_LABELS = ["1er objet", "2e objet", "3e objet", "4e objet", "5e objet"];

function ItemEntryIcon({
    entry,
    size = "md",
}: {
    entry: BuildEntry;
    size?: "sm" | "md";
}) {
    const components = entry.components ?? [];
    if (components.length > 1) {
        return (
            <span className="flex shrink-0 items-center gap-1">
                {components.slice(0, 3).map((component, index) => (
                    <ItemIcon
                        key={`${component.id}-${index}`}
                        id={component.id}
                        name={component.name}
                        src={component.icon}
                        size="xs"
                    />
                ))}
            </span>
        );
    }
    return <ItemIcon id={entry.id} name={entry.name} src={entry.icon} size={size} />;
}

export function ItemBuild({
    items,
    itemsById,
    enemyKey,
    enemyName,
}: {
    items: BuildsPayload["items"];
    itemsById: Map<number, ItemDetail>;
    enemyKey: string | null;
    enemyName: string | null;
}) {
    const [step, setStep] = useState(0);
    const build = fullBuild(items);
    const byOrder = items.byOrder ?? [];
    const situational = situationalItems(
        byOrder,
        [
            ...build.path.map((entry) => entry.id),
            ...(build.boots ? [build.boots.id] : []),
        ],
        1,
    ).slice(0, 8);

    const goldParts: BuildEntry[] = [
        ...(build.starter ? [build.starter] : []),
        ...(build.boots ? [build.boots] : []),
        ...build.path,
    ];
    const gold = buildGold(goldParts, itemsById);

    const hasAnything =
        byOrder.length > 0 || items.boots.length > 0 || items.startingSets.length > 0;

    if (!hasAnything) {
        return (
            <Panel title="Objets">
                <EmptyState
                    title="Aucune donnée d'objets"
                    description="Le jeu de données chargé ne contient pas d'échantillon d'objets pour ce champion dans ce rôle."
                />
            </Panel>
        );
    }

    const stepEntries = byOrder[step] ?? [];

    return (
        <div className="flex flex-col gap-4">
            <Panel
                title="Build complet"
                subtitle={
                    build.reconstructed
                        ? "Assemblé à partir du meilleur objet de chaque étape"
                        : "Ensemble complet observé dans l'échantillon"
                }
                actions={
                    gold !== null ? (
                        <span className="tabular inline-flex items-center gap-1.5 text-xs text-gold">
                            <Coins className="h-3.5 w-3.5" />
                            {formatNumber(gold)} po
                        </span>
                    ) : null
                }
            >
                <div className="scrollbar-slim flex items-stretch gap-2 overflow-x-auto pb-1">
                    {build.starter && (
                        <BuildStep label="Départ" entry={build.starter} />
                    )}
                    {build.boots && (
                        <>
                            <StepArrow />
                            <BuildStep label="Bottes" entry={build.boots} />
                        </>
                    )}
                    {build.path.map((entry, index) => (
                        <span
                            key={entryKey(entry)}
                            className="flex items-stretch gap-2"
                        >
                            <StepArrow />
                            <BuildStep
                                label={ORDER_LABELS[index] ?? `Objet ${index + 1}`}
                                entry={entry}
                            />
                        </span>
                    ))}
                </div>

                <p className="mt-3 flex items-start gap-2 rounded-card border border-line-soft bg-surface-2/60 px-3 py-2 text-xs text-ink-muted">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                    <span>
                        {build.reconstructed
                            ? "Ce build n'a pas été observé tel quel : chaque objet est le mieux noté de son étape, pris séparément. "
                            : "Ce build a été observé en l'état dans l'échantillon. "}
                        Déviez dès que la partie l'impose : deuxième objet défensif
                        contre une composition à dégâts d'un seul type, achat anti-soin
                        face à un champion qui se régénère, bottes choisies selon les
                        dégâts adverses plutôt que selon ce classement. Les écarts
                        affichés valent «&nbsp;toutes parties confondues&nbsp;» : ils ne
                        remplacent pas la lecture de la partie.
                    </span>
                </p>
            </Panel>

            <div className="grid gap-4 xl:grid-cols-2">
                <Panel
                    title="Objets de départ"
                    subtitle="Premier achat, avant le premier retour"
                >
                    <EntryList
                        entries={items.startingSets}
                        enemyKey={enemyKey}
                        enemyName={enemyName}
                        empty="Aucun objet de départ dans l'échantillon."
                    />
                </Panel>

                <Panel
                    title="Bottes"
                    subtitle="Classées par apport au taux de victoire"
                >
                    <EntryList
                        entries={items.boots}
                        enemyKey={enemyKey}
                        enemyName={enemyName}
                        empty="Aucune botte dans l'échantillon."
                    />
                </Panel>
            </div>

            <Panel
                title="Chemin de build"
                subtitle="Le meilleur choix à chaque étape, et ses alternatives"
            >
                <div
                    role="group"
                    aria-label="Étape du build"
                    className="scrollbar-slim mb-3 flex gap-2 overflow-x-auto"
                >
                    {byOrder.map((entries, index) => {
                        const best = entries[0];
                        const active = index === step;
                        return (
                            <button
                                key={index}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setStep(index)}
                                className={cn(
                                    "flex min-w-36 shrink-0 items-center gap-2 rounded-card border px-2 py-1.5 text-left transition-colors",
                                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                                    active
                                        ? "border-gold/50 bg-gold/10"
                                        : "border-line bg-surface-2 hover:bg-surface-3",
                                )}
                            >
                                {best ? (
                                    <ItemIcon
                                        id={best.id}
                                        name={best.name}
                                        src={best.icon}
                                        size="sm"
                                        corner={index + 1}
                                    />
                                ) : null}
                                <span className="min-w-0">
                                    <span className="block text-xs text-ink-subtle">
                                        {ORDER_LABELS[index] ?? `Objet ${index + 1}`}
                                    </span>
                                    <span className="block truncate text-xs font-medium text-ink">
                                        {best ? entryLabel(best) : "—"}
                                    </span>
                                    {best && (
                                        <span className="mt-0.5 flex items-center gap-1.5">
                                            <WinrateValue
                                                winrate={best.winrate}
                                                games={best.games}
                                                className="text-[11px]"
                                            />
                                            <DeltaValue
                                                delta={best.winrateDelta}
                                                games={best.games}
                                                className="text-[11px]"
                                            />
                                        </span>
                                    )}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <EntryList
                    entries={stepEntries}
                    enemyKey={enemyKey}
                    enemyName={enemyName}
                    empty="Aucun objet pour cette étape."
                />
            </Panel>

            <Panel
                title="Objets situationnels et de fin de partie"
                subtitle="Ce que l'échantillon achète en plus du chemin recommandé"
            >
                {situational.length === 0 ? (
                    <p className="text-sm text-ink-muted">
                        Le chemin recommandé couvre déjà tous les objets de
                        l'échantillon.
                    </p>
                ) : (
                    <EntryList
                        entries={situational}
                        enemyKey={enemyKey}
                        enemyName={enemyName}
                        empty=""
                    />
                )}
            </Panel>
        </div>
    );
}

function StepArrow() {
    return (
        <span className="flex items-center text-ink-subtle" aria-hidden>
            <ChevronRight className="h-4 w-4" />
        </span>
    );
}

function BuildStep({ label, entry }: { label: string; entry: BuildEntry }) {
    return (
        <Tooltip
            wide
            content={
                <span>
                    {entryLabel(entry)} — winrate {formatPercent(entry.winrate)}, apport{" "}
                    {formatPercent(0.5 + entry.winrateDelta)} sur{" "}
                    {formatNumber(Math.round(entry.games))} parties.
                </span>
            }
        >
            <span className="flex min-w-24 shrink-0 flex-col items-center gap-1 rounded-card border border-line-soft bg-surface-2/60 px-2 py-2">
                <span className="text-xs text-ink-subtle">{label}</span>
                <ItemEntryIcon entry={entry} />
                <span className="max-w-24 truncate text-[11px] text-ink">
                    {entryLabel(entry)}
                </span>
                <WinrateValue
                    winrate={entry.winrate}
                    games={entry.games}
                    className="text-[11px]"
                />
                <SampleSize games={entry.games} wins={entry.wins} showDot={false} />
            </span>
        </Tooltip>
    );
}

export function EntryList({
    entries,
    enemyKey,
    enemyName,
    empty,
    withRank = false,
}: {
    entries: readonly BuildEntry[];
    enemyKey: string | null;
    enemyName: string | null;
    empty: string;
    withRank?: boolean;
}) {
    if (entries.length === 0) {
        return empty ? <p className="text-sm text-ink-muted">{empty}</p> : null;
    }
    return (
        <ul className="flex flex-col gap-1">
            <EntryRowHeader
                withRank={withRank}
                enemyName={enemyKey ? enemyName : null}
            />
            {entries.map((entry, index) => (
                <EntryRow
                    key={entryKey(entry)}
                    entry={entry}
                    rank={withRank ? index + 1 : undefined}
                    recommended={index === 0}
                    enemyKey={enemyKey}
                    enemyName={enemyName}
                    icon={<ItemEntryIcon entry={entry} size="sm" />}
                    title={entryLabel(entry)}
                    subtitle={
                        entry.components && entry.components.length > 1
                            ? entry.components
                                  .map(
                                      (component) =>
                                          component.name ?? `#${component.id}`,
                                  )
                                  .join(" + ")
                            : undefined
                    }
                />
            ))}
        </ul>
    );
}
