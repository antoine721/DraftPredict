import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Dataset, Role } from "@draftpredict/core";
import type { ChampionSummary } from "../../api";
import { formatCount, roleLongLabels } from "../../lib";
import { Panel, Select, Toggle } from "../../ui";
import { PairTable, VersusButton } from "./PairTable";
import { championPath } from "../../app/routes";
import { matchupRows, type PairRow } from "./stats";

/**
 * Best and worst matchups, from the 30-day matchup matrix.
 *
 * By default only the lane opponent is shown: an enemy jungler is a matchup
 * too, but it is not what a player looks up before a lane.
 */
export function MatchupTable({
    dataset,
    championKey,
    championName,
    role,
    priorGames,
    byKey,
    versus,
    onVersusChange,
}: {
    dataset: Dataset;
    championKey: string;
    championName: string;
    role: Role;
    priorGames: number;
    byKey: Map<string, ChampionSummary>;
    versus: string | null;
    onVersusChange: (championKey: string | null) => void;
}) {
    const [laneOnly, setLaneOnly] = useState(true);
    const [minGames, setMinGames] = useState("0");

    const rows = useMemo(
        () =>
            matchupRows(
                dataset,
                championKey,
                role,
                priorGames,
                laneOnly ? [role] : undefined,
            ),
        [dataset, championKey, role, priorGames, laneOnly],
    );

    const filtered = useMemo(() => {
        const threshold = Number(minGames);
        return rows.filter((row) => row.games >= threshold);
    }, [rows, minGames]);

    const best = filtered.slice(0, 10);
    const worst = [...filtered].reverse().slice(0, 10);

    const action = (row: PairRow) =>
        row.role === role ? (
            <VersusButton
                label={byKey.get(row.championKey)?.name ?? row.championKey}
                active={versus === row.championKey}
                onClick={() =>
                    onVersusChange(versus === row.championKey ? null : row.championKey)
                }
            />
        ) : (
            <Link
                to={championPath(row.championKey, row.role)}
                className="text-xs text-ink-muted underline-offset-2 hover:text-gold hover:underline"
            >
                Voir
            </Link>
        );

    return (
        <div className="flex flex-col gap-4">
            <Panel
                title="Duels"
                subtitle={`${formatCount(rows.length)} adversaires dans l'échantillon 30 jours`}
                actions={
                    <div className="flex flex-wrap items-center gap-3">
                        <Toggle
                            checked={laneOnly}
                            onCheckedChange={setLaneOnly}
                            size="sm"
                            label={`Voie uniquement (${roleLongLabels[role]})`}
                        />
                        <Select
                            size="sm"
                            aria-label="Échantillon minimum"
                            containerClassName="w-auto"
                            value={minGames}
                            onValueChange={setMinGames}
                            options={[
                                { value: "0", label: "Tous les duels" },
                                { value: "30", label: "≥ 30 parties" },
                                { value: "100", label: "≥ 100 parties" },
                                { value: "300", label: "≥ 300 parties" },
                            ]}
                        />
                    </div>
                }
            >
                <div className="grid gap-4 xl:grid-cols-2">
                    <section className="min-w-0">
                        <h3 className="mb-2 text-[11px] font-medium tracking-wider text-winrate-great uppercase">
                            Meilleurs duels pour {championName}
                        </h3>
                        <PairTable
                            rows={best}
                            byKey={byKey}
                            showRole={!laneOnly}
                            emptyLabel="Aucun duel au-dessus de ce seuil."
                            action={action}
                        />
                    </section>
                    <section className="min-w-0">
                        <h3 className="mb-2 text-[11px] font-medium tracking-wider text-winrate-terrible uppercase">
                            Duels les plus difficiles
                        </h3>
                        <PairTable
                            rows={worst}
                            byKey={byKey}
                            showRole={!laneOnly}
                            emptyLabel="Aucun duel au-dessus de ce seuil."
                            action={action}
                        />
                    </section>
                </div>
                <p className="mt-3 text-[11px] text-ink-subtle">
                    L'apport est le taux de victoire de l'affrontement une fois retirée
                    la force propre des deux champions, lissé par un a priori de{" "}
                    {formatCount(priorGames)} parties : un duel joué 30 fois ressort
                    donc proche de zéro, ce qui est l'honnêteté même.
                </p>
            </Panel>
        </div>
    );
}
