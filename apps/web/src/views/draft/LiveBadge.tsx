import { Hand, MonitorPlay, Pause, Radio, Timer } from "lucide-react";
import type { LcuStatus, SerializedChampSelectState } from "../../api/types";
import { cn } from "../../lib/cn";
import { formatTimer, roleLongLabels } from "../../lib/format";
import { Badge, Button, Toggle, Tooltip } from "../../ui";
import { phaseLabel } from "./helpers";

export type LiveBadgeProps = {
    status: LcuStatus | null;
    active: boolean;
    state: SerializedChampSelectState | null;
    /** Milliseconds left in the current sub-phase, already counted down. */
    remainingMs: number;
    followClient: boolean;
    onFollowChange: (follow: boolean) => void;
};

/**
 * The champion-select status strip.
 *
 * It answers three questions at a glance: is the board mirroring the League
 * Client, what is happening right now, and how long is left. When the user has
 * edited the board by hand the sync switches itself off — that is a decision
 * the store makes, and this strip is where it becomes visible and reversible.
 */
export function LiveBadge({
    status,
    active,
    state,
    remainingMs,
    followClient,
    onFollowChange,
}: LiveBadgeProps) {
    const connected = status?.connected ?? false;
    const urgent = active && remainingMs > 0 && remainingMs <= 10_000;

    return (
        <div
            className={cn(
                // Sits in the application header: a pill, not a strip.
                "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-control border px-2 py-1",
                active
                    ? followClient
                        ? "border-positive/40 bg-positive/8"
                        : "border-warning/40 bg-warning/8"
                    : "border-line/70 bg-surface-2/60",
            )}
        >
            {active ? (
                followClient ? (
                    <Badge tone="positive" dot icon={<Radio className="h-3 w-3" />}>
                        Synchronisé avec le client
                    </Badge>
                ) : (
                    <Badge tone="warning" icon={<Hand className="h-3 w-3" />}>
                        Édition manuelle
                    </Badge>
                )
            ) : connected ? (
                <Badge tone="info" dot icon={<MonitorPlay className="h-3 w-3" />}>
                    Hors sélection
                </Badge>
            ) : null}

            {active && state && (
                <>
                    <span className="text-xs text-ink-muted">
                        {phaseLabel(state.phase)}
                    </span>
                    <span
                        className={cn(
                            "tabular flex items-center gap-1 text-xs font-semibold",
                            urgent ? "animate-pulse-soft text-negative" : "text-ink",
                        )}
                    >
                        <Timer className="h-3.5 w-3.5" aria-hidden />
                        {formatTimer(remainingMs)}
                    </span>
                    <TurnLabel state={state} />
                </>
            )}

            <span className="ml-auto flex items-center gap-2">
                {active && !followClient && (
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={<Radio className="h-3.5 w-3.5" />}
                        onClick={() => onFollowChange(true)}
                    >
                        Reprendre le suivi
                    </Button>
                )}
                <Tooltip
                    content={
                        status !== null && !status.enabled
                            ? "L'intégration au client League est désactivée dans les paramètres."
                            : "Quand le suivi est actif, chaque changement du client remplace le tableau. Une modification manuelle le désactive."
                    }
                    wide
                    side="left"
                >
                    <Toggle
                        size="sm"
                        checked={followClient}
                        onCheckedChange={onFollowChange}
                        disabled={status !== null && !status.enabled}
                        ariaLabel="Suivre le client League"
                        label={
                            <span className="flex items-center gap-1 text-xs">
                                {followClient ? (
                                    <Radio className="h-3.5 w-3.5" aria-hidden />
                                ) : (
                                    <Pause className="h-3.5 w-3.5" aria-hidden />
                                )}
                                Suivre le client
                            </span>
                        }
                    />
                </Tooltip>
            </span>
        </div>
    );
}

function TurnLabel({ state }: { state: SerializedChampSelectState }) {
    if (state.isLocalPlayerTurn) {
        return (
            <Badge tone="gold" dot>
                À vous de jouer
            </Badge>
        );
    }
    if (state.currentActorCellId === null || state.currentActorCellId === undefined) {
        return null;
    }
    const ally = state.allyPlayers?.find(
        (player) => player.cellId === state.currentActorCellId,
    );
    if (ally) {
        const role = ally.role ?? ally.assignedRole;
        return (
            <span className="text-xs text-ink-muted">
                Tour d'un allié
                {role === null || role === undefined
                    ? ""
                    : ` — ${roleLongLabels[role]}`}
            </span>
        );
    }
    return <span className="text-xs text-ink-muted">Tour de l'équipe adverse</span>;
}
