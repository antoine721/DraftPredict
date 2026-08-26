import { Link } from "react-router-dom";
import { UserRound } from "lucide-react";
import { RANKS, REGIONS, type Rank, type Region } from "@draftpredict/core";
import { errorCodeOf, type PublicConfig } from "../../api";
import { formatNumber, formatRank, formatRiotId } from "../../lib";
import { Badge, Select, Spinner } from "../../ui";
import { ROUTES } from "../../app/routes";
import { useAccountMe, useConfigSaver } from "./hooks";
import { PLATFORMS, REGION_LABELS } from "./labels";
import { platformLabel, regionForPlatform, regionLabel } from "./helpers";
import { SaveError, SettingRow, SettingsSection } from "./SettingsSection";

/**
 * Where your account lives, and which slice of the data is analysed.
 *
 * Two different things share this panel on purpose, because they are constantly
 * confused: the **platform** is the Riot shard your account is on (it decides
 * which server the account routes ask), while the **rank** and **region** pick
 * the dataset the draft analysis is computed from. Changing the platform does
 * not change a single number on the draft board; changing the rank changes all
 * of them.
 */

/** The account the League client is logged in as — no API key involved. */
function DetectedAccount() {
    const me = useAccountMe();

    if (me.isLoading) {
        return (
            <span className="flex items-center gap-2 text-xs text-ink-muted">
                <Spinner size="xs" />
                Détection du client…
            </span>
        );
    }

    const code = errorCodeOf(me.error);
    if (code === "LCU_DISABLED") {
        return (
            <p className="text-xs text-ink-muted">
                Intégration au client désactivée —{" "}
                <a
                    href="#client"
                    className="text-gold underline-offset-4 hover:underline"
                >
                    l'activer
                </a>{" "}
                permet de détecter votre compte sans clé d'API.
            </p>
        );
    }
    if (code !== null && me.error) {
        return (
            <p className="text-xs text-ink-muted">
                Aucun compte détecté : le client League of Legends n'est pas connecté
                sur cette machine.
            </p>
        );
    }
    if (!me.data) return null;

    const account = me.data;
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone="positive" dot>
                Compte détecté
            </Badge>
            <span className="text-sm font-medium text-ink-strong">
                {account.gameName
                    ? formatRiotId(account.gameName, account.tagLine)
                    : (account.displayName ?? "Compte inconnu")}
            </span>
            {account.summonerLevel !== null && (
                <span className="tabular text-xs text-ink-muted">
                    niveau {formatNumber(account.summonerLevel)}
                </span>
            )}
            <Link
                to={ROUTES.account.path}
                className="text-xs text-gold underline-offset-4 hover:underline"
            >
                Ouvrir le profil
            </Link>
        </div>
    );
}

export function AccountPanel({ config }: { config: PublicConfig }) {
    const saver = useConfigSaver();
    const platformRegion = regionForPlatform(config.platform);
    const mismatch =
        platformRegion !== null &&
        config.region !== "ALL" &&
        config.region !== platformRegion;

    return (
        <SettingsSection
            id="compte"
            title="Compte & région"
            icon={<UserRound className="h-4 w-4" />}
            subtitle="Le serveur de votre compte, et la tranche de données analysée."
        >
            <div className="mb-4">
                <DetectedAccount />
            </div>

            <SettingRow
                title="Plateforme par défaut"
                description="Le serveur Riot interrogé pour votre profil, votre historique, votre style de jeu et la partie en cours. Sans effet sur les statistiques de draft."
                note={`Actuellement : ${platformLabel(config.platform)}.`}
            >
                <Select
                    label="Plateforme"
                    value={
                        PLATFORMS.some((entry) => entry.id === config.platform)
                            ? config.platform
                            : ""
                    }
                    disabled={saver.isSaving}
                    options={[
                        ...(PLATFORMS.some((entry) => entry.id === config.platform)
                            ? []
                            : [
                                  {
                                      value: "",
                                      label: `${config.platform} (inconnue)`,
                                  },
                              ]),
                        ...PLATFORMS.map((entry) => ({
                            value: entry.id,
                            label: `${entry.name} — ${entry.id}`,
                        })),
                    ]}
                    onValueChange={(platform) => {
                        if (platform === "" || platform === config.platform) return;
                        void saver.save(
                            { platform },
                            {
                                title: "Plateforme enregistrée",
                                description: platformLabel(platform),
                            },
                        );
                    }}
                />
            </SettingRow>

            <SettingRow
                title="Rang analysé"
                description="Les parties utilisées pour tous les winrates, synergies et matchups. « Platine+ » est le compromis habituel entre volume de parties et niveau de jeu."
                note="Modifie immédiatement le tableau de draft et les builds."
            >
                <Select<Rank>
                    label="Rang du jeu de données"
                    value={config.rank}
                    disabled={saver.isSaving}
                    options={RANKS.map((rank) => ({
                        value: rank,
                        label: formatRank(rank),
                    }))}
                    onValueChange={(rank) => {
                        if (rank === config.rank) return;
                        void saver.save(
                            { rank },
                            {
                                title: "Rang enregistré",
                                description: `Jeu de données : ${formatRank(rank)}.`,
                            },
                        );
                    }}
                />
            </SettingRow>

            <SettingRow
                title="Région analysée"
                description="Restreint le jeu de données à une région. « Toutes régions » donne l'échantillon le plus large, donc les estimations les plus stables."
                note={
                    mismatch
                        ? `Votre plateforme est ${platformLabel(config.platform)} alors que les données sont filtrées sur ${regionLabel(config.region)}.`
                        : undefined
                }
            >
                <Select<Region>
                    label="Région du jeu de données"
                    value={config.region}
                    disabled={saver.isSaving}
                    options={REGIONS.map((region) => ({
                        value: region,
                        label: REGION_LABELS[region] ?? region,
                    }))}
                    onValueChange={(region) => {
                        if (region === config.region) return;
                        void saver.save(
                            { region },
                            {
                                title: "Région enregistrée",
                                description: `Jeu de données : ${regionLabel(region)}.`,
                            },
                        );
                    }}
                />
            </SettingRow>

            <SaveError error={saver.error} />
        </SettingsSection>
    );
}
