import { useState } from "react";
import { MonitorSmartphone, RefreshCw } from "lucide-react";
import type { PublicConfig } from "../../api";
import { formatRelativeTime } from "../../lib";
import { Button, Toggle } from "../../ui";
import { toast } from "../../app/toast";
import { useClientStatus, useConfigSaver } from "./hooks";
import { LCU_CONNECTION_NOTE, LCU_NEVER, LCU_READS } from "./labels";
import { describeLcu, lcuNeedsRestart } from "./helpers";
import {
    FactList,
    ReportLine,
    SaveError,
    SettingRow,
    SettingsSection,
} from "./SettingsSection";

/**
 * The League Client integration.
 *
 * The honest part of this panel is the restart notice. The watcher is created
 * when the server boots, so switching the integration back on writes the
 * setting but does not resurrect a watcher that was never built — the server
 * says so through `status.enabled`, and so do we, instead of showing a green
 * badge that means nothing.
 *
 * "Reconnecter" is equally honest: the LCU API has no reconnect route because
 * the watcher already retries on its own. The button forces a fresh read and
 * reports what it found.
 */
export function ClientPanel({ config }: { config: PublicConfig }) {
    const saver = useConfigSaver();
    const client = useClientStatus();
    const [reconnecting, setReconnecting] = useState(false);

    const status = client.status;
    const report = describeLcu(status);
    const needsRestart = lcuNeedsRestart(config, status);

    async function reconnect(): Promise<void> {
        setReconnecting(true);
        try {
            const next = await client.refresh();
            const outcome = describeLcu(next);
            if (next?.connected) toast.success(outcome.label, outcome.detail);
            else toast.info(outcome.label, outcome.detail);
        } finally {
            setReconnecting(false);
        }
    }

    return (
        <SettingsSection
            id="client"
            title="Client League of Legends"
            icon={<MonitorSmartphone className="h-4 w-4" />}
            subtitle="Lecture seule du champion select, sur cette machine uniquement."
            footer={LCU_CONNECTION_NOTE}
            actions={
                <Button
                    size="sm"
                    variant="secondary"
                    icon={<RefreshCw className="h-4 w-4" />}
                    loading={reconnecting || client.isFetching}
                    onClick={() => void reconnect()}
                >
                    Reconnecter
                </Button>
            }
        >
            <div className="mb-4 flex flex-col gap-2">
                <ReportLine report={report} />
                {status?.lastError && (
                    <p className="text-xs text-warning">
                        Dernière erreur signalée : {status.lastError}
                    </p>
                )}
                {status && (
                    <p className="text-xs text-ink-subtle">
                        État lu {formatRelativeTime(status.updatedAt)}
                        {status.polling
                            ? " — la connexion temps réel n'a pas pu s'ouvrir, DraftPredict interroge le client à intervalle régulier (plus lent, mais exact)."
                            : "."}
                    </p>
                )}
            </div>

            <SettingRow
                title="Activer l'intégration"
                description="Autorise DraftPredict à interroger l'API locale du client pour suivre le champion select en direct. Aucune clé d'API Riot n'est nécessaire."
                note={
                    needsRestart
                        ? "Réglage enregistré, mais le serveur n'a pas de surveillance active : redémarrez DraftPredict pour la démarrer."
                        : undefined
                }
            >
                <Toggle
                    checked={config.lcuEnabled}
                    disabled={saver.isSaving}
                    ariaLabel="Activer l'intégration au client League of Legends"
                    onCheckedChange={(checked) => {
                        void saver
                            .save(
                                { lcuEnabled: checked },
                                {
                                    title: checked
                                        ? "Intégration activée"
                                        : "Intégration désactivée",
                                    description: checked
                                        ? "DraftPredict va chercher le client League of Legends."
                                        : "DraftPredict ne lira plus le client.",
                                },
                            )
                            .then(() => client.refresh());
                    }}
                />
            </SettingRow>

            <SettingRow
                stacked
                title="Ce que DraftPredict lit dans le client"
                description="La liste est exhaustive : tout le reste du client est ignoré."
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-card border border-line bg-surface-2/60 p-3">
                        <p className="mb-2 text-xs font-semibold text-ink-muted">Lu</p>
                        <FactList items={LCU_READS} />
                    </div>
                    <div className="rounded-card border border-line bg-surface-2/60 p-3">
                        <p className="mb-2 text-xs font-semibold text-ink-muted">
                            Jamais fait
                        </p>
                        <FactList items={LCU_NEVER} tone="negative" />
                    </div>
                </div>
            </SettingRow>

            <SaveError error={saver.error} />
        </SettingsSection>
    );
}
