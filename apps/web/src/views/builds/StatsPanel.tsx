import { useMemo } from "react";
import type { Role } from "@draftpredict/core";
import {
    formatCount,
    formatNumber,
    formatPercent,
    formatSigned,
    roleLongLabels,
} from "../../lib";
import { Panel, ProgressBar, Stat } from "../../ui";
import { TierBadge } from "./TierBadge";
import { WinrateOverTime } from "./WinrateOverTime";
import { TIER_EXPLANATION } from "./labels";
import {
    TIER_MIN_GAMES,
    durationSeries,
    type ChampionRoleIndex,
    type ChampionRoleRow,
    type TierEstimate,
} from "./stats";
import type { Stats as SampleStats } from "@draftpredict/core";

/**
 * The statistics tab: how the champion's winrate moves with game length, and
 * where it sits in the metagame — with the recipe of the tier written out, so
 * the estimate can be argued with.
 */
export function StatsPanel({
    championName,
    role,
    row,
    tier,
    index,
    statsByTime,
    priorGames,
}: {
    championName: string;
    role: Role;
    row: ChampionRoleRow | null;
    tier: TierEstimate | null;
    index: ChampionRoleIndex | null;
    statsByTime: readonly SampleStats[] | undefined;
    priorGames: number;
}) {
    const points = useMemo(
        () => durationSeries(statsByTime, Math.max(50, Math.round(priorGames / 10))),
        [statsByTime, priorGames],
    );

    const ranking = useMemo(() => {
        const rows = index?.byRole.get(role) ?? [];
        const eligible = rows.filter((candidate) => candidate.games >= TIER_MIN_GAMES);
        if (!row || eligible.length === 0) return null;
        const sorted = [...eligible].sort((a, b) => b.rating - a.rating);
        const position = sorted.findIndex(
            (candidate) => candidate.championKey === row.championKey,
        );
        return position < 0 ? null : { position: position + 1, total: sorted.length };
    }, [index, role, row]);

    const trend = useMemo(() => {
        const usable = points.filter((point) => point.games > 0);
        if (usable.length < 2) return null;
        return usable[usable.length - 1].adjustedWinrate - usable[0].adjustedWinrate;
    }, [points]);

    return (
        <div className="flex flex-col gap-4">
            <Panel
                title="Winrate par durée de partie"
                subtitle="Sept tranches de 5 minutes, à partir de 20 minutes"
            >
                <WinrateOverTime points={points} />
                {trend !== null && (
                    <p className="mt-3 text-xs text-ink-muted">
                        Entre la tranche la plus courte et la plus longue, le taux de
                        victoire lissé de {championName} varie de{" "}
                        <span className="tabular font-semibold text-ink">
                            {formatSigned(trend * 100, 1)} point(s)
                        </span>
                        {trend > 0.01
                            ? " : le champion se renforce avec la durée."
                            : trend < -0.01
                              ? " : le champion s'essouffle sur les parties longues."
                              : " : sa courbe est plate, la durée ne le favorise pas particulièrement."}
                    </p>
                )}
            </Panel>

            <Panel
                title="Place dans la méta"
                subtitle={`Comparé aux autres champions ${roleLongLabels[role]}`}
            >
                <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start">
                    <div className="flex items-center gap-3">
                        <TierBadge estimate={tier} size="md" />
                        <div>
                            <p className="text-sm font-semibold text-ink-strong">
                                {tier ? `Tier ${tier.tier}` : "Non classé"}
                            </p>
                            <p className="text-xs text-ink-muted">
                                {ranking
                                    ? `${formatNumber(ranking.position)}e sur ${formatNumber(
                                          ranking.total,
                                      )} champions classés`
                                    : `Moins de ${TIER_MIN_GAMES} parties dans ce rôle`}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <Stat
                            size="sm"
                            label="Score"
                            value={tier ? `${formatSigned(tier.score, 2)} σ` : "—"}
                        />
                        <Stat
                            size="sm"
                            label="Force"
                            value={tier ? `${formatSigned(tier.ratingZ, 2)} σ` : "—"}
                            hint="rating vs rôle"
                        />
                        <Stat
                            size="sm"
                            label="Popularité"
                            value={
                                tier ? `${formatSigned(tier.popularityZ, 2)} σ` : "—"
                            }
                            hint="parties vs rôle"
                        />
                        <Stat
                            size="sm"
                            label="Winrate lissé"
                            value={row ? formatPercent(row.adjustedWinrate) : "—"}
                            hint={row ? `${formatCount(row.games)} parties` : "—"}
                        />
                    </div>
                </div>

                {ranking && (
                    <div className="mt-4">
                        <ProgressBar
                            value={
                                1 -
                                (ranking.position - 1) / Math.max(1, ranking.total - 1)
                            }
                            label={`Position dans le rôle ${roleLongLabels[role]}`}
                            valueLabel={`${formatNumber(ranking.position)} / ${formatNumber(ranking.total)}`}
                            tone="gold"
                        />
                    </div>
                )}

                <p className="mt-4 rounded-card border border-line-soft bg-surface-2/60 px-3 py-2 text-xs text-ink-muted">
                    {TIER_EXPLANATION} Le lissage utilise l'a priori configuré côté
                    serveur ({formatCount(priorGames)} parties), le même que celui de
                    l'analyse de draft, de sorte que les deux vues racontent la même
                    histoire.
                </p>
            </Panel>
        </div>
    );
}
