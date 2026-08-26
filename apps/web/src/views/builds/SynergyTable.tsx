import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Dataset, Role } from "@draftpredict/core";
import type { ChampionSummary } from "../../api";
import { roleLongLabels } from "../../lib";
import { Panel } from "../../ui";
import { championPath } from "../../app/routes";
import { PairTable } from "./PairTable";
import { partnerRole, synergyRows } from "./stats";

/**
 * Duo synergies.
 *
 * Bot lane and support are pulled out into their own panel when they apply:
 * the botlane duo is the only pairing a player actually drafts around.
 */
export function SynergyTable({
    dataset,
    championKey,
    championName,
    role,
    priorGames,
    byKey,
}: {
    dataset: Dataset;
    championKey: string;
    championName: string;
    role: Role;
    priorGames: number;
    byKey: Map<string, ChampionSummary>;
}) {
    const rows = useMemo(
        () => synergyRows(dataset, championKey, role, priorGames),
        [dataset, championKey, role, priorGames],
    );

    const partner = partnerRole(role);
    const partnerRows = useMemo(
        () => (partner === null ? [] : rows.filter((row) => row.role === partner)),
        [rows, partner],
    );
    const otherRows = useMemo(
        () => (partner === null ? rows : rows.filter((row) => row.role !== partner)),
        [rows, partner],
    );

    const action = (row: { championKey: string; role: Role }) => (
        <Link
            to={championPath(row.championKey, row.role)}
            className="text-xs text-ink-muted underline-offset-2 hover:text-gold hover:underline"
        >
            Voir
        </Link>
    );

    return (
        <div className="flex flex-col gap-4">
            {partner !== null && (
                <Panel
                    title={`Duo de voie — ${roleLongLabels[partner]}`}
                    subtitle={`Les meilleurs partenaires de ${championName} sur la voie du bas`}
                >
                    <PairTable
                        rows={partnerRows}
                        byKey={byKey}
                        showRole={false}
                        limit={10}
                        emptyLabel="Aucun duo mesuré sur cette voie."
                        action={action}
                    />
                </Panel>
            )}

            <Panel
                title="Meilleures synergies d'équipe"
                subtitle="Coéquipiers avec lesquels le champion gagne le plus, rôle par rôle"
            >
                <PairTable
                    rows={otherRows}
                    byKey={byKey}
                    limit={12}
                    emptyLabel="Aucune synergie dans l'échantillon."
                    action={action}
                />
            </Panel>
        </div>
    );
}
