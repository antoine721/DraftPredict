import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Radio, Timer } from "lucide-react";
import type {
    AnalyzePayload,
    ChampionSummary,
    SerializedChampSelectState,
    SuggestionsPayload,
} from "../../api/types";
import { ROUTES } from "../../app/routes";
import { cn } from "../../lib/cn";
import { formatTimer } from "../../lib/format";
import { Badge, ChampionAvatar, Panel } from "../../ui";
import { BanStrip } from "./BanStrip";
import { ChampSelectSide } from "./ChampSelectSide";
import { PickAdvice } from "./PickAdvice";
import { WinProbability } from "./WinProbability";
import { champSelectPhaseLabel, champSelectRows, turnInfo } from "./helpers";

export type ChampSelectMirrorProps = {
    state: SerializedChampSelectState;
    analysis: AnalyzePayload | null;
    suggestions: SuggestionsPayload | null;
    /** Milliseconds left in the sub-phase, already counted down locally. */
    remainingMs: number;
    byKey: Map<string, ChampionSummary>;
    /** The frames are arriving over the WebSocket rather than being polled. */
    fromSocket: boolean;
};

/**
 * The champion select, mirrored.
 *
 * This is the at-a-glance view: both sides, the bans, the timer, whose turn it
 * is and what the server's analysis of the current board says. The full board —
 * picking, banning, comparing, undoing — is the draft view's job, and there is
 * a link to it rather than a second copy of it here.
 */
export function ChampSelectMirror({
    state,
    analysis,
    suggestions,
    remainingMs,
    byKey,
    fromSocket,
}: ChampSelectMirrorProps) {
    const allyRows = useMemo(() => champSelectRows(state, "ally"), [state]);
    const opponentRows = useMemo(() => champSelectRows(state, "opponent"), [state]);
    const turn = useMemo(() => turnInfo(state), [state]);
    const urgent = remainingMs > 0 && remainingMs <= 10_000;
    const bench = state.benchChampionKeys ?? [];

    return (
        <Panel
            title="Sélection des champions"
            subtitle={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{champSelectPhaseLabel(state.phase)}</span>
                    {state.isCustom && (
                        <Badge tone="neutral">Partie personnalisée</Badge>
                    )}
                    {state.isSpectating && <Badge tone="neutral">Spectateur</Badge>}
                    <Badge
                        tone={fromSocket ? "positive" : "info"}
                        dot={fromSocket}
                        icon={<Radio className="h-3 w-3" />}
                    >
                        {fromSocket ? "Flux temps réel" : "Relevé du client"}
                    </Badge>
                </span>
            }
            actions={
                <div className="flex items-center gap-3">
                    <span
                        className={cn(
                            "tabular flex items-center gap-1.5 text-lg font-semibold",
                            urgent ? "animate-pulse-soft text-negative" : "text-ink",
                        )}
                        aria-label="Temps restant dans cette phase"
                    >
                        <Timer className="h-4 w-4" aria-hidden />
                        {formatTimer(remainingMs)}
                    </span>
                    <Link
                        to={ROUTES.draft.path}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-control border border-line-strong",
                            "bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-ink",
                            "transition-colors hover:border-gold/50 hover:text-gold",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                        )}
                    >
                        Ouvrir le tableau de draft
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                </div>
            }
        >
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                    {turn ? (
                        <Badge
                            tone={
                                turn.local
                                    ? "gold"
                                    : turn.side === "ally"
                                      ? "ally"
                                      : "enemy"
                            }
                            dot
                        >
                            {turn.label}
                        </Badge>
                    ) : (
                        <Badge tone="neutral">Aucune action en cours</Badge>
                    )}
                    <span className="text-xs text-ink-muted">
                        Les champions survolés sont pris en compte dans l'analyse tant
                        qu'ils ne sont pas verrouillés.
                    </span>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)_minmax(0,1fr)]">
                    <div className="flex flex-col gap-3">
                        <ChampSelectSide
                            side="ally"
                            title="Votre équipe"
                            rows={allyRows}
                            byKey={byKey}
                        />
                        <BanStrip
                            side="ally"
                            label="Bans"
                            championKeys={state.bans?.ally ?? []}
                            byKey={byKey}
                        />
                    </div>

                    <div className="flex flex-col gap-4 rounded-card border border-line bg-surface-2/50 p-3">
                        <WinProbability
                            analysis={analysis}
                            allyLabel="Votre équipe"
                            enemyLabel="Équipe adverse"
                            note="Analyse recalculée par le serveur à chaque changement du client."
                        />
                        <PickAdvice
                            suggestions={suggestions}
                            role={state.localPlayer?.assignedRole ?? null}
                        />
                    </div>

                    <div className="flex flex-col gap-3">
                        <ChampSelectSide
                            side="opponent"
                            title="Équipe adverse"
                            rows={opponentRows}
                            byKey={byKey}
                        />
                        <BanStrip
                            side="opponent"
                            label="Bans"
                            championKeys={state.bans?.opponent ?? []}
                            byKey={byKey}
                        />
                    </div>
                </div>

                {bench.length > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-ink-subtle">
                            Banc
                        </span>
                        <ul className="flex flex-wrap items-center gap-1">
                            {bench.map((championKey) => (
                                <li key={championKey}>
                                    <ChampionAvatar
                                        size="xs"
                                        champion={
                                            byKey.get(championKey) ?? {
                                                key: championKey,
                                            }
                                        }
                                        name={
                                            byKey.get(championKey)?.name ??
                                            `#${championKey}`
                                        }
                                    />
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </Panel>
    );
}
