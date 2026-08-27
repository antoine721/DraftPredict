import { useEffect, useState } from "react";
import { Database, FolderOpen, RefreshCw } from "lucide-react";
import {
    toUserMessage,
    useLiveDataset,
    useRefreshDataset,
    type ConfigResponse,
    type DatasetMeta,
} from "../../api";
import { formatDatasetDate, formatNumber, formatRank } from "../../lib";
import { Badge, Button, Input, Stat, Toggle } from "../../ui";
import { DatasetNotice } from "../../app/DatasetNotice";
import { toast } from "../../app/toast";
import { useConfigSaver } from "./hooks";
import { DATASET_LOCAL_ROOT_NOTE } from "./labels";
import {
    datasetSourceLabel,
    parseProviderLine,
    providerLabel,
    regionLabel,
} from "./helpers";
import { SaveError, SettingRow, SettingsSection } from "./SettingsSection";

/**
 * Where the numbers come from.
 *
 * The provider chain falls back silently — local pipeline file, then the public
 * DraftGap bucket, then a synthetic fixture bundled with the app — so the only
 * question worth answering here is *which one actually answered*, and this
 * panel answers it before anything else.
 */

function DatasetFacts({ meta }: { meta: DatasetMeta | null }) {
    if (!meta) {
        return (
            <p className="text-sm text-ink-muted">
                Aucun jeu de données n'a encore été chargé par le serveur.
            </p>
        );
    }
    return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
                label="Fournisseur"
                value={providerLabel(meta.provider)}
                hint={`Servi depuis le ${datasetSourceLabel(meta.source)}`}
                size="sm"
            />
            <Stat
                label="Échantillon"
                value={formatDatasetDate(meta.date)}
                hint={`Format v${meta.version}${meta.patch ? ` — patch ${meta.patch}` : ""}`}
                size="sm"
            />
            <Stat
                label="Champions"
                value={formatNumber(meta.championCount)}
                hint={`Fenêtre : ${meta.window === "full" ? "30 jours" : "patch courant"}`}
                size="sm"
            />
            <Stat
                label="Tranche"
                value={formatRank(meta.rank)}
                hint={regionLabel(meta.region)}
                size="sm"
            />
        </div>
    );
}

export function DataPanel({ config: response }: { config: ConfigResponse }) {
    const { config } = response;
    const saver = useConfigSaver();
    const refresh = useRefreshDataset();
    const live = useLiveDataset();
    const [localRoot, setLocalRoot] = useState(config.datasetLocalRoot ?? "");

    useEffect(
        () => setLocalRoot(config.datasetLocalRoot ?? ""),
        [config.datasetLocalRoot],
    );

    // The socket pushes `dataset:update` after a refresh, so it is fresher than
    // the config payload this panel was rendered with.
    const meta: DatasetMeta | null = live?.patch ?? response.dataset.last;
    const providers = response.dataset.providers.map(parseProviderLine);
    const rootDirty = localRoot.trim() !== (config.datasetLocalRoot ?? "");

    async function runRefresh(): Promise<void> {
        try {
            const result = await refresh.mutateAsync({});
            toast.success(
                "Jeu de données rechargé",
                `${providerLabel(result.dataset.provider)} — ${formatDatasetDate(result.dataset.date)}`,
            );
        } catch (error) {
            toast.error("Rechargement impossible", toUserMessage(error));
        }
    }

    function saveLocalRoot(next: string | null): void {
        void saver.save(
            { datasetLocalRoot: next },
            {
                title: next
                    ? "Dossier de jeux de données enregistré"
                    : "Dossier local retiré",
                description: next
                    ? "Il sera essayé avant les jeux de données publics."
                    : "Les jeux de données publics reprennent la priorité.",
            },
        );
    }

    return (
        <SettingsSection
            id="donnees"
            title="Données"
            icon={<Database className="h-4 w-4" />}
            subtitle="Le jeu de données statistiques et les données statiques du jeu."
            actions={
                <Button
                    size="sm"
                    variant="secondary"
                    icon={<RefreshCw className="h-4 w-4" />}
                    loading={refresh.isPending}
                    onClick={() => void runRefresh()}
                >
                    Recharger
                </Button>
            }
        >
            <div className="flex flex-col gap-4">
                {meta && (
                    <DatasetNotice
                        source={{
                            provider: providerLabel(meta.provider),
                            // The notice appends " : elles sont cohérentes mais…",
                            // so this half has to end as a clause about "les
                            // statistiques".
                            description:
                                "Les statistiques affichées proviennent du jeu de données de démonstration livré avec l'application et généré hors-ligne",
                            offline: meta.offline,
                        }}
                    />
                )}

                <DatasetFacts meta={meta} />

                <div>
                    <p className="mb-2 text-xs font-medium text-ink-muted">
                        Chaîne de fournisseurs
                    </p>
                    <ol className="flex flex-col gap-2">
                        {providers.length === 0 && (
                            <li className="text-sm text-ink-muted">
                                Le serveur n'a déclaré aucun fournisseur.
                            </li>
                        )}
                        {providers.map((provider, index) => {
                            const active = meta?.provider === provider.id;
                            return (
                                <li
                                    key={provider.id}
                                    className={
                                        active
                                            ? "flex gap-3 rounded-card border border-gold/40 bg-gold/5 px-3 py-2"
                                            : "flex gap-3 rounded-card border border-line bg-surface-2/40 px-3 py-2"
                                    }
                                >
                                    <span className="tabular mt-0.5 text-xs text-ink-subtle">
                                        {index + 1}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-medium text-ink">
                                                {provider.label}
                                            </span>
                                            {active && (
                                                <Badge tone="gold">A répondu</Badge>
                                            )}
                                        </span>
                                        <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                                            {provider.detail}
                                        </span>
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                </div>

                <SettingRow
                    title="Jeux de données publics"
                    description="Autorise le téléchargement des statistiques publiques DraftGap. Désactivé, DraftPredict n'utilise que le dossier local et le jeu de démonstration."
                >
                    <Toggle
                        checked={config.allowRemoteDataset}
                        disabled={saver.isSaving}
                        ariaLabel="Autoriser le téléchargement des jeux de données publics"
                        onCheckedChange={(checked) =>
                            void saver.save(
                                { allowRemoteDataset: checked },
                                {
                                    title: checked
                                        ? "Téléchargement autorisé"
                                        : "Mode hors-ligne",
                                    description: checked
                                        ? "Les jeux de données publics seront réessayés."
                                        : "Seules les sources locales seront utilisées.",
                                },
                            )
                        }
                    />
                </SettingRow>

                <SettingRow
                    title="Dossier de jeux de données local"
                    description={DATASET_LOCAL_ROOT_NOTE}
                    note="Le chemin n'est pas vérifié à l'enregistrement : s'il n'existe pas, le fournisseur suivant prend le relais."
                >
                    <form
                        className="flex flex-col gap-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (rootDirty) saveLocalRoot(localRoot.trim() || null);
                        }}
                    >
                        <Input
                            label="Chemin du dossier"
                            value={localRoot}
                            placeholder="/chemin/vers/datasets"
                            spellCheck={false}
                            leading={<FolderOpen className="h-4 w-4" />}
                            onChange={(event) => setLocalRoot(event.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="submit"
                                size="sm"
                                variant={rootDirty ? "primary" : "secondary"}
                                disabled={!rootDirty}
                                loading={saver.isSaving}
                            >
                                Enregistrer le chemin
                            </Button>
                            {config.datasetLocalRoot !== null && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={saver.isSaving}
                                    onClick={() => saveLocalRoot(null)}
                                >
                                    Retirer
                                </Button>
                            )}
                        </div>
                    </form>
                </SettingRow>

                <SettingRow
                    title="Données statiques du jeu"
                    description="Champions, objets, runes et sorts d'invocateur : noms, icônes et descriptions. Elles viennent d'un instantané Data Dragon livré avec l'application."
                >
                    <div className="flex flex-col gap-1 text-sm">
                        <span className="tabular text-ink-strong">
                            Patch {response.staticData.version}
                        </span>
                        <span className="text-xs text-ink-muted">
                            {response.staticData.source === "bundled"
                                ? "Instantané fourni avec l'application"
                                : "Mise à jour téléchargée et mise en cache"}{" "}
                            — langue {response.staticData.language}
                        </span>
                    </div>
                </SettingRow>

                <SaveError error={saver.error} />
            </div>
        </SettingsSection>
    );
}
