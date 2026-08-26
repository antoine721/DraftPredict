import type { ReactNode } from "react";
import type { Role } from "@draftpredict/core";
import type { ChampionSummary } from "../../api";
import { cn } from "../../lib/cn";
import { formatCount, formatPercent, roleLabels, roleLongLabels } from "../../lib";
import { winrateTextClass } from "../../lib/winrate";
import { Badge, ChampionAvatar, Panel, RoleIcon, Stat, Tooltip } from "../../ui";
import { DamageBar } from "./DamageBar";
import { SampleSize } from "./Metrics";
import { TierBadge } from "./TierBadge";
import { BANRATE_EXPLANATION, PICKRATE_EXPLANATION, tagLabel } from "./labels";
import { isThinSample, type ChampionRoleRow, type TierEstimate } from "./stats";

/**
 * The identity card of a champion in a role.
 *
 * The role selector only offers roles the dataset actually knows about: a tab
 * for a role played twelve times would promise numbers that do not exist.
 */
export function ChampionHeader({
    champion,
    roles,
    role,
    row,
    tier,
    onRoleChange,
    actions,
    loading = false,
}: {
    champion: ChampionSummary;
    /** Roles with enough games to be worth showing. */
    roles: readonly ChampionRoleRow[];
    role: Role;
    row: ChampionRoleRow | null;
    tier: TierEstimate | null;
    onRoleChange: (role: Role) => void;
    actions?: ReactNode;
    /** The dataset is still downloading — say so instead of "no data". */
    loading?: boolean;
}) {
    return (
        <Panel className="overflow-visible">
            <div className="flex flex-col gap-5 p-4 lg:flex-row lg:items-start lg:gap-6">
                <div className="flex min-w-0 items-start gap-4">
                    <ChampionAvatar champion={champion} size="xl" ring="gold" />
                    <div className="min-w-0">
                        <h1 className="text-2xl leading-tight font-semibold text-ink-strong">
                            {champion.name}
                        </h1>
                        <p className="text-sm text-ink-muted">{champion.title}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {champion.tags.map((tag) => (
                                <Badge key={tag} tone="neutral">
                                    {tagLabel(tag)}
                                </Badge>
                            ))}
                            <Badge tone="offline">#{champion.key}</Badge>
                        </div>
                    </div>
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div
                            role="group"
                            aria-label="Choisir le rôle"
                            className="flex flex-wrap gap-1.5"
                        >
                            {roles.length === 0 ? (
                                <p className="text-xs text-ink-subtle">
                                    {loading
                                        ? "Chargement des statistiques par rôle…"
                                        : "Aucun rôle suffisamment joué dans ce jeu de données."}
                                </p>
                            ) : (
                                roles.map((candidate) => {
                                    const active = candidate.role === role;
                                    return (
                                        <button
                                            key={candidate.role}
                                            type="button"
                                            onClick={() => onRoleChange(candidate.role)}
                                            aria-pressed={active}
                                            className={cn(
                                                "inline-flex items-center gap-2 rounded-control border px-2.5 py-1.5 text-xs font-medium transition-colors",
                                                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                                                active
                                                    ? "border-gold/50 bg-gold/12 text-gold"
                                                    : "border-line bg-surface-2 text-ink-muted hover:text-ink",
                                            )}
                                        >
                                            <RoleIcon role={candidate.role} size="sm" />
                                            {roleLongLabels[candidate.role]}
                                            <span className="tabular text-[11px] text-ink-subtle">
                                                {formatPercent(candidate.roleShare, 0)}
                                            </span>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                        {actions}
                    </div>

                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                        <Stat
                            label="Winrate"
                            value={row ? formatPercent(row.winrate) : "—"}
                            valueClassName={
                                row && !isThinSample(row.games)
                                    ? winrateTextClass(row.winrate)
                                    : "text-ink-subtle"
                            }
                            hint={
                                row ? (
                                    <SampleSize games={row.games} wins={row.wins} />
                                ) : (
                                    "aucune donnée"
                                )
                            }
                            tooltip={
                                row
                                    ? `Winrate brut de ${champion.name} en ${roleLongLabels[role]} sur l'échantillon du patch. Lissé, il vaut ${formatPercent(row.adjustedWinrate)}.`
                                    : undefined
                            }
                        />
                        <Stat
                            label="Sélection"
                            value={row ? formatPercent(row.pickrate, 1) : "—"}
                            hint={
                                row
                                    ? `${formatPercent(row.roleShare, 0)} de ses parties`
                                    : "—"
                            }
                            tooltip={PICKRATE_EXPLANATION}
                        />
                        <Stat
                            label="Bans"
                            value="n/d"
                            valueClassName="text-ink-subtle"
                            hint="non fourni"
                            tooltip={BANRATE_EXPLANATION}
                        />
                        <Stat
                            label="Parties"
                            value={row ? formatCount(row.games) : "—"}
                            hint={row ? `${formatCount(row.wins)} victoires` : "—"}
                        />
                        <Stat
                            label="Tier estimé"
                            value={
                                <span className="flex items-center gap-2">
                                    <TierBadge estimate={tier} size="md" />
                                    <span className="text-sm font-normal text-ink-muted">
                                        {tier ? `${roleLabels[role]}` : "non classé"}
                                    </span>
                                </span>
                            }
                        />
                    </div>

                    <div className="max-w-md">
                        <Tooltip content="Répartition des dégâts infligés aux champions dans ce rôle.">
                            <span className="text-[11px] font-medium tracking-wider text-ink-subtle uppercase">
                                Profil de dégâts
                            </span>
                        </Tooltip>
                        <DamageBar
                            className="mt-1.5"
                            profile={row?.damage ?? { magic: 0, physical: 0, true: 0 }}
                        />
                    </div>
                </div>
            </div>
        </Panel>
    );
}
