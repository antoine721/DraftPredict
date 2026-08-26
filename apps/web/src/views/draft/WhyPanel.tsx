import { useMemo } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { DraftBreakdown } from "../../api/types";
import { cn } from "../../lib/cn";
import { formatSignedPercent } from "../../lib/format";
import { deltaColor } from "../../lib/winrate";
import { ChampionAvatar, Tooltip } from "../../ui";
import {
    collectFactors,
    factorLabel,
    factorReason,
    topFactors,
    type Factor,
} from "./helpers";

export type WhyPanelProps = {
    breakdown: DraftBreakdown | undefined;
    /** How many factors per side. */
    count?: number;
};

/**
 * "Pourquoi ?" — the five things helping you most and the five hurting you
 * most, in plain French.
 *
 * This is the panel a player reads while the timer runs, so it says what the
 * factor *is* (a duo, a matchup, a champion) rather than showing another bar.
 */
export function WhyPanel({ breakdown, count = 5 }: WhyPanelProps) {
    const { positive, negative } = useMemo(
        () => topFactors(collectFactors(breakdown), count),
        [breakdown, count],
    );

    if (positive.length === 0 && negative.length === 0) {
        return (
            <p className="text-sm text-ink-muted">
                Placez des champions dans les deux équipes : les facteurs apparaîtront
                dès qu'il y a de quoi comparer.
            </p>
        );
    }

    return (
        <div className="grid gap-5 md:grid-cols-2">
            <FactorColumn
                title="Ce qui vous aide"
                icon={<ThumbsUp className="h-3.5 w-3.5" />}
                tone="text-winrate-good"
                factors={positive}
                empty="Rien ne joue en votre faveur pour l'instant."
            />
            <FactorColumn
                title="Ce qui vous pénalise"
                icon={<ThumbsDown className="h-3.5 w-3.5" />}
                tone="text-winrate-terrible"
                factors={negative}
                empty="Aucun point faible identifié."
            />
        </div>
    );
}

function FactorColumn({
    title,
    icon,
    tone,
    factors,
    empty,
}: {
    title: string;
    icon: React.ReactNode;
    tone: string;
    factors: Factor[];
    empty: string;
}) {
    return (
        <section className="flex min-w-0 flex-col gap-2">
            <h3
                className={cn(
                    "flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase",
                    tone,
                )}
            >
                {icon}
                {title}
            </h3>
            {factors.length === 0 ? (
                <p className="text-xs text-ink-subtle">{empty}</p>
            ) : (
                <ol className="flex flex-col gap-1.5">
                    {factors.map((factor) => (
                        <li key={factor.id}>
                            <Tooltip
                                content={factorReason(factor)}
                                wide
                                side="top"
                                wrapperClassName="block w-full"
                            >
                                <div className="flex w-full items-center gap-2">
                                    <span className="flex shrink-0 -space-x-2">
                                        {factor.entry.champions.map(
                                            (champion, index) => (
                                                <ChampionAvatar
                                                    key={`${champion.key}-${index}`}
                                                    champion={champion}
                                                    size="xs"
                                                    ring={
                                                        factor.kind === "matchup"
                                                            ? index === 0
                                                                ? "ally"
                                                                : "enemy"
                                                            : factor.side === "ally"
                                                              ? "ally"
                                                              : "enemy"
                                                    }
                                                />
                                            ),
                                        )}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-xs text-ink">
                                        {factorLabel(factor)}
                                    </span>
                                    <span
                                        className="tabular shrink-0 text-xs font-semibold"
                                        style={{ color: deltaColor(factor.effect) }}
                                    >
                                        {formatSignedPercent(factor.effect)}
                                    </span>
                                </div>
                            </Tooltip>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
