import { useCallback, useEffect, useMemo, useState } from "react";
import { ROLES, type Role, type Team } from "@draftpredict/core";
import {
    useChampionIndex,
    useLcuStatus,
    useLcuLiveStatus,
    useLiveChampSelect,
    useLiveDataset,
} from "../../api";
import type { BanEntry, SuggestionEntry } from "../../api/types";
import { DatasetNotice } from "../../app/DatasetNotice";
import { FOCUS_SEARCH_EVENT } from "../../app/shortcuts";
import { toast } from "../../app/toast";
import {
    boardIsEmpty,
    selectCanRedo,
    selectCanUndo,
    unavailableChampions,
    useDraftShareUrl,
    useDraftStore,
    useDraftUrlSync,
    usePreferencesStore,
} from "../../state";
import { Panel } from "../../ui";
import { AdvicePanel, type AdviceTab } from "./AdvicePanel";
import { AnalysisColumn } from "./AnalysisColumn";
import { ChampionPicker } from "./ChampionPicker";
import { DraftToolbar } from "./DraftToolbar";
import { LiveBadge } from "./LiveBadge";
import { TeamColumn } from "./TeamColumn";
import {
    useAnalysisSource,
    useAnalyzeRequest,
    useCountdown,
    useDraftBanSuggestions,
    useDraftSuggestions,
    useMetaRanking,
    usePickerRanking,
    rolePools,
} from "./data";
import { swapBoard } from "./helpers";
import type { PickerTarget, SlotPreview } from "./types";

/**
 * The draft board.
 *
 * The screen is a 5v5 board with the analysis in the middle: ally on the left,
 * enemy on the right, everything the engine has to say between them. Three
 * things it is careful about:
 *
 * - **One source of truth for the board.** The zustand store owns it; the URL,
 *   the League Client and this view all write through it, and any manual edit
 *   drops out of "suivre le client" so the board never fights the user.
 * - **Nothing is presented as more certain than it is.** The dataset notice
 *   sits under the header, the smallest sample is shown next to the gauge, and
 *   the picker says whether its ranking accounts for the current draft.
 * - **The empty board is still useful**: it shows the meta per role, which is
 *   what someone opening the app before champion select actually wants.
 */
export default function DraftView() {
    useDraftUrlSync();

    const { byKey, champions, isLoading: championsLoading } = useChampionIndex();

    const board = useDraftStore((state) => state.board);
    const selected = useDraftStore((state) => state.selected);
    const followClient = useDraftStore((state) => state.followClient);
    const riskLevel = useDraftStore((state) => state.riskLevel);
    const rank = useDraftStore((state) => state.rank);
    const region = useDraftStore((state) => state.region);
    const canUndo = useDraftStore(selectCanUndo);
    const canRedo = useDraftStore(selectCanRedo);

    const suggestionLimit = usePreferencesStore((state) => state.suggestionLimit);
    const banLimit = usePreferencesStore((state) => state.banLimit);

    const [picker, setPicker] = useState<PickerTarget | null>(null);
    const [preview, setPreview] = useState<SlotPreview | null>(null);
    const [tab, setTab] = useState<AdviceTab>("picks");

    const empty = boardIsEmpty(board);
    const unavailable = useMemo(() => unavailableChampions(board), [board]);
    const openAllyRoles = useMemo(
        () => ROLES.filter((role) => !board.ally[role]),
        [board],
    );

    // ------------------------------------------------------------- data ----

    const request = useAnalyzeRequest();
    const analysisSource = useAnalysisSource(request);
    const analysis = analysisSource.analysis;

    const suggestions = useDraftSuggestions(
        request,
        suggestionLimit,
        !empty && openAllyRoles.length > 0,
    );
    const banSuggestions = useDraftBanSuggestions(request, banLimit, tab === "bans");
    const meta = useMetaRanking(request, empty || picker !== null);
    const ranking = usePickerRanking(request, picker, meta.payload, meta.isLoading);
    const pools = useMemo(() => rolePools(meta.payload), [meta.payload]);

    const liveDataset = useLiveDataset();
    const dataset =
        analysis?.dataset ??
        suggestions.payload?.dataset ??
        meta.payload?.dataset ??
        liveDataset;

    // ------------------------------------------------------------- live ----

    const live = useLiveChampSelect();
    const socketStatus = useLcuLiveStatus();
    const statusQuery = useLcuStatus();
    const status = socketStatus ?? statusQuery.data ?? null;
    const remainingMs = useCountdown(live.state?.timerMs ?? null, live.updatedAt);

    const mirroring = followClient && live.active;
    const hovered = useMemo(() => {
        const result = { ally: new Set<Role>(), opponent: new Set<Role>() };
        if (!mirroring || !live.state) return result;
        const locked = {
            ally: new Set(live.state.ally.map(([role]) => role)),
            opponent: new Set(live.state.opponent.map(([role]) => role)),
        };
        for (const [role] of live.state.allyHovers) {
            if (!locked.ally.has(role)) result.ally.add(role);
        }
        for (const [role] of live.state.opponentHovers) {
            if (!locked.opponent.has(role)) result.opponent.add(role);
        }
        return result;
    }, [mirroring, live.state]);

    const acting = useMemo((): { team: Team; role: Role } | null => {
        if (!mirroring || !live.state) return null;
        const cell = live.state.currentActorCellId;
        if (cell === null || cell === undefined) return null;
        const ally = live.state.allyPlayers?.find((player) => player.cellId === cell);
        if (ally) {
            const role = ally.role ?? ally.assignedRole;
            return role === null || role === undefined ? null : { team: "ally", role };
        }
        const enemy = live.state.opponentPlayers?.find(
            (player) => player.cellId === cell,
        );
        const role = enemy?.role ?? enemy?.assignedRole;
        return role === null || role === undefined ? null : { team: "opponent", role };
    }, [mirroring, live.state]);

    // ---------------------------------------------------------- actions ----

    const openPicker = useCallback((team: Team, role: Role) => {
        useDraftStore.getState().selectSlot({ team, role });
        setPicker({ team, role, mode: "pick" });
    }, []);

    const openBanPicker = useCallback((team: Team) => {
        setPicker({ team, role: 0, mode: "ban" });
    }, []);

    const onPickChampion = useCallback(
        (championKey: string) => {
            const target = picker;
            if (!target) return;
            const store = useDraftStore.getState();
            if (target.mode === "ban") {
                store.addBan(target.team, championKey);
            } else {
                store.selectSlot({ team: target.team, role: target.role });
                store.pickInSelectedSlot(championKey);
            }
            setPicker(null);
            setPreview(null);
        },
        [picker],
    );

    const onSuggestionPreview = useCallback((entry: SuggestionEntry | null) => {
        setPreview(
            entry
                ? {
                      team: "ally",
                      role: entry.role,
                      championKey: entry.key,
                      winrate: entry.winrate,
                  }
                : null,
        );
    }, []);

    const onSuggestionPick = useCallback((entry: SuggestionEntry) => {
        useDraftStore.getState().setPick("ally", entry.role, entry.key);
        setPreview(null);
    }, []);

    const onBanSuggestion = useCallback((entry: BanEntry) => {
        useDraftStore.getState().addBan("ally", entry.key);
        toast.success(
            `${entry.name ?? entry.key} banni`,
            "Le champion est retiré du pool des deux équipes.",
        );
    }, []);

    const shareUrl = useDraftShareUrl();
    const onShare = useCallback(() => {
        const copy = navigator?.clipboard?.writeText?.(shareUrl);
        if (!copy) {
            toast.info("Lien du draft", shareUrl);
            return;
        }
        copy.then(
            () => toast.success("Lien copié", "Il rejoue exactement ce draft."),
            () => toast.info("Lien du draft", shareUrl),
        );
    }, [shareUrl]);

    const onSwapSides = useCallback(() => {
        const store = useDraftStore.getState();
        // Swapping is a manual edit: it must not fight the League Client.
        store.setFollowClient(false);
        store.hydrate({ board: swapBoard(store.board) });
        setPreview(null);
        toast.info("Côtés inversés", "L'historique d'annulation repart de zéro.");
    }, []);

    // `mod+k` is the app-wide "search": here it opens the picker on the
    // selected slot, which is the champion search of this view.
    useEffect(() => {
        const onFocusSearch = () => {
            setPicker((current) => {
                if (current) return current;
                const slot = useDraftStore.getState().selected ?? {
                    team: "ally" as Team,
                    role: 0 as Role,
                };
                return { team: slot.team, role: slot.role, mode: "pick" };
            });
        };
        window.addEventListener(FOCUS_SEARCH_EVENT, onFocusSearch);
        return () => window.removeEventListener(FOCUS_SEARCH_EVENT, onFocusSearch);
    }, []);

    // ----------------------------------------------------------- render ----

    const previewChampion = preview ? (byKey.get(preview.championKey) ?? null) : null;

    return (
        <div className="flex flex-col gap-4">
            <LiveBadge
                status={status}
                active={live.active}
                state={live.state}
                remainingMs={remainingMs}
                followClient={followClient}
                onFollowChange={(follow) =>
                    useDraftStore.getState().setFollowClient(follow)
                }
            />

            {dataset && <DatasetNotice dataset={dataset} />}

            <Panel flush className="px-3 py-2.5">
                <DraftToolbar
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={() => useDraftStore.getState().undo()}
                    onRedo={() => useDraftStore.getState().redo()}
                    onClear={() => {
                        useDraftStore.getState().clearDraft();
                        setPreview(null);
                    }}
                    onSwapSides={onSwapSides}
                    onShare={onShare}
                    riskLevel={riskLevel}
                    rank={rank}
                    region={region}
                    onRiskLevelChange={(value) =>
                        useDraftStore.getState().setRiskLevel(value)
                    }
                    onRankChange={(value) => useDraftStore.getState().setRank(value)}
                    onRegionChange={(value) =>
                        useDraftStore.getState().setRegion(value)
                    }
                    resolved={analysis?.config ?? null}
                    resolvedRank={dataset?.rank ?? null}
                    resolvedRegion={dataset?.region ?? null}
                />
            </Panel>

            <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(360px,1.45fr)_minmax(220px,1fr)]">
                <TeamColumn
                    team="ally"
                    board={board}
                    byKey={byKey}
                    analysis={analysis}
                    selectedRole={selected?.team === "ally" ? selected.role : null}
                    preview={preview}
                    hoveredRoles={hovered.ally}
                    actingRole={acting?.team === "ally" ? acting.role : null}
                    onSelectSlot={(role) => openPicker("ally", role)}
                    onClearSlot={(role) =>
                        useDraftStore.getState().clearSlot("ally", role)
                    }
                    onSwapRole={(from, to) =>
                        useDraftStore
                            .getState()
                            .moveSlot(
                                { team: "ally", role: from },
                                { team: "ally", role: to },
                            )
                    }
                    onAddBan={() => openBanPicker("ally")}
                    onRemoveBan={(key) =>
                        useDraftStore.getState().removeBan("ally", key)
                    }
                />

                <AnalysisColumn
                    analysis={analysis}
                    error={analysisSource.error}
                    isFetching={analysisSource.isFetching}
                    fromLive={analysisSource.fromLive}
                    onRetry={analysisSource.refetch}
                    preview={
                        preview && preview.winrate !== null
                            ? {
                                  winrate: preview.winrate,
                                  label:
                                      previewChampion?.name ??
                                      `#${preview.championKey}`,
                              }
                            : null
                    }
                />

                <TeamColumn
                    team="opponent"
                    board={board}
                    byKey={byKey}
                    analysis={analysis}
                    selectedRole={selected?.team === "opponent" ? selected.role : null}
                    preview={preview}
                    hoveredRoles={hovered.opponent}
                    actingRole={acting?.team === "opponent" ? acting.role : null}
                    onSelectSlot={(role) => openPicker("opponent", role)}
                    onClearSlot={(role) =>
                        useDraftStore.getState().clearSlot("opponent", role)
                    }
                    onSwapRole={(from, to) =>
                        useDraftStore
                            .getState()
                            .moveSlot(
                                { team: "opponent", role: from },
                                { team: "opponent", role: to },
                            )
                    }
                    onAddBan={() => openBanPicker("opponent")}
                    onRemoveBan={(key) =>
                        useDraftStore.getState().removeBan("opponent", key)
                    }
                />
            </div>

            <AdvicePanel
                empty={empty}
                meta={{
                    payload: meta.payload,
                    isLoading: meta.isLoading || championsLoading,
                }}
                suggestions={suggestions}
                bans={banSuggestions}
                tab={tab}
                onTabChange={setTab}
                suggestionLimit={suggestionLimit}
                banLimit={banLimit}
                openRoleCount={openAllyRoles.length}
                priorityRole={
                    mirroring ? (live.state?.localPlayer.assignedRole ?? null) : null
                }
                bansFull={board.bans.ally.length >= 5}
                onPreview={onSuggestionPreview}
                onPick={onSuggestionPick}
                onBan={onBanSuggestion}
                onPickFromMeta={(role, championKey) =>
                    useDraftStore.getState().setPick("ally", role, championKey)
                }
            />

            <ChampionPicker
                open={picker !== null}
                target={picker}
                champions={champions}
                unavailable={unavailable}
                ranking={ranking}
                rolePools={pools}
                onPick={onPickChampion}
                onClose={() => setPicker(null)}
            />
        </div>
    );
}
