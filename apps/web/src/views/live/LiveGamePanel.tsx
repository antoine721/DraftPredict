import { useMemo } from "react";
import { Clock, RefreshCw, Swords } from "lucide-react";
import type { LeagueEntryDto } from "@draftpredict/riot";
import type {
    ChampionSummary,
    LiveGameResponse,
    SummonerSpellDetail,
} from "../../api/types";
import { formatDuration, formatNumber, formatTier } from "../../lib/format";
import { Badge, Button, Panel, Stat, StatRow } from "../../ui";
import { LiveTeamPanel } from "./LiveTeamPanel";
import { WinProbability } from "./WinProbability";
import {
    elapsedSeconds,
    isLoadingScreen,
    liveBans,
    liveTeams,
    queueLabel,
} from "./helpers";

export type LiveGamePanelProps = {
    payload: LiveGameResponse;
    /** When the payload was received, so the clock keeps running between polls. */
    fetchedAt: number;
    /** Ticking clock; the panel is pure with respect to it. */
    now: number;
    byKey: Map<string, ChampionSummary>;
    spellsById: Map<number, SummonerSpellDetail>;
    /** Display name of the account being watched. */
    label: string;
    /** Ranked entries of that account, when the profile route answered. */
    ranks?: { solo?: LeagueEntryDto; flex?: LeagueEntryDto } | null;
    isFetching: boolean;
    onRefresh: () => void;
};

/**
 * A game in progress, seen from one account.
 *
 * The watched player's team is always the left/"ally" one, whichever side of
 * the map it is on — the prediction is expressed from that point of view, so
 * mixing the two axes would invert every number on screen. The blue/red side
 * is still printed, because that is what the player sees in game.
 */
export function LiveGamePanel({
    payload,
    fetchedAt,
    now,
    byKey,
    spellsById,
    label,
    ranks,
    isFetching,
    onRefresh,
}: LiveGamePanelProps) {
    const game = payload.game;
    const teams = useMemo(
        () => liveTeams(game, payload.draft, payload.puuid, payload.analysis),
        [game, payload.draft, payload.puuid, payload.analysis],
    );
    const bans = useMemo(
        () => liveBans(game, teams.allyTeamId),
        [game, teams.allyTeamId],
    );
    const elapsed = elapsedSeconds(game, fetchedAt, now);
    const loading = isLoadingScreen(game);
    const allySideLabel = teams.allyTeamId === 100 ? "bleu" : "rouge";
    const enemySideLabel = teams.allyTeamId === 100 ? "rouge" : "bleu";

    return (
        <Panel
            title="Partie en cours"
            subtitle={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{label}</span>
                    <Badge tone="positive" dot icon={<Swords className="h-3 w-3" />}>
                        En jeu
                    </Badge>
                    <span className="text-ink-subtle">
                        {payload.platform.toUpperCase()}
                    </span>
                </span>
            }
            actions={
                <Button
                    variant="secondary"
                    size="sm"
                    loading={isFetching}
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    onClick={onRefresh}
                >
                    Actualiser
                </Button>
            }
        >
            <div className="flex flex-col gap-4">
                <StatRow>
                    <Stat
                        label="File"
                        value={queueLabel(game?.gameQueueConfigId, game?.gameMode)}
                        size="sm"
                        hint={game ? `Partie ${formatNumber(game.gameId)}` : undefined}
                    />
                    <Stat
                        label="Temps écoulé"
                        icon={<Clock className="h-3.5 w-3.5" />}
                        value={
                            loading ? "Écran de chargement" : formatDuration(elapsed)
                        }
                        size="sm"
                        hint={
                            loading
                                ? "La partie n'a pas encore démarré"
                                : "Compteur local, recalé à chaque relevé"
                        }
                    />
                    <Stat
                        label="Côté"
                        value={allySideLabel === "bleu" ? "Bleu" : "Rouge"}
                        size="sm"
                        hint={`${label} joue du côté ${allySideLabel}`}
                    />
                    <Stat
                        label="Rang du compte"
                        value={
                            ranks?.solo
                                ? formatTier(
                                      ranks.solo.tier,
                                      ranks.solo.rank,
                                      ranks.solo.leaguePoints,
                                  )
                                : "Non classé"
                        }
                        size="sm"
                        hint={
                            ranks?.flex
                                ? `Flexible : ${formatTier(ranks.flex.tier, ranks.flex.rank)}`
                                : "Solo/duo — les rangs des autres joueurs ne sont pas fournis par l'API spectateur"
                        }
                    />
                </StatRow>

                <p className="text-xs text-ink-subtle">
                    Les écarts affichés par joueur sont ceux du champion dans le jeu de
                    données, pas ceux de la personne qui le joue, et ils sont toujours
                    exprimés du point de vue de l'équipe suivie — le vert lui est
                    favorable, y compris sur les lignes adverses.
                </p>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
                    <div className="flex flex-col gap-4">
                        <LiveTeamPanel
                            side="ally"
                            title="Équipe suivie"
                            sideLabel={allySideLabel}
                            rows={teams.ally}
                            bans={bans.ally}
                            byKey={byKey}
                            spellsById={spellsById}
                        />
                        <LiveTeamPanel
                            side="opponent"
                            title="Équipe adverse"
                            sideLabel={enemySideLabel}
                            rows={teams.opponent}
                            bans={bans.opponent}
                            byKey={byKey}
                            spellsById={spellsById}
                        />
                    </div>

                    <div className="flex flex-col gap-4 rounded-card border border-line bg-surface-2/50 p-3">
                        <WinProbability
                            analysis={payload.analysis}
                            allyLabel="Équipe suivie"
                            enemyLabel="Équipe adverse"
                            note="Estimation faite à partir du draft seul : elle ne tient compte ni de l'or, ni des objectifs, ni de ce qui s'est déjà passé dans la partie."
                        />
                    </div>
                </div>
            </div>
        </Panel>
    );
}
