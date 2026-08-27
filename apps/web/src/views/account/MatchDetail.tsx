import type { Role } from "@draftpredict/core";
import { Ban, Sparkles } from "lucide-react";
import type { ChampionSummary, MatchSummary } from "../../api";
import { useChampionIndex } from "../../api";
import { cn } from "../../lib/cn";
import { formatPercent, roleLongLabels } from "../../lib/format";
import { Badge, ChampionAvatar, RoleIcon, Skeleton, Tooltip } from "../../ui";
import { DatasetNotice } from "../../app/DatasetNotice";
import { useMatchPrediction } from "./hooks";
import { draftIsAnalysable, predictionVerdict } from "./helpers";

const ROLES: readonly Role[] = [0, 1, 2, 3, 4];

type Player = MatchSummary["team"]["players"][number];

/**
 * A finished game, opened up: the full draft and what the engine would have
 * said before it started.
 *
 * `MatchSummary.draft` is already a `SerializedDraftState` with the player's
 * team first, so it goes straight back through `POST /api/draft/analyze` — the
 * exact same code path as the live draft board. That is the point of the
 * feature: it closes the loop between the prediction and the result, and it is
 * the only place in the app where the engine can be checked against reality.
 *
 * The prediction is dataset-backed, so it carries the dataset notice: offline,
 * these numbers come from the synthetic fixture and must not be read as a
 * verdict on a real game.
 */
export function MatchDetail({ match }: { match: MatchSummary }) {
    const analysable = draftIsAnalysable(match.draft);
    const { analysis, error, isLoading } = useMatchPrediction(match.draft, analysable);
    const index = useChampionIndex();

    const winrate = analysis?.result.winrate ?? null;
    const verdict = predictionVerdict(winrate, match);

    return (
        <div className="flex flex-col gap-4 border-t border-line bg-surface-1/60 px-3 py-3">
            <section className="flex flex-col gap-2">
                <h4 className="flex items-center gap-1.5 text-xs font-medium text-ink-subtle">
                    <Sparkles aria-hidden className="h-3.5 w-3.5" />
                    Ce que le moteur aurait prédit
                </h4>

                {!analysable ? (
                    <p className="text-xs text-ink-subtle">
                        Riot n'a pas renvoyé de draft complet pour cette partie : elle
                        ne peut pas être rejouée dans le moteur.
                    </p>
                ) : isLoading ? (
                    <Skeleton className="h-14 w-full" />
                ) : error ? (
                    <p className="text-xs text-negative">
                        L'analyse du draft a échoué&nbsp;: {error.userMessage}
                    </p>
                ) : verdict && analysis ? (
                    <>
                        <div
                            className={cn(
                                "flex flex-wrap items-center gap-3 rounded-card border px-3 py-2.5",
                                verdict.tone === "positive" &&
                                    "border-positive/40 bg-positive/8",
                                verdict.tone === "negative" &&
                                    "border-negative/40 bg-negative/8",
                                verdict.tone === "neutral" &&
                                    "border-line bg-surface-2/60",
                            )}
                        >
                            <span className="tabular text-2xl font-semibold text-ink-strong">
                                {formatPercent(analysis.result.winrate, 0)}
                            </span>
                            <span className="min-w-0 flex-1 text-xs text-ink-muted">
                                de chances de victoire pour votre équipe avant le
                                premier pick — {verdict.sentence}.
                            </span>
                            <Badge
                                tone={
                                    verdict.tone === "positive"
                                        ? "positive"
                                        : verdict.tone === "negative"
                                          ? "negative"
                                          : "neutral"
                                }
                            >
                                {verdict.label}
                            </Badge>
                        </div>
                        <DatasetNotice dataset={analysis.dataset} />
                    </>
                ) : null}
            </section>

            <section className="flex flex-col gap-2">
                <h4 className="text-xs font-medium text-ink-subtle">
                    Draft de la partie
                </h4>
                <DraftGrid match={match} byKey={index.byKey} />
            </section>

            <BanRows match={match} byKey={index.byKey} />
        </div>
    );
}

function orderedPlayers(players: readonly Player[]): (Player | null)[] {
    const byRole = new Map<Role, Player>();
    for (const player of players) {
        if (player.role !== null && !byRole.has(player.role))
            byRole.set(player.role, player);
    }
    // Riot omits positions on some queues; falling back to the raw order keeps
    // all five players on screen instead of silently dropping them.
    if (byRole.size === ROLES.length)
        return ROLES.map((role) => byRole.get(role) ?? null);
    return ROLES.map((_, index) => players[index] ?? null);
}

function DraftGrid({
    match,
    byKey,
}: {
    match: MatchSummary;
    byKey: ReadonlyMap<string, ChampionSummary>;
}) {
    const ally = orderedPlayers(match.team.players);
    const enemy = orderedPlayers(match.enemyTeam.players);

    return (
        <div className="flex flex-col gap-1">
            <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] gap-2 text-xs text-ink-subtle">
                <span className={match.team.win ? "text-positive" : "text-ink-subtle"}>
                    Votre équipe {match.team.win ? "(victoire)" : "(défaite)"}
                </span>
                <span className="text-center">Rôle</span>
                <span
                    className={cn(
                        "text-right",
                        match.enemyTeam.win ? "text-negative" : "text-ink-subtle",
                    )}
                >
                    Équipe adverse
                </span>
            </div>

            {ROLES.map((role, index) => {
                const allyPlayer = ally[index] ?? null;
                const shownRole = allyPlayer?.role ?? role;
                return (
                    <div
                        key={role}
                        className="grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] items-center gap-2"
                    >
                        <PlayerCell
                            player={allyPlayer}
                            byKey={byKey}
                            side="ally"
                            selfPuuid={match.puuid}
                        />
                        <span className="flex justify-center text-ink-subtle">
                            <Tooltip content={roleLongLabels[shownRole]}>
                                <RoleIcon role={shownRole} size="sm" labelled={false} />
                            </Tooltip>
                        </span>
                        <PlayerCell
                            player={enemy[index] ?? null}
                            byKey={byKey}
                            side="enemy"
                            selfPuuid={match.puuid}
                        />
                    </div>
                );
            })}
        </div>
    );
}

function PlayerCell({
    player,
    byKey,
    side,
    selfPuuid,
}: {
    player: Player | null;
    byKey: ReadonlyMap<string, ChampionSummary>;
    side: "ally" | "enemy";
    selfPuuid: string;
}) {
    if (!player) {
        return (
            <span
                className={cn(
                    "text-xs text-ink-subtle",
                    side === "enemy" && "text-right",
                )}
            >
                —
            </span>
        );
    }

    const champion = byKey.get(player.championKey) ?? null;
    const isSelf = player.puuid === selfPuuid;
    const name = player.riotId ?? player.summonerName ?? "Joueur inconnu";

    return (
        <span
            className={cn(
                "flex min-w-0 items-center gap-2 rounded-card border px-2 py-1",
                side === "enemy" && "flex-row-reverse text-right",
                isSelf
                    ? "border-gold/50 bg-gold/8"
                    : side === "ally"
                      ? "border-team-ally/25 bg-team-ally/5"
                      : "border-team-enemy/25 bg-team-enemy/5",
            )}
        >
            <ChampionAvatar
                champion={
                    champion ?? { key: player.championKey, name: player.championName }
                }
                size="xs"
                ring={side === "ally" ? "ally" : "enemy"}
            />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-ink">
                    {champion?.name ?? player.championName}
                </span>
                <span className="block truncate text-[10px] text-ink-subtle">
                    {isSelf ? "vous" : name} · {player.kills}/{player.deaths}/
                    {player.assists}
                </span>
            </span>
        </span>
    );
}

function BanRows({
    match,
    byKey,
}: {
    match: MatchSummary;
    byKey: ReadonlyMap<string, ChampionSummary>;
}) {
    const allyBans = match.team.bans.filter((key) => key && key !== "-1");
    const enemyBans = match.enemyTeam.bans.filter((key) => key && key !== "-1");
    if (allyBans.length === 0 && enemyBans.length === 0) return null;

    const render = (keys: string[], label: string) => (
        <div className="flex min-w-0 items-center gap-2">
            <span className="text-[11px] text-ink-subtle">{label}</span>
            <span className="flex flex-wrap items-center gap-1">
                {keys.map((key, index) => (
                    <ChampionAvatar
                        key={`${key}-${index}`}
                        champion={byKey.get(key) ?? { key }}
                        size="xs"
                        ring="muted"
                        dimmed
                        title={byKey.get(key)?.name ?? `Champion #${key}`}
                    />
                ))}
            </span>
        </div>
    );

    return (
        <section className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <h4 className="flex items-center gap-1.5 text-xs font-medium text-ink-subtle">
                <Ban aria-hidden className="h-3.5 w-3.5" />
                Bans
            </h4>
            {allyBans.length > 0 && render(allyBans, "Votre équipe")}
            {enemyBans.length > 0 && render(enemyBans, "Adverse")}
        </section>
    );
}
