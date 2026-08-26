import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { RISK_LEVELS, type RiskLevel } from "@draftpredict/core";
import type { PublicConfig } from "../../api";
import { formatNumber } from "../../lib";
import { Button, Input, Select, Toggle } from "../../ui";
import { useConfigSaver } from "./hooks";
import {
    IGNORE_WINRATES_EXPLANATION,
    MIN_GAMES_EXPLANATION,
    RISK_EXPLANATION,
    RISK_LABELS,
} from "./labels";
import { parseIntegerInput, riskPriorGames, riskSummary } from "./helpers";
import { SaveError, SettingRow, SettingsSection } from "./SettingsSection";

/**
 * The three knobs of the prediction engine.
 *
 * They are *server* settings: the draft view sends no config of its own unless
 * the user overrides one on the board, so a change here is the change everyone
 * sees. `useUpdateConfig` invalidates the draft, builds and dataset queries, so
 * the win probability recomputes as soon as the write lands.
 */

const MIN_GAMES_MAX = 1_000_000;

export function AnalysisPanel({ config }: { config: PublicConfig }) {
    const saver = useConfigSaver();
    const [minGames, setMinGames] = useState(String(config.minGames));

    // The server is the source of truth: a value changed elsewhere (the desktop
    // shell, a second tab, a hand-edited config file) must win over a stale
    // draft sitting in this field.
    useEffect(() => setMinGames(String(config.minGames)), [config.minGames]);

    const parsed = parseIntegerInput(minGames);
    const invalid =
        parsed === null || parsed < 0 || parsed > MIN_GAMES_MAX
            ? "Indiquez un nombre de parties entre 0 et 1 000 000."
            : null;
    const dirty = parsed !== null && parsed !== config.minGames;

    function commitMinGames(): void {
        if (invalid || parsed === null || !dirty) return;
        void saver.save(
            { minGames: parsed },
            {
                title: "Seuil de parties enregistré",
                description: `${formatNumber(parsed)} parties minimum pour être suggéré.`,
            },
        );
    }

    return (
        <SettingsSection
            id="analyse"
            title="Analyse"
            icon={<SlidersHorizontal className="h-4 w-4" />}
            subtitle="Comment le moteur traite les petits échantillons."
        >
            <SettingRow
                title="Niveau de risque"
                description={RISK_EXPLANATION}
                note={riskSummary(config.riskLevel)}
            >
                <Select<RiskLevel>
                    label="Niveau de risque"
                    value={config.riskLevel}
                    disabled={saver.isSaving}
                    options={RISK_LEVELS.map((level) => ({
                        value: level,
                        label: `${RISK_LABELS[level]} — prior ${formatNumber(riskPriorGames(level))}`,
                    }))}
                    onValueChange={(riskLevel) => {
                        if (riskLevel === config.riskLevel) return;
                        void saver.save(
                            { riskLevel },
                            {
                                title: `Risque : ${RISK_LABELS[riskLevel]}`,
                                description: riskSummary(riskLevel),
                            },
                        );
                    }}
                />
            </SettingRow>

            <SettingRow
                title="Parties minimum"
                description={MIN_GAMES_EXPLANATION}
                note={`Valeur enregistrée : ${formatNumber(config.minGames)} parties.`}
            >
                <form
                    className="flex items-end gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        commitMinGames();
                    }}
                >
                    <Input
                        label="Parties minimum"
                        inputMode="numeric"
                        value={minGames}
                        onChange={(event) => setMinGames(event.target.value)}
                        error={invalid}
                        className="tabular"
                    />
                    <Button
                        type="submit"
                        size="md"
                        variant={dirty ? "primary" : "secondary"}
                        disabled={!dirty || invalid !== null}
                        loading={saver.isSaving}
                    >
                        Appliquer
                    </Button>
                </form>
            </SettingRow>

            <SettingRow
                title="Ignorer les winrates de champion"
                description={IGNORE_WINRATES_EXPLANATION}
                note={
                    config.ignoreChampionWinrates
                        ? "Actif : seuls les duos et les matchups comptent dans la probabilité de victoire."
                        : "Inactif : le winrate propre de chaque champion est pris en compte."
                }
            >
                <Toggle
                    checked={config.ignoreChampionWinrates}
                    disabled={saver.isSaving}
                    ariaLabel="Ignorer les winrates de champion"
                    onCheckedChange={(checked) =>
                        void saver.save(
                            { ignoreChampionWinrates: checked },
                            {
                                title: checked
                                    ? "Winrates de champion ignorés"
                                    : "Winrates de champion pris en compte",
                            },
                        )
                    }
                />
            </SettingRow>

            <SaveError error={saver.error} />
        </SettingsSection>
    );
}
