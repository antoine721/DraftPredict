import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
    isRiotKeyMissing,
    useAccountLookup,
    useChampionIndex,
    useLcuChampSelect,
    useLcuLiveStatus,
    useLcuStatus,
    useAccountMe,
    useLiveChampSelect,
    useLiveConnectionState,
    useLiveEvent,
    useLiveGame,
    useProfile,
    useRiotKeyState,
    useStaticSummonerSpells,
} from "../../api";
import type { SummonerSpellDetail } from "../../api/types";
import { ROUTES } from "../../app/routes";
import { toast } from "../../app/toast";
import { formatRiotId } from "../../lib/format";
import { usePreferencesStore } from "../../state";
import { Card, ErrorState, RiotKeyMissingState } from "../../ui";
import { ChampSelectMirror } from "./ChampSelectMirror";
import { IdlePanel } from "./IdlePanel";
import { LiveGamePanel } from "./LiveGamePanel";
import { LiveStatusBar } from "./LiveStatusBar";
import { SpectatePanel } from "./SpectatePanel";
import { pollIntervalMs, type LiveTarget, type PollingState } from "./helpers";
import { useCountdown, useIdleCounter, useNow, usePageVisible } from "./hooks";

/**
 * "Partie en cours" — what is happening right now.
 *
 * The screen has one job and three shapes: mirror champion select while the
 * League Client is in it, show the spectated game once it started, and stay
 * useful and honest the rest of the time (which is most of the time).
 *
 * Three decisions are worth knowing about:
 *
 * - **The client is the default source.** `GET /api/account/me` resolves the
 *   logged-in account without an API key, so nobody has to type a Riot ID; the
 *   search box is for watching *someone else*, and it takes over when used.
 * - **Nothing polls in a background tab.** Every interval on this screen is
 *   gated on page visibility and grows on its own while nothing happens
 *   (15 s → 2 min), so an app left open overnight does not hammer Riot.
 * - **The socket wins over HTTP.** While `/ws` is open, champion select and the
 *   client status are pushed; the REST fallbacks only run when it is not.
 */
export default function LiveView() {
    const visible = usePageVisible();
    const socketOpen = useLiveConnectionState() === "open";

    const { byKey } = useChampionIndex();
    const spells = useStaticSummonerSpells();
    const spellsById = useMemo(() => {
        const map = new Map<number, SummonerSpellDetail>();
        for (const spell of spells.data?.summonerSpells ?? [])
            map.set(spell.key, spell);
        return map;
    }, [spells.data]);

    const keyState = useRiotKeyState();
    const keyReady = keyState.isLoading || keyState.hasRiotApiKey;

    // ------------------------------------------------------- client state --

    const pushedStatus = useLcuLiveStatus();
    const statusQuery = useLcuStatus({
        enabled: !socketOpen,
        refetchInterval: !socketOpen && visible ? 15_000 : false,
    });
    const status = pushedStatus ?? statusQuery.data ?? null;

    // ----------------------------------------------------- champion select --

    const pushed = useLiveChampSelect();
    const champSelectQuery = useLcuChampSelect({
        enabled: !socketOpen && (status?.connected ?? false),
        refetchInterval:
            !socketOpen && visible && (status?.connected ?? false) ? 6000 : false,
    });

    const champSelect = useMemo(() => {
        if (pushed.active && pushed.state) {
            return {
                state: pushed.state,
                analysis: pushed.analysis,
                suggestions: pushed.suggestions,
                updatedAt: pushed.updatedAt,
                fromSocket: true,
            };
        }
        const payload = champSelectQuery.data;
        if (payload?.inChampSelect && payload.state) {
            return {
                state: payload.state,
                analysis: payload.analysis,
                suggestions: payload.suggestions,
                updatedAt: payload.updatedAt ?? champSelectQuery.dataUpdatedAt,
                fromSocket: false,
            };
        }
        return null;
    }, [pushed, champSelectQuery.data, champSelectQuery.dataUpdatedAt]);

    const remainingMs = useCountdown(
        champSelect?.state.timerMs ?? null,
        champSelect?.updatedAt ?? null,
    );

    // ------------------------------------------------------------- target --

    const lastRiotId = usePreferencesStore((state) => state.lastRiotId);
    const [input, setInput] = useState(() => lastRiotId ?? "");
    const [query, setQuery] = useState<string | null>(null);

    const me = useAccountMe({
        enabled: visible,
        refetchInterval: visible && !socketOpen ? 30_000 : false,
    });
    const lookup = useAccountLookup(query, undefined, { enabled: keyReady });

    // The client can start long after this screen did, and `/api/account/me`
    // is not on a fast poll while the socket is open — so the moment the
    // client announces a summoner, ask again.
    const clientPuuid = status?.summoner?.puuid ?? null;
    useEffect(() => {
        if (!clientPuuid || me.data?.puuid === clientPuuid) return;
        void me.refetch();
    }, [clientPuuid]);

    const target = useMemo((): (LiveTarget & { label: string }) | null => {
        if (query) {
            if (!lookup.data) return null;
            return {
                puuid: lookup.data.puuid,
                label: formatRiotId(lookup.data.gameName, lookup.data.tagLine),
                source: "search",
                platform: lookup.data.platform,
            };
        }
        if (!me.data) return null;
        return {
            puuid: me.data.puuid,
            label:
                me.data.gameName !== null
                    ? formatRiotId(me.data.gameName, me.data.tagLine)
                    : (me.data.displayName ?? "Compte du client"),
            source: "lcu",
            platform: me.data.platform,
        };
    }, [query, lookup.data, me.data]);

    useEffect(() => {
        if (!query || !lookup.data) return;
        usePreferencesStore.getState().rememberAccount({
            riotId: query,
            puuid: lookup.data.puuid,
            platform: lookup.data.platform,
        });
    }, [query, lookup.data]);

    // --------------------------------------------------------- live game ---

    // The counter resets whenever the situation changes — a new account, a new
    // client phase — so "Vérifier maintenant" never means "dans deux minutes".
    const idle = useIdleCounter(`${target?.puuid ?? "none"}:${status?.phase ?? ""}`);
    const intervalMs = pollIntervalMs(idle.checks);
    const canWatch = target !== null && keyReady;

    const liveGame = useLiveGame(canWatch ? target.puuid : null, target?.platform, {
        enabled: canWatch,
        refetchInterval: canWatch && visible ? intervalMs : false,
    });

    const liveUpdatedAt = liveGame.dataUpdatedAt;
    const inGame = liveGame.data?.inGame ?? false;

    // One effect per answer, keyed on the fetch timestamp: a cache read must
    // not count as a check, only a real answer does.
    useEffect(() => {
        if (!liveUpdatedAt) return;
        if (inGame) idle.reset();
        else idle.miss();
    }, [liveUpdatedAt, inGame]);

    const wasInGame = useRef(false);
    useEffect(() => {
        if (inGame && !wasInGame.current) {
            toast.success(
                "Partie détectée",
                "Les deux équipes et la prédiction sont affichées.",
            );
        }
        wasInGame.current = inGame;
    }, [inGame]);

    // Champion select just ended: a game is about to start, so poll fast again.
    useLiveEvent("champselect:end", () => {
        idle.reset();
    });

    const profile = useProfile(
        inGame && target ? target.puuid : null,
        target?.platform,
        { enabled: inGame && target !== null && keyReady },
    );

    const now = useNow(inGame && visible, 1000);

    // ------------------------------------------------------------ actions --

    const refresh = useCallback(() => {
        idle.reset();
        void statusQuery.refetch();
        void me.refetch();
        if (!socketOpen) void champSelectQuery.refetch();
        if (canWatch) void liveGame.refetch();
    }, [idle, statusQuery, me, socketOpen, champSelectQuery, canWatch, liveGame]);

    const onSubmit = useCallback((riotId: string) => {
        setQuery(riotId);
        setInput(riotId);
    }, []);

    const onClear = useCallback(() => {
        setQuery(null);
        setInput("");
    }, []);

    // ------------------------------------------------------------- render --

    const polling: PollingState = {
        active: canWatch,
        paused: canWatch && !visible,
        intervalMs,
    };

    const game = liveGame.data?.inGame ? liveGame.data : null;
    const keyMissing = !keyState.isLoading && !keyState.hasRiotApiKey;
    const liveError =
        liveGame.error && !isRiotKeyMissing(liveGame.error) ? liveGame.error : null;

    return (
        <div className="flex flex-col gap-4">
            <LiveStatusBar
                status={status}
                target={target}
                polling={polling}
                isFetching={liveGame.isFetching || statusQuery.isFetching}
                onRefresh={refresh}
                mirroring={champSelect !== null}
            />

            {champSelect && (
                <ChampSelectMirror
                    state={champSelect.state}
                    analysis={champSelect.analysis}
                    suggestions={champSelect.suggestions}
                    remainingMs={remainingMs}
                    byKey={byKey}
                    fromSocket={champSelect.fromSocket}
                />
            )}

            {game && target && (
                <LiveGamePanel
                    payload={game}
                    fetchedAt={liveUpdatedAt}
                    now={now}
                    byKey={byKey}
                    spellsById={spellsById}
                    label={target.label}
                    ranks={profile.data?.ranks ?? null}
                    isFetching={liveGame.isFetching}
                    onRefresh={refresh}
                />
            )}

            {!champSelect && !game && (
                <IdlePanel
                    status={status}
                    polling={polling}
                    watching={target?.label ?? null}
                    isFetching={liveGame.isFetching || statusQuery.isFetching}
                    onRefresh={refresh}
                    footer={
                        keyMissing ? (
                            <Card padding="sm">
                                <RiotKeyMissingState
                                    size="sm"
                                    description="Le miroir de la sélection des champions fonctionne sans clé. Pour voir une partie en cours — les dix joueurs, leurs sorts et l'analyse — ajoutez votre clé d'API Riot."
                                    action={
                                        <Link
                                            to={ROUTES.settings.path}
                                            className="text-xs text-gold underline-offset-2 hover:underline"
                                        >
                                            Ouvrir les paramètres
                                        </Link>
                                    }
                                />
                            </Card>
                        ) : liveError ? (
                            <Card padding="sm">
                                <ErrorState
                                    size="sm"
                                    error={liveError}
                                    title="Impossible de vérifier la partie en cours"
                                    onRetry={() => void liveGame.refetch()}
                                />
                            </Card>
                        ) : null
                    }
                />
            )}

            <SpectatePanel
                value={input}
                onValueChange={setInput}
                onSubmit={onSubmit}
                onClear={onClear}
                query={query}
                lookup={{
                    data: lookup.data ?? null,
                    error: lookup.error ?? null,
                    isLoading: lookup.isLoading,
                }}
                live={{
                    data: liveGame.data ?? null,
                    error: liveGame.error ?? null,
                    isLoading: liveGame.isLoading,
                    updatedAt: liveUpdatedAt || null,
                }}
                hasRiotApiKey={!keyMissing}
                platform={keyState.platform}
            />
        </div>
    );
}
