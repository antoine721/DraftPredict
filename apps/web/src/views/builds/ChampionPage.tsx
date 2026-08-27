import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Swords } from "lucide-react";
import type { Role } from "@draftpredict/core";
import type {
    ApiError,
    BuildsPayload,
    ChampionDetail,
    ChampionSummary,
    ItemDetail,
    StaticRunesResponse,
} from "../../api";
import { useBuilds, useStaticChampions, useStaticRunes } from "../../api";
import { formatCount, roleLongLabels } from "../../lib";
import {
    Button,
    ChampionAvatar,
    ErrorState,
    LoadingState,
    Panel,
    Select,
    SkeletonList,
    Tabs,
    Tag,
} from "../../ui";
import { ROUTES } from "../../app/routes";
import { ChampionHeader } from "./ChampionHeader";
import { ComparePanel } from "./ComparePanel";
import { ItemBuild } from "./ItemBuild";
import { MatchupTable } from "./MatchupTable";
import { RuneTree } from "./RuneTree";
import { SkillOrder } from "./SkillOrder";
import { StatsPanel } from "./StatsPanel";
import { SummonerSpells } from "./SummonerSpells";
import { SynergyTable } from "./SynergyTable";
import { encodeVersus, playableRoles, type ChampionRoleRow } from "./stats";
import { useItemCatalogue, useMatchupDataset, type ChampionStats } from "./hooks";

export type DetailTab = "build" | "matchups" | "stats";

const TABS: { value: DetailTab; label: string }[] = [
    { value: "build", label: "Build" },
    { value: "matchups", label: "Duels & synergies" },
    { value: "stats", label: "Statistiques" },
];

/**
 * Everything about one champion in one role.
 *
 * The route parameter drives the champion, the query string drives the role,
 * the tab, the matchup and the comparison — so every state of this screen is
 * a URL somebody can paste into a Discord channel.
 */
export function ChampionPage({
    champion,
    byKey,
    champions,
    stats,
    priorGames,
    role,
    tab,
    versus,
    compareWith,
    onRoleChange,
    onTabChange,
    onVersusChange,
    onCompareChange,
}: {
    champion: ChampionSummary;
    byKey: Map<string, ChampionSummary>;
    champions: readonly ChampionSummary[];
    stats: ChampionStats;
    priorGames: number;
    role: Role;
    tab: DetailTab;
    versus: string | null;
    compareWith: string | null;
    onRoleChange: (role: Role) => void;
    onTabChange: (tab: DetailTab) => void;
    onVersusChange: (championKey: string | null) => void;
    onCompareChange: (championKey: string | null) => void;
}) {
    const championRows = stats.rowsFor(champion.key);
    const roles = useMemo(() => playableRoles(championRows), [championRows]);
    const row: ChampionRoleRow | null =
        championRows.find((candidate) => candidate.role === role) ?? null;
    const tier = stats.tiers.get(`${champion.key}:${role}`) ?? null;

    const builds = useBuilds(champion.key, {
        role,
        vs: versus ? encodeVersus([[versus, role]]) : undefined,
    });
    const runes = useStaticRunes();
    const staticChampions = useStaticChampions();
    const itemsById = useItemCatalogue();

    const matchupData = useMatchupDataset(tab === "matchups");

    const roleOptions = useMemo(
        () =>
            champions
                .filter((candidate) =>
                    stats
                        .rowsFor(candidate.key)
                        .some(
                            (candidateRow) =>
                                candidateRow.role === role && candidateRow.games > 0,
                        ),
                )
                .sort((a, b) => a.name.localeCompare(b.name, "fr")),
        [champions, stats, role],
    );

    const versusChampion = versus ? (byKey.get(versus) ?? null) : null;
    const compareChampion = compareWith ? (byKey.get(compareWith) ?? null) : null;

    const detail =
        staticChampions.data?.champions.find(
            (candidate) => candidate.key === champion.key,
        ) ?? null;

    // A matchup build only means something when the route actually returned
    // matchup rows; otherwise the numbers are the generic ones.
    const versusSupported =
        (builds.data?.matchups.length ?? 0) > 0 &&
        [
            ...(builds.data?.items.boots ?? []),
            ...(builds.data?.runes.primary ?? []),
            ...(builds.data?.summonerSpells ?? []),
        ].some((entry) => entry.matchups.length > 0);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                    to={ROUTES.champions.path}
                    className="inline-flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-gold"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Tous les champions
                </Link>
            </div>

            <ChampionHeader
                champion={champion}
                roles={roles}
                role={role}
                row={row}
                tier={tier}
                loading={stats.isLoading}
                onRoleChange={onRoleChange}
                actions={
                    <div className="flex items-center gap-2">
                        {compareChampion ? (
                            <Tag tone="gold" onRemove={() => onCompareChange(null)}>
                                Comparé à {compareChampion.name}
                            </Tag>
                        ) : (
                            <Select
                                size="sm"
                                aria-label="Comparer avec un autre champion"
                                containerClassName="w-auto"
                                value=""
                                onValueChange={(value) =>
                                    onCompareChange(value || null)
                                }
                                options={[
                                    { value: "", label: "Comparer avec…" },
                                    ...roleOptions
                                        .filter((option) => option.key !== champion.key)
                                        .map((option) => ({
                                            value: option.key,
                                            label: option.name,
                                        })),
                                ]}
                            />
                        )}
                    </div>
                }
            />

            {compareChampion && (
                <ComparePanel
                    role={role}
                    left={{ champion, row, tier }}
                    right={{
                        champion: compareChampion,
                        row:
                            stats
                                .rowsFor(compareChampion.key)
                                .find((candidate) => candidate.role === role) ?? null,
                        tier: stats.tiers.get(`${compareChampion.key}:${role}`) ?? null,
                    }}
                    options={roleOptions.filter(
                        (option) => option.key !== champion.key,
                    )}
                    onChangeRight={(key) => onCompareChange(key)}
                    onClose={() => onCompareChange(null)}
                />
            )}

            <Tabs
                items={TABS}
                value={tab}
                onValueChange={(value) => onTabChange(value)}
                actions={
                    row ? (
                        <span className="hidden text-xs text-ink-subtle sm:block">
                            {roleLongLabels[role]} · {formatCount(row.games)} parties
                        </span>
                    ) : null
                }
            >
                {(value) => (
                    <div className="pt-4">
                        {value === "build" && (
                            <BuildTab
                                championName={champion.name}
                                role={role}
                                versus={versus}
                                versusChampion={versusChampion}
                                versusSupported={versusSupported}
                                roleOptions={roleOptions.filter(
                                    (option) => option.key !== champion.key,
                                )}
                                onVersusChange={onVersusChange}
                                payload={builds.data ?? null}
                                isLoading={builds.isLoading}
                                error={builds.error ?? null}
                                onRetry={() => void builds.refetch()}
                                runes={runes.data}
                                detail={detail}
                                itemsById={itemsById}
                            />
                        )}

                        {value === "matchups" &&
                            (matchupData.isLoading ? (
                                <Panel title="Duels & synergies">
                                    <LoadingState label="Chargement de l'échantillon 30 jours (matrice complète des duels)…" />
                                    <p className="text-center text-xs text-ink-subtle">
                                        Cette matrice n'est pas incluse dans les données
                                        du patch : elle est téléchargée une seule fois
                                        par session.
                                    </p>
                                </Panel>
                            ) : matchupData.error ? (
                                <Panel title="Duels & synergies">
                                    <ErrorState
                                        error={matchupData.error}
                                        title="Matrice des duels indisponible"
                                        onRetry={matchupData.refetch}
                                    />
                                </Panel>
                            ) : matchupData.dataset ? (
                                <div className="flex flex-col gap-4">
                                    <MatchupTable
                                        dataset={matchupData.dataset}
                                        championKey={champion.key}
                                        championName={champion.name}
                                        role={role}
                                        priorGames={priorGames}
                                        byKey={byKey}
                                        versus={versus}
                                        onVersusChange={(key) => {
                                            onVersusChange(key);
                                            if (key) onTabChange("build");
                                        }}
                                    />
                                    <SynergyTable
                                        dataset={matchupData.dataset}
                                        championKey={champion.key}
                                        championName={champion.name}
                                        role={role}
                                        priorGames={priorGames}
                                        byKey={byKey}
                                    />
                                </div>
                            ) : null)}

                        {value === "stats" && (
                            <StatsPanel
                                championName={champion.name}
                                role={role}
                                row={row}
                                tier={tier}
                                index={stats.index}
                                statsByTime={row?.statsByTime}
                                priorGames={priorGames}
                            />
                        )}
                    </div>
                )}
            </Tabs>
        </div>
    );
}

function BuildTab({
    championName,
    role,
    versus,
    versusChampion,
    versusSupported,
    roleOptions,
    onVersusChange,
    payload,
    isLoading,
    error,
    onRetry,
    runes,
    detail,
    itemsById,
}: {
    championName: string;
    role: Role;
    versus: string | null;
    versusChampion: ChampionSummary | null;
    versusSupported: boolean;
    roleOptions: readonly ChampionSummary[];
    onVersusChange: (championKey: string | null) => void;
    payload: BuildsPayload | null;
    isLoading: boolean;
    error: ApiError | null;
    onRetry: () => void;
    runes: StaticRunesResponse | undefined;
    detail: ChampionDetail | null;
    itemsById: Map<number, ItemDetail>;
}) {
    if (isLoading && !payload) {
        return (
            <Panel title="Build">
                <SkeletonList rows={6} />
            </Panel>
        );
    }

    if (error && !payload) {
        return (
            <Panel title="Build">
                <ErrorState
                    error={error}
                    title="Build indisponible"
                    onRetry={onRetry}
                />
            </Panel>
        );
    }

    if (!payload) return null;

    const enemyName = versusChampion?.name ?? null;
    const activeVersus = versusSupported ? versus : null;

    return (
        <div className="flex flex-col gap-4">
            <Panel
                title="Build adapté au duel"
                subtitle={`Ajuste chaque choix en fonction de l'adversaire direct en ${roleLongLabels[role]}`}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Select
                            size="sm"
                            aria-label="Adversaire direct"
                            containerClassName="w-auto"
                            value={versus ?? ""}
                            onValueChange={(value) => onVersusChange(value || null)}
                            options={[
                                { value: "", label: "Aucun (build générique)" },
                                ...roleOptions.map((option) => ({
                                    value: option.key,
                                    label: `vs ${option.name}`,
                                })),
                            ]}
                        />
                        {versus && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onVersusChange(null)}
                            >
                                Réinitialiser
                            </Button>
                        )}
                    </div>
                }
            >
                {versusChampion ? (
                    <div className="flex flex-wrap items-center gap-3">
                        <ChampionAvatar
                            champion={versusChampion}
                            size="sm"
                            ring="enemy"
                        />
                        <p className="min-w-0 flex-1 text-xs text-ink-muted">
                            {versusSupported ? (
                                <>
                                    Les notes ci-dessous incluent l'apport propre au
                                    duel{" "}
                                    <span className="text-ink">
                                        {championName} contre {versusChampion.name}
                                    </span>{" "}
                                    : la colonne «&nbsp;vs&nbsp;» isole cet apport, la
                                    colonne «&nbsp;apport&nbsp;» le contient déjà.
                                </>
                            ) : (
                                <>
                                    Le jeu de données ne contient pas assez de parties{" "}
                                    {championName} contre {versusChampion.name} en{" "}
                                    {roleLongLabels[role]} : les chiffres affichés
                                    restent ceux du build générique.
                                </>
                            )}
                        </p>
                    </div>
                ) : (
                    <p className="flex items-center gap-2 text-xs text-ink-muted">
                        <Swords className="h-3.5 w-3.5 text-ink-subtle" />
                        Choisissez un adversaire pour pondérer chaque objet, rune et
                        sort par le duel de voie.
                    </p>
                )}
            </Panel>

            <ItemBuild
                items={payload.items}
                itemsById={itemsById}
                enemyKey={activeVersus}
                enemyName={enemyName}
            />

            <RuneTree
                runes={payload.runes}
                staticRunes={runes}
                enemyKey={activeVersus}
                enemyName={enemyName}
            />

            <div className="grid gap-4 xl:grid-cols-2">
                <SummonerSpells
                    spells={payload.summonerSpells}
                    enemyKey={activeVersus}
                    enemyName={enemyName}
                />
                <SkillOrder
                    skills={payload.skills}
                    champion={detail}
                    enemyKey={activeVersus}
                    enemyName={enemyName}
                />
            </div>
        </div>
    );
}
