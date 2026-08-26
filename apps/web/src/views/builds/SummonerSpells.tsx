import type { BuildEntry } from "../../api";
import { EmptyState, Panel, SpellIcon } from "../../ui";
import { EntryRow, EntryRowHeader } from "./EntryRow";
import { entryKey, entryLabel } from "./build-helpers";

/**
 * Summoner spells, as ranked pairs.
 *
 * The dataset rates the pair, never the single spell — Flash + Ignite and
 * Flash + Teleport are two different games — so the pair is what is shown.
 */
export function SummonerSpells({
    spells,
    enemyKey,
    enemyName,
}: {
    spells: readonly BuildEntry[];
    enemyKey: string | null;
    enemyName: string | null;
}) {
    return (
        <Panel
            title="Sorts d'invocateur"
            subtitle="Paires classées par apport au taux de victoire"
        >
            {spells.length === 0 ? (
                <EmptyState
                    size="sm"
                    title="Aucune donnée de sorts"
                    description="Le jeu de données chargé ne contient pas d'échantillon de sorts d'invocateur pour ce champion dans ce rôle."
                />
            ) : (
                <ul className="flex flex-col gap-1">
                    <EntryRowHeader withRank enemyName={enemyKey ? enemyName : null} />
                    {spells.map((entry, index) => (
                        <EntryRow
                            key={entryKey(entry)}
                            entry={entry}
                            rank={index + 1}
                            recommended={index === 0}
                            enemyKey={enemyKey}
                            enemyName={enemyName}
                            icon={
                                <span className="flex shrink-0 items-center gap-1">
                                    {(entry.components ?? []).map(
                                        (component, position) => (
                                            <SpellIcon
                                                key={`${component.id}-${position}`}
                                                name={component.name}
                                                src={component.icon}
                                                size="sm"
                                            />
                                        ),
                                    )}
                                    {(entry.components ?? []).length === 0 && (
                                        <SpellIcon
                                            name={entry.name}
                                            src={entry.icon}
                                            size="sm"
                                        />
                                    )}
                                </span>
                            }
                            title={entryLabel(entry)}
                        />
                    ))}
                </ul>
            )}
        </Panel>
    );
}
