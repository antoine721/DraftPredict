import { Bot, HelpCircle, User } from "lucide-react";
import type { ChampionSummary, SummonerSpellDetail } from "../../api/types";
import { cn } from "../../lib/cn";
import { formatCount, formatSignedPercent, roleLongLabels } from "../../lib/format";
import { deltaColor } from "../../lib/winrate";
import { Badge, ChampionAvatar, RoleIcon, SpellIcon, Tooltip } from "../../ui";
import type { LiveParticipant, LiveSide } from "./helpers";

export type LivePlayerRowProps = {
    row: LiveParticipant;
    side: LiveSide;
    byKey: Map<string, ChampionSummary>;
    spellsById: Map<number, SummonerSpellDetail>;
    className?: string;
};

/**
 * One player of a spectated game.
 *
 * What Riot's spectator payload actually carries is the champion, the two
 * summoner spells and — sometimes — the Riot ID. Everything else on this row
 * comes from the engine's own breakdown of the draft, which is why the numbers
 * are labelled as champion statistics and never as this player's statistics.
 */
export function LivePlayerRow({
    row,
    side,
    byKey,
    spellsById,
    className,
}: LivePlayerRowProps) {
    const champion = byKey.get(row.championKey);
    const name = champion?.name ?? `#${row.championKey}`;
    const matchupChampion = row.matchup
        ? (byKey.get(row.matchup.opponentKey)?.name ?? `#${row.matchup.opponentKey}`)
        : null;

    return (
        <li
            className={cn(
                "flex items-center gap-3 rounded-card border px-2.5 py-2",
                row.isTarget
                    ? "border-gold/60 bg-gold/8"
                    : "border-line bg-surface-2/60",
                className,
            )}
        >
            <span
                className={cn(
                    "shrink-0",
                    side === "ally" ? "text-team-ally" : "text-team-enemy",
                )}
            >
                {row.role === null ? (
                    <Tooltip content="Position inconnue : les données spectateur n'en contiennent pas et le moteur n'a pas pu la déduire.">
                        <HelpCircle
                            className="h-4 w-4"
                            aria-label="Position inconnue"
                        />
                    </Tooltip>
                ) : (
                    <RoleIcon role={row.role} size="sm" labelled={false} />
                )}
            </span>

            <ChampionAvatar
                size="md"
                ring={row.isTarget ? "gold" : side === "ally" ? "ally" : "enemy"}
                champion={champion ?? { key: row.championKey }}
                name={name}
            />

            <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-ink-strong">
                        {name}
                    </span>
                    {row.isTarget && (
                        <Badge tone="gold" icon={<User className="h-3 w-3" />}>
                            Ce compte
                        </Badge>
                    )}
                    {row.bot && (
                        <Badge tone="neutral" icon={<Bot className="h-3 w-3" />}>
                            Bot
                        </Badge>
                    )}
                </span>
                <span className="truncate text-[11px] text-ink-subtle">
                    {row.riotId ?? "Riot ID non communiqué"}
                    {row.role !== null && ` · ${roleLongLabels[row.role]}`}
                </span>
            </div>

            <span className="flex shrink-0 items-center gap-1">
                {row.spellIds.length === 0 ? (
                    <span className="text-[11px] text-ink-subtle">Sorts inconnus</span>
                ) : (
                    row.spellIds.map((id) => {
                        const spell = spellsById.get(id);
                        return (
                            <SpellIcon
                                key={id}
                                size="xs"
                                src={spell?.icon ?? null}
                                name={spell?.name ?? `Sort ${id}`}
                            />
                        );
                    })
                )}
            </span>

            <span className="hidden w-40 shrink-0 flex-col items-end text-right lg:flex">
                {row.contribution ? (
                    <Tooltip
                        wide
                        content={`Effet du champion ${name} sur la probabilité de victoire de cette équipe, mesuré sur ${formatCount(row.contribution.games)} parties du jeu de données.`}
                    >
                        <span
                            className="tabular text-xs font-semibold"
                            style={{ color: deltaColor(row.contribution.winrateDelta) }}
                        >
                            {formatSignedPercent(row.contribution.winrateDelta)}
                        </span>
                    </Tooltip>
                ) : (
                    <span className="text-[11px] text-ink-subtle">
                        Aucune statistique
                    </span>
                )}
                {row.matchup && matchupChampion ? (
                    <span className="tabular truncate text-[11px] text-ink-subtle">
                        vs {matchupChampion}{" "}
                        <span style={{ color: deltaColor(row.matchup.winrateDelta) }}>
                            {formatSignedPercent(row.matchup.winrateDelta)}
                        </span>{" "}
                        · {formatCount(row.matchup.games)} parties
                    </span>
                ) : (
                    row.contribution && (
                        <span className="tabular text-[11px] text-ink-subtle">
                            {formatCount(row.contribution.games)} parties
                        </span>
                    )
                )}
            </span>
        </li>
    );
}
