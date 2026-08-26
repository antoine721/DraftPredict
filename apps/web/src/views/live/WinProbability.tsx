import type { ReactNode } from "react";
import { Gauge, Info } from "lucide-react";
import type { AnalyzePayload } from "../../api/types";
import { cn } from "../../lib/cn";
import {
    NBSP,
    formatCount,
    formatPercent,
    formatSignedPercent,
} from "../../lib/format";
import { winrateTextClass } from "../../lib/winrate";
import { DeltaBar, Skeleton, Tooltip, VersusBar, WinrateBar } from "../../ui";
import { breakdownRows, smallestSample } from "./helpers";

export type WinProbabilityProps = {
    analysis: AnalyzePayload | null;
    /** Name of the watched side, e.g. "Votre équipe" or "Équipe bleue". */
    allyLabel?: string;
    enemyLabel?: string;
    /** Extra line under the gauge — where the numbers come from. */
    note?: ReactNode;
    isLoading?: boolean;
    className?: string;
};

/**
 * The prediction, compact: one probability, one bar, four contributions.
 *
 * This is the *at-a-glance* version — the draft view owns the full breakdown.
 * Two things are non-negotiable here: the 50 % reference is always drawn (a
 * bare "53 %" says nothing without it), and the smallest sample the number
 * rests on is printed next to it.
 */
export function WinProbability({
    analysis,
    allyLabel = "Votre équipe",
    enemyLabel = "Équipe adverse",
    note,
    isLoading = false,
    className,
}: WinProbabilityProps) {
    if (!analysis) {
        return (
            <div className={cn("flex flex-col gap-3", className)}>
                {isLoading ? (
                    <>
                        <Skeleton className="h-10 w-32" />
                        <Skeleton className="h-2.5 w-full" />
                        <Skeleton className="h-1.5 w-full" />
                    </>
                ) : (
                    <p className="text-sm text-ink-muted">
                        Aucune analyse disponible pour cette partie : le moteur a besoin
                        des dix champions et d'un jeu de données chargé.
                    </p>
                )}
            </div>
        );
    }

    const winrate = analysis.result.winrate;
    const rows = breakdownRows(analysis);
    const sample = smallestSample(analysis);

    return (
        <div className={cn("flex flex-col gap-3", className)}>
            <div className="flex items-end justify-between gap-4">
                <div className="flex flex-col">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-ink-subtle uppercase">
                        <Gauge className="h-3.5 w-3.5" aria-hidden />
                        Probabilité de victoire
                    </span>
                    <span
                        className={cn(
                            "tabular text-3xl leading-tight font-semibold",
                            winrateTextClass(winrate),
                        )}
                    >
                        {formatPercent(winrate)}
                    </span>
                    <span className="text-xs text-ink-muted">
                        {allyLabel} — {formatSignedPercent(winrate - 0.5)} par rapport à
                        une partie équilibrée
                    </span>
                </div>
                <Tooltip
                    wide
                    content="Probabilité estimée à partir des winrates de champions, des synergies et des duels de voie du jeu de données. Elle ne connaît ni le niveau des joueurs, ni la forme du jour."
                >
                    <span className="flex items-center gap-1 text-xs text-ink-subtle">
                        <Info className="h-3.5 w-3.5" aria-hidden />
                        Comment&nbsp;?
                    </span>
                </Tooltip>
            </div>

            <WinrateBar winrate={winrate} size="lg" hideValue showMidpoint />
            <VersusBar
                allyShare={winrate}
                allyLabel={`${allyLabel} ${formatPercent(winrate)}`}
                enemyLabel={`${enemyLabel} ${formatPercent(1 - winrate)}`}
            />

            <ul className="flex flex-col gap-2 pt-1">
                {rows.map((row) => (
                    <li key={row.id} className="flex flex-col gap-1">
                        <DeltaBar
                            delta={row.effect}
                            scale={0.04}
                            label={
                                <span className="flex items-center gap-1.5">
                                    {row.label}
                                    <span className="text-ink-subtle">
                                        ({row.entries})
                                    </span>
                                </span>
                            }
                        />
                        {row.minGames > 0 && (
                            <span className="pl-0.5 text-[11px] text-ink-subtle">
                                échantillon le plus faible du groupe&nbsp;:{" "}
                                {formatCount(row.minGames)} parties
                            </span>
                        )}
                    </li>
                ))}
            </ul>

            <p className="text-xs text-ink-subtle">
                {sample
                    ? `Toute l'estimation repose au minimum sur ${formatCount(sample.games)}${NBSP}parties (${sample.label}).`
                    : "Le jeu de données ne fournit aucun échantillon pour cette composition."}
            </p>
            {note !== undefined && <div className="text-xs text-ink-muted">{note}</div>}
        </div>
    );
}
