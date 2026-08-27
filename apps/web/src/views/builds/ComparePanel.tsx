import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { Role } from "@draftpredict/core";
import type { BuildEntry, BuildsPayload, ChampionSummary } from "../../api";
import { useBuilds } from "../../api";
import { cn } from "../../lib/cn";
import { formatCount, formatPercent, formatSigned, roleLongLabels } from "../../lib";
import {
    Button,
    ChampionAvatar,
    ErrorState,
    ItemIcon,
    LoadingState,
    Panel,
    RuneIcon,
    Select,
    SkillIcon,
    SpellIcon,
} from "../../ui";
import { DeltaValue, SampleSize, WinrateValue } from "./Metrics";
import { TierBadge } from "./TierBadge";
import { bestEntry, entryLabel, fullBuild, skillLetters } from "./build-helpers";
import { DAMAGE_SHORT_LABEL } from "./labels";
import { damageKind, type ChampionRoleRow, type TierEstimate } from "./stats";

/**
 * Two champions, one role, side by side.
 *
 * Only comparable things are compared: the same role, the same dataset, the
 * same buckets of the same build route. The better of the two values is
 * highlighted, and every winrate keeps its sample size — a comparison is
 * exactly where a 40-game sample would be most tempting to over-read.
 */

export type CompareSide = {
    champion: ChampionSummary;
    row: ChampionRoleRow | null;
    tier: TierEstimate | null;
};

export function ComparePanel({
    role,
    left,
    right,
    options,
    onChangeRight,
    onClose,
}: {
    role: Role;
    left: CompareSide;
    right: CompareSide;
    /** Champions with data in this role. */
    options: readonly ChampionSummary[];
    onChangeRight: (championKey: string) => void;
    onClose: () => void;
}) {
    const leftBuilds = useBuilds(left.champion.key, { role });
    const rightBuilds = useBuilds(right.champion.key, { role });

    const error = leftBuilds.error ?? rightBuilds.error;

    return (
        <Panel
            title="Comparaison"
            subtitle={`${left.champion.name} et ${right.champion.name} en ${roleLongLabels[role]}`}
            actions={
                <div className="flex items-center gap-2">
                    <Select
                        size="sm"
                        aria-label="Champion comparé"
                        containerClassName="w-auto"
                        value={right.champion.key}
                        onValueChange={onChangeRight}
                        options={options.map((champion) => ({
                            value: champion.key,
                            label: champion.name,
                        }))}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<X className="h-3.5 w-3.5" />}
                        onClick={onClose}
                    >
                        Fermer
                    </Button>
                </div>
            }
        >
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-line pb-3">
                <SideHeader side={left} align="left" />
                <span className="text-xs font-semibold text-ink-subtle">vs</span>
                <SideHeader side={right} align="right" />
            </div>

            <dl className="divide-y divide-line-soft">
                <CompareRow
                    label="Winrate"
                    left={
                        left.row ? (
                            <WinrateValue
                                winrate={left.row.winrate}
                                games={left.row.games}
                            />
                        ) : (
                            "—"
                        )
                    }
                    right={
                        right.row ? (
                            <WinrateValue
                                winrate={right.row.winrate}
                                games={right.row.games}
                            />
                        ) : (
                            "—"
                        )
                    }
                    better={compare(
                        left.row?.adjustedWinrate,
                        right.row?.adjustedWinrate,
                    )}
                />
                <CompareRow
                    label="Winrate lissé"
                    left={left.row ? formatPercent(left.row.adjustedWinrate) : "—"}
                    right={right.row ? formatPercent(right.row.adjustedWinrate) : "—"}
                    better={compare(
                        left.row?.adjustedWinrate,
                        right.row?.adjustedWinrate,
                    )}
                />
                <CompareRow
                    label="Sélection dans le rôle"
                    left={left.row ? formatPercent(left.row.pickrate, 1) : "—"}
                    right={right.row ? formatPercent(right.row.pickrate, 1) : "—"}
                    better={compare(left.row?.pickrate, right.row?.pickrate)}
                />
                <CompareRow
                    label="Échantillon"
                    left={
                        left.row ? (
                            <SampleSize games={left.row.games} wins={left.row.wins} />
                        ) : (
                            "—"
                        )
                    }
                    right={
                        right.row ? (
                            <SampleSize games={right.row.games} wins={right.row.wins} />
                        ) : (
                            "—"
                        )
                    }
                    better={compare(left.row?.games, right.row?.games)}
                />
                <CompareRow
                    label="Tier estimé"
                    left={
                        <span className="inline-flex items-center gap-2">
                            <TierBadge estimate={left.tier} />
                            {left.tier
                                ? `${formatSigned(left.tier.score, 2)} σ`
                                : "non classé"}
                        </span>
                    }
                    right={
                        <span className="inline-flex items-center gap-2">
                            {right.tier
                                ? `${formatSigned(right.tier.score, 2)} σ`
                                : "non classé"}
                            <TierBadge estimate={right.tier} />
                        </span>
                    }
                    better={compare(left.tier?.score, right.tier?.score)}
                />
                <CompareRow
                    label="Dégâts"
                    left={
                        left.row ? DAMAGE_SHORT_LABEL[damageKind(left.row.damage)] : "—"
                    }
                    right={
                        right.row
                            ? DAMAGE_SHORT_LABEL[damageKind(right.row.damage)]
                            : "—"
                    }
                    better={null}
                />
            </dl>

            {error ? (
                <ErrorState
                    size="sm"
                    error={error}
                    title="Builds indisponibles"
                    onRetry={() => {
                        void leftBuilds.refetch();
                        void rightBuilds.refetch();
                    }}
                />
            ) : leftBuilds.isLoading || rightBuilds.isLoading ? (
                <LoadingState label="Chargement des deux builds…" />
            ) : (
                <div className="mt-4 flex flex-col gap-0">
                    <h3 className="mb-2 text-xs font-medium text-ink-subtle">
                        Choix recommandés
                    </h3>
                    <dl className="divide-y divide-line-soft">
                        <BuildCompareRow
                            label="Objet de départ"
                            left={bestEntry(leftBuilds.data?.items.startingSets ?? [])}
                            right={bestEntry(
                                rightBuilds.data?.items.startingSets ?? [],
                            )}
                            render={(entry) => (
                                <ItemIcon
                                    id={entry.id}
                                    name={entry.name}
                                    src={entry.icon}
                                    size="sm"
                                />
                            )}
                        />
                        <BuildCompareRow
                            label="Bottes"
                            left={bestEntry(leftBuilds.data?.items.boots ?? [])}
                            right={bestEntry(rightBuilds.data?.items.boots ?? [])}
                            render={(entry) => (
                                <ItemIcon
                                    id={entry.id}
                                    name={entry.name}
                                    src={entry.icon}
                                    size="sm"
                                />
                            )}
                        />
                        <BuildCompareRow
                            label="Premier objet"
                            left={firstItem(leftBuilds.data)}
                            right={firstItem(rightBuilds.data)}
                            render={(entry) => (
                                <ItemIcon
                                    id={entry.id}
                                    name={entry.name}
                                    src={entry.icon}
                                    size="sm"
                                />
                            )}
                        />
                        <BuildCompareRow
                            label="Rune clé"
                            left={bestEntry(leftBuilds.data?.runes.primary ?? [])}
                            right={bestEntry(rightBuilds.data?.runes.primary ?? [])}
                            render={(entry) => (
                                <RuneIcon
                                    src={entry.icon}
                                    name={entry.name}
                                    size="sm"
                                    keystone
                                />
                            )}
                        />
                        <BuildCompareRow
                            label="Sorts"
                            left={bestEntry(leftBuilds.data?.summonerSpells ?? [])}
                            right={bestEntry(rightBuilds.data?.summonerSpells ?? [])}
                            render={(entry) => (
                                <SpellIcon
                                    src={entry.icon}
                                    name={entry.name}
                                    size="sm"
                                />
                            )}
                        />
                        <BuildCompareRow
                            label="Maximisation"
                            left={bestEntry(leftBuilds.data?.skills.order ?? [])}
                            right={bestEntry(rightBuilds.data?.skills.order ?? [])}
                            render={(entry) => (
                                <SkillIcon
                                    slot={skillLetters(entry.id)[0] ?? "?"}
                                    size="xs"
                                    active
                                />
                            )}
                        />
                    </dl>
                </div>
            )}
        </Panel>
    );
}

function firstItem(payload: BuildsPayload | undefined): BuildEntry | null {
    if (!payload) return null;
    return fullBuild(payload.items).path[0] ?? null;
}

function compare(
    left: number | undefined,
    right: number | undefined,
): "left" | "right" | null {
    if (left === undefined || right === undefined) return null;
    if (Math.abs(left - right) < 1e-9) return null;
    return left > right ? "left" : "right";
}

function SideHeader({ side, align }: { side: CompareSide; align: "left" | "right" }) {
    return (
        <div
            className={cn(
                "flex min-w-0 items-center gap-2",
                align === "right" && "flex-row-reverse text-right",
            )}
        >
            <ChampionAvatar champion={side.champion} size="lg" ring="gold" />
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-strong">
                    {side.champion.name}
                </p>
                <p className="truncate text-[11px] text-ink-subtle">
                    {side.champion.title}
                </p>
            </div>
        </div>
    );
}

function CompareRow({
    label,
    left,
    right,
    better,
}: {
    label: string;
    left: ReactNode;
    right: ReactNode;
    better: "left" | "right" | null;
}) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 py-2">
            <dd
                className={cn(
                    "tabular min-w-0 text-sm",
                    better === "left"
                        ? "font-semibold text-ink-strong"
                        : "text-ink-muted",
                )}
            >
                {left}
            </dd>
            <dt className="text-center text-xs text-ink-subtle">{label}</dt>
            <dd
                className={cn(
                    "tabular min-w-0 text-right text-sm",
                    better === "right"
                        ? "font-semibold text-ink-strong"
                        : "text-ink-muted",
                )}
            >
                {right}
            </dd>
        </div>
    );
}

function BuildCompareRow({
    label,
    left,
    right,
    render,
}: {
    label: string;
    left: BuildEntry | null;
    right: BuildEntry | null;
    render: (entry: BuildEntry) => ReactNode;
}) {
    return (
        <CompareRow
            label={label}
            better={compare(left?.winrateDelta, right?.winrateDelta)}
            left={
                left ? (
                    <span className="flex min-w-0 items-center gap-2">
                        {render(left)}
                        <span className="min-w-0">
                            <span className="block truncate text-xs text-ink">
                                {entryLabel(left)}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <WinrateValue
                                    winrate={left.winrate}
                                    games={left.games}
                                    className="text-[11px]"
                                />
                                <DeltaValue
                                    delta={left.winrateDelta}
                                    games={left.games}
                                    className="text-[11px]"
                                />
                                <span className="tabular text-[11px] text-ink-subtle">
                                    {formatCount(left.games)}
                                </span>
                            </span>
                        </span>
                    </span>
                ) : (
                    "—"
                )
            }
            right={
                right ? (
                    <span className="flex min-w-0 flex-row-reverse items-center gap-2">
                        {render(right)}
                        <span className="min-w-0">
                            <span className="block truncate text-xs text-ink">
                                {entryLabel(right)}
                            </span>
                            <span className="flex flex-row-reverse items-center gap-1.5">
                                <WinrateValue
                                    winrate={right.winrate}
                                    games={right.games}
                                    className="text-[11px]"
                                />
                                <DeltaValue
                                    delta={right.winrateDelta}
                                    games={right.games}
                                    className="text-[11px]"
                                />
                                <span className="tabular text-[11px] text-ink-subtle">
                                    {formatCount(right.games)}
                                </span>
                            </span>
                        </span>
                    </span>
                ) : (
                    "—"
                )
            }
        />
    );
}
