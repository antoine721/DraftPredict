import { ChevronRight, Info } from "lucide-react";
import type { BuildsPayload, ChampionDetail } from "../../api";
import { cn } from "../../lib/cn";
import { formatCount, formatPercent, formatSignedPercent } from "../../lib";
import { EmptyState, Panel, SkillIcon, Tooltip } from "../../ui";
import { EntryRow, EntryRowHeader } from "./EntryRow";
import { WinrateValue } from "./Metrics";
import {
    SKILL_SLOTS,
    entryKey,
    levelPicks,
    skillLetters,
    type SkillSlot,
} from "./build-helpers";

/**
 * Skill order: which spell to max first, and what the sample says about each
 * individual level.
 *
 * The per-level ranking is exactly what the dataset measured — it is *not*
 * filtered through the game's level-up rules, and the note under the grid says
 * so, because an ultimate ranked first at level 3 would otherwise read as a
 * bug rather than as a property of the sample.
 */
export function SkillOrder({
    skills,
    champion,
    enemyKey,
    enemyName,
}: {
    skills: BuildsPayload["skills"];
    /** Static detail, when loaded: gives the spells their real names and icons. */
    champion: ChampionDetail | null;
    enemyKey: string | null;
    enemyName: string | null;
}) {
    const spellBySlot = new Map<SkillSlot, ChampionDetail["spells"][number]>();
    for (const spell of champion?.spells ?? []) {
        spellBySlot.set(spell.slot, spell);
    }

    const picks = levelPicks(skills.levels ?? []).slice(0, 6);
    const hasOrder = (skills.order ?? []).length > 0;

    if (!hasOrder && picks.length === 0) {
        return (
            <Panel title="Ordre de compétences">
                <EmptyState
                    size="sm"
                    title="Aucune donnée de compétences"
                    description="Le jeu de données chargé ne contient pas d'échantillon d'ordre de compétences pour ce champion dans ce rôle."
                />
            </Panel>
        );
    }

    return (
        <Panel
            title="Ordre de compétences"
            subtitle="Ordre de maximisation, puis les premiers niveaux"
        >
            {hasOrder && (
                <ul className="flex flex-col gap-1">
                    <EntryRowHeader withRank enemyName={enemyKey ? enemyName : null} />
                    {skills.order.map((entry, index) => {
                        const letters = skillLetters(entry.id);
                        return (
                            <EntryRow
                                key={entryKey(entry)}
                                entry={entry}
                                rank={index + 1}
                                recommended={index === 0}
                                enemyKey={enemyKey}
                                enemyName={enemyName}
                                icon={
                                    <span className="flex shrink-0 items-center gap-0.5">
                                        {letters.map((letter, position) => (
                                            <span
                                                key={`${letter}-${position}`}
                                                className="flex items-center"
                                            >
                                                {position > 0 && (
                                                    <ChevronRight
                                                        aria-hidden
                                                        className="h-3 w-3 text-ink-subtle"
                                                    />
                                                )}
                                                <SkillIcon
                                                    slot={letter}
                                                    size="xs"
                                                    active={position === 0}
                                                />
                                            </span>
                                        ))}
                                    </span>
                                }
                                title={letters
                                    .map(
                                        (letter) =>
                                            spellBySlot.get(letter)?.name ?? letter,
                                    )
                                    .join(" › ")}
                                subtitle={`Maximiser ${letters.join(" puis ")}`}
                            />
                        );
                    })}
                </ul>
            )}

            {picks.length > 0 && (
                <div className="mt-4">
                    <h3 className="mb-2 text-xs font-medium text-ink-subtle">
                        Premiers niveaux
                    </h3>
                    <div className="scrollbar-slim overflow-x-auto">
                        <table className="w-full min-w-[30rem] border-collapse text-xs">
                            <thead>
                                <tr className="text-ink-subtle">
                                    <th
                                        scope="col"
                                        className="py-1 pr-2 text-left font-medium"
                                    >
                                        Niveau
                                    </th>
                                    {picks.map((pick) => (
                                        <th
                                            key={pick.level}
                                            scope="col"
                                            className="tabular py-1 text-center font-medium"
                                        >
                                            {pick.level}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {SKILL_SLOTS.map((slot) => (
                                    <tr
                                        key={slot}
                                        className="border-t border-line-soft"
                                    >
                                        <th
                                            scope="row"
                                            className="py-1 pr-2 text-left font-medium text-ink-muted"
                                        >
                                            <span className="flex items-center gap-1.5">
                                                <SkillIcon slot={slot} size="xs" />
                                                <span className="truncate">
                                                    {spellBySlot.get(slot)?.name ??
                                                        slot}
                                                </span>
                                            </span>
                                        </th>
                                        {picks.map((pick) => {
                                            const entry = pick.entries.find(
                                                (option) => String(option.id) === slot,
                                            );
                                            const best = pick.best?.id === slot;
                                            return (
                                                <td
                                                    key={pick.level}
                                                    className="py-1 text-center"
                                                >
                                                    {entry ? (
                                                        <Tooltip
                                                            wide
                                                            content={
                                                                <span>
                                                                    Niveau {pick.level}{" "}
                                                                    —{" "}
                                                                    {spellBySlot.get(
                                                                        slot,
                                                                    )?.name ?? slot}
                                                                    <br />
                                                                    Winrate{" "}
                                                                    {formatPercent(
                                                                        entry.winrate,
                                                                    )}{" "}
                                                                    sur{" "}
                                                                    {formatCount(
                                                                        entry.games,
                                                                    )}{" "}
                                                                    parties, apport{" "}
                                                                    {formatSignedPercent(
                                                                        entry.winrateDelta,
                                                                    )}
                                                                    .
                                                                </span>
                                                            }
                                                        >
                                                            <span
                                                                className={cn(
                                                                    "inline-flex min-w-14 justify-center rounded-control border px-1.5 py-1",
                                                                    best
                                                                        ? "border-gold/50 bg-gold/12"
                                                                        : "border-transparent",
                                                                )}
                                                            >
                                                                <WinrateValue
                                                                    winrate={
                                                                        entry.winrate
                                                                    }
                                                                    games={entry.games}
                                                                    className="text-[11px]"
                                                                />
                                                            </span>
                                                        </Tooltip>
                                                    ) : (
                                                        <span className="text-ink-subtle">
                                                            —
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-2 flex items-start gap-2 text-[11px] text-ink-subtle">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                        <span>
                            Chaque niveau est classé indépendamment, tel que mesuré dans
                            l'échantillon : les contraintes du jeu (ultime à partir du
                            niveau 6, un seul point par niveau) ne sont pas appliquées.
                            La colonne mise en avant est simplement la mieux notée à ce
                            niveau.
                        </span>
                    </p>
                </div>
            )}
        </Panel>
    );
}
