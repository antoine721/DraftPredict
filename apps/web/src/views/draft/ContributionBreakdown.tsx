import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { DraftBreakdown } from "../../api/types";
import { cn } from "../../lib/cn";
import { formatCount, formatPercent, formatSigned } from "../../lib/format";
import { Badge, ChampionAvatar, DeltaBar, EmptyState, Tooltip } from "../../ui";
import {
    collectFactors,
    entryWinrate,
    factorLabel,
    factorReason,
    type Factor,
    type FactorKind,
} from "./helpers";

export type ContributionBreakdownProps = {
    breakdown: DraftBreakdown | undefined;
};

const SECTIONS: { kind: FactorKind; title: string; hint: string }[] = [
    {
        kind: "champion",
        title: "Force des champions",
        hint: "Winrate propre de chaque champion dans son rôle, des deux côtés.",
    },
    {
        kind: "duo",
        title: "Synergies",
        hint: "Ce que chaque paire gagne — ou perd — à jouer ensemble, dans les deux équipes.",
    },
    {
        kind: "matchup",
        title: "Affrontements",
        hint: "Chaque duel allié / adversaire, tous rôles confondus.",
    },
];

const COLLAPSED_ROWS = 6;

/**
 * Where the win probability comes from.
 *
 * Every bar is signed *for you*: an enemy champion's own strength is negated
 * on the way in, so green always means "this helps you". The ordering uses the
 * additive rating, because win-probability deltas do not sum.
 */
export function ContributionBreakdown({ breakdown }: ContributionBreakdownProps) {
    const factors = useMemo(() => collectFactors(breakdown), [breakdown]);

    if (factors.length === 0) {
        return (
            <EmptyState
                size="sm"
                title="Rien à décomposer pour l'instant"
                description="Placez au moins un champion pour voir d'où vient la probabilité."
            />
        );
    }

    return (
        <div className="flex flex-col gap-5">
            {SECTIONS.map((section) => (
                <Section
                    key={section.kind}
                    title={section.title}
                    hint={section.hint}
                    factors={factors.filter((factor) => factor.kind === section.kind)}
                />
            ))}
        </div>
    );
}

function Section({
    title,
    hint,
    factors,
}: {
    title: string;
    hint: string;
    factors: Factor[];
}) {
    const [expanded, setExpanded] = useState(false);
    const sorted = useMemo(
        () => [...factors].sort((a, b) => Math.abs(b.rating) - Math.abs(a.rating)),
        [factors],
    );
    const net = factors.reduce((total, factor) => total + factor.rating, 0);
    const rows = expanded ? sorted : sorted.slice(0, COLLAPSED_ROWS);
    const scale = Math.max(
        0.02,
        ...sorted.map((factor) => Math.abs(factor.entry.winrateDelta)),
    );

    return (
        <section className="flex flex-col gap-2">
            <header className="flex items-center justify-between gap-3">
                <Tooltip content={hint} wide side="right">
                    <h3 className="text-xs font-semibold text-ink-muted">{title}</h3>
                </Tooltip>
                <Badge tone={net >= 0 ? "positive" : "negative"}>
                    <span className="tabular">{formatSigned(net, 1)} pts</span>
                </Badge>
            </header>

            {sorted.length === 0 ? (
                <p className="text-xs text-ink-subtle">
                    Aucune donnée : il faut au moins deux champions concernés.
                </p>
            ) : (
                <ul className="flex flex-col gap-1.5">
                    {rows.map((factor) => (
                        <FactorRow key={factor.id} factor={factor} scale={scale} />
                    ))}
                </ul>
            )}

            {sorted.length > COLLAPSED_ROWS && (
                <button
                    type="button"
                    onClick={() => setExpanded((open) => !open)}
                    className="flex items-center gap-1 self-start text-xs text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-gold"
                >
                    <ChevronDown
                        aria-hidden
                        className={cn(
                            "h-3.5 w-3.5 transition-transform",
                            expanded && "rotate-180",
                        )}
                    />
                    {expanded
                        ? "Réduire"
                        : `Afficher les ${sorted.length - COLLAPSED_ROWS} autres`}
                </button>
            )}
        </section>
    );
}

function FactorRow({ factor, scale }: { factor: Factor; scale: number }) {
    const winrate = entryWinrate(factor.entry);
    const tooltip = (
        <span className="flex flex-col gap-1">
            <span>{factorReason(factor)}</span>
            <span className="text-ink-muted">
                Effet sur votre probabilité de victoire :{" "}
                {factor.effect >= 0 ? "positif" : "négatif"}.
            </span>
        </span>
    );

    return (
        <li>
            <Tooltip content={tooltip} wide side="top" wrapperClassName="block w-full">
                <div className="flex w-full items-center gap-2 rounded-control px-1 py-0.5 hover:bg-surface-hover/60">
                    <span className="flex shrink-0 -space-x-2">
                        {factor.entry.champions.map((champion, index) => (
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
                        ))}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs text-ink">
                            {factorLabel(factor)}
                        </span>
                        <span className="tabular truncate text-[10px] text-ink-subtle">
                            {winrate === null
                                ? "aucun échantillon"
                                : `${formatPercent(winrate)} sur ${formatCount(factor.entry.games)} parties`}
                        </span>
                    </span>
                    <DeltaBar
                        delta={factor.effect}
                        scale={scale}
                        className="w-auto flex-1"
                    />
                </div>
            </Tooltip>
        </li>
    );
}
