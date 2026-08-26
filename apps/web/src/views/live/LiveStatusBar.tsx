import { MonitorPlay, RefreshCw, Search, Timer } from "lucide-react";
import type { LcuStatus } from "../../api/types";
import { cn } from "../../lib/cn";
import { Badge, Button } from "../../ui";
import {
    clientState,
    pollingSentence,
    type LiveTarget,
    type PollingState,
} from "./helpers";

export type LiveStatusBarProps = {
    status: LcuStatus | null;
    target: (LiveTarget & { label: string }) | null;
    polling: PollingState;
    isFetching: boolean;
    onRefresh: () => void;
    /** `true` while champion select is being mirrored. */
    mirroring: boolean;
};

/**
 * The one-line answer to "est-ce que ça marche, là, maintenant ?".
 *
 * Everything else on this screen can be empty; this strip is always populated,
 * because a live view whose state is invisible is a live view nobody trusts.
 */
export function LiveStatusBar({
    status,
    target,
    polling,
    isFetching,
    onRefresh,
    mirroring,
}: LiveStatusBarProps) {
    const state = clientState(status);

    return (
        <div
            className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-panel border px-3 py-2",
                mirroring
                    ? "border-positive/40 bg-positive/8"
                    : "border-line bg-surface-1/70",
            )}
        >
            <Badge
                tone={state.tone}
                dot={state.live}
                icon={<MonitorPlay className="h-3 w-3" />}
            >
                {state.title}
            </Badge>

            {target ? (
                <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                    {target.source === "search" ? (
                        <Search className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                        <MonitorPlay className="h-3.5 w-3.5" aria-hidden />
                    )}
                    Compte suivi&nbsp;:{" "}
                    <span className="font-medium text-ink">{target.label}</span>
                    <span className="text-ink-subtle">
                        {target.source === "search" ? "(recherche)" : "(client League)"}
                    </span>
                </span>
            ) : (
                <span className="text-xs text-ink-muted">Aucun compte suivi</span>
            )}

            <span className="flex items-center gap-1.5 text-xs text-ink-subtle">
                <Timer className="h-3.5 w-3.5" aria-hidden />
                {pollingSentence(polling)}
            </span>

            <span className="ml-auto">
                <Button
                    variant="ghost"
                    size="sm"
                    loading={isFetching}
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    onClick={onRefresh}
                >
                    Actualiser
                </Button>
            </span>
        </div>
    );
}
