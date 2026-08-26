import { useCallback, useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { Role } from "@draftpredict/core";
import type { ChampionSummary } from "../../api";
import { useChampionIndex } from "../../api";
import { isRoleValue } from "../../lib";
import { EmptyState, ErrorState, Panel, SkeletonList } from "../../ui";
import { DatasetNotice } from "../../app/DatasetNotice";
import { ROUTES } from "../../app/routes";
import { ChampionIndex } from "./ChampionIndex";
import { ChampionPage, type DetailTab } from "./ChampionPage";
import { useAnalysisPrior, useChampionStats } from "./hooks";
import type { ChampionRoleRow } from "./stats";

/**
 * Champions & builds.
 *
 * Two screens behind one route: the catalogue at `/champions`, and one
 * champion at `/champions/:championKey`. The champion key accepts both the
 * dataset key (`266`) and the Data Dragon id (`Aatrox`), because both appear
 * in links people share.
 */

const TABS: readonly DetailTab[] = ["build", "matchups", "stats"];

/** The role to show: the requested one when it exists, the main one otherwise. */
export function resolveRole(
    rows: readonly ChampionRoleRow[],
    requested: string | null,
): Role {
    const parsed = requested === null ? Number.NaN : Number(requested);
    if (isRoleValue(parsed) && rows.some((row) => row.role === parsed)) return parsed;
    return rows[0]?.role ?? (isRoleValue(parsed) ? parsed : 0);
}

export default function ChampionsView() {
    const params = useParams<{ championKey?: string }>();
    const [search, setSearch] = useSearchParams();

    const index = useChampionIndex();
    const { priorGames } = useAnalysisPrior();
    const stats = useChampionStats(priorGames);

    const requestedKey = params.championKey ?? null;
    const champion: ChampionSummary | null = requestedKey
        ? (index.byKey.get(requestedKey) ?? index.byId.get(requestedKey) ?? null)
        : null;

    const championRows = champion ? stats.rowsFor(champion.key) : [];
    const role = resolveRole(championRows, search.get("role"));

    const tabParam = search.get("tab");
    const tab: DetailTab = TABS.includes(tabParam as DetailTab)
        ? (tabParam as DetailTab)
        : "build";

    const patch = useCallback(
        (updates: Record<string, string | null>) => {
            const next = new URLSearchParams(search);
            for (const [key, value] of Object.entries(updates)) {
                if (value === null || value === "") next.delete(key);
                else next.set(key, value);
            }
            setSearch(next, { replace: true });
        },
        [search, setSearch],
    );

    const datasetNotice = useMemo(
        () =>
            stats.meta ? (
                <DatasetNotice
                    source={{
                        provider: stats.meta.provider,
                        description:
                            "Les statistiques par champion sont calculées dans le navigateur à partir du jeu de données synthétique fourni hors-ligne",
                        offline: stats.meta.offline,
                    }}
                />
            ) : null,
        [stats.meta],
    );

    if (index.error) {
        return (
            <Panel title={ROUTES.champions.label}>
                <ErrorState
                    error={index.error}
                    title="Catalogue des champions indisponible"
                    onRetry={() => window.location.reload()}
                />
            </Panel>
        );
    }

    if (requestedKey && !champion) {
        if (index.isLoading) {
            return (
                <Panel title={ROUTES.champions.label}>
                    <SkeletonList rows={4} />
                </Panel>
            );
        }
        return (
            <Panel title={ROUTES.champions.label}>
                <EmptyState
                    title="Champion introuvable"
                    description={`Aucun champion ne correspond à « ${requestedKey} » dans le catalogue de ce patch.`}
                    action={
                        <Link
                            to={ROUTES.champions.path}
                            className="inline-flex items-center rounded-control border border-line-strong bg-surface-3 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-gold/50 hover:text-gold"
                        >
                            Retour à la liste
                        </Link>
                    }
                />
            </Panel>
        );
    }

    // Without the dataset there is no way to know which role to open, and
    // asking the build route for the wrong one would fetch twice.
    if (champion && stats.isLoading && !search.get("role")) {
        return (
            <Panel title={champion.name}>
                <SkeletonList rows={6} />
            </Panel>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {stats.error && (
                <Panel title="Statistiques par champion">
                    <ErrorState
                        size="sm"
                        error={stats.error}
                        title="Jeu de données indisponible"
                        description="Les builds restent consultables, mais les winrates, taux de sélection et tiers ne peuvent pas être calculés."
                        onRetry={stats.refetch}
                    />
                </Panel>
            )}

            {champion ? (
                <ChampionPage
                    champion={champion}
                    byKey={index.byKey}
                    champions={index.champions}
                    stats={stats}
                    priorGames={priorGames}
                    role={role}
                    tab={tab}
                    versus={search.get("vs")}
                    compareWith={search.get("compare")}
                    onRoleChange={(next) => patch({ role: String(next), vs: null })}
                    onTabChange={(next) =>
                        patch({ tab: next === "build" ? null : next })
                    }
                    onVersusChange={(next) => patch({ vs: next })}
                    onCompareChange={(next) => patch({ compare: next })}
                />
            ) : (
                <>
                    <div className="flex flex-col gap-1">
                        <h1 className="text-lg font-semibold text-ink-strong">
                            {ROUTES.champions.label}
                        </h1>
                        <p className="text-sm text-ink-muted">
                            {ROUTES.champions.description} — {index.champions.length}{" "}
                            champions, statistiques par rôle.
                        </p>
                        {datasetNotice}
                    </div>
                    <ChampionIndex
                        champions={index.champions}
                        stats={stats}
                        isLoading={index.isLoading || stats.isLoading}
                    />
                </>
            )}
        </div>
    );
}
