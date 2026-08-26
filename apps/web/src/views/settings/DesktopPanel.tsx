import { AppWindow, Download, PictureInPicture2 } from "lucide-react";
import { formatRelativeTime } from "../../lib";
import { Badge, Button, Stat, Toggle } from "../../ui";
import type { BadgeTone } from "../../ui";
import type { DesktopState, DesktopUpdateStatus } from "./hooks";
import { DESKTOP_ONLY_NOTE } from "./labels";
import { SettingRow, SettingsSection } from "./SettingsSection";

/**
 * The Electron shell's own settings.
 *
 * Rendered only when `window.draftpredict` exists — the same bundle is served
 * to a plain browser, where none of this is reachable and pretending otherwise
 * would offer switches that do nothing.
 */

const UPDATE_LABELS: Record<
    DesktopUpdateStatus["state"],
    { label: string; tone: BadgeTone }
> = {
    disabled: { label: "Mises à jour désactivées", tone: "offline" },
    idle: { label: "À jour", tone: "positive" },
    checking: { label: "Vérification en cours", tone: "info" },
    available: { label: "Mise à jour disponible", tone: "gold" },
    downloading: { label: "Téléchargement", tone: "info" },
    downloaded: { label: "Prête à installer", tone: "gold" },
    error: { label: "Échec de la vérification", tone: "negative" },
};

export function DesktopPanel({ desktop }: { desktop: DesktopState }) {
    const { info, preferences, update, overlayVisible } = desktop;
    const updateReport = update ? UPDATE_LABELS[update.state] : null;

    return (
        <SettingsSection
            id="bureau"
            title="Application de bureau"
            icon={<AppWindow className="h-4 w-4" />}
            subtitle="Fenêtre, superposition et mises à jour de l'application installée."
            footer={DESKTOP_ONLY_NOTE}
        >
            {desktop.error && (
                <p role="alert" className="mb-4 text-xs text-negative">
                    L'application de bureau n'a pas répondu : {desktop.error}
                </p>
            )}

            <SettingRow
                stacked
                title="Versions"
                description="Ce que cette fenêtre exécute réellement."
            >
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <Stat
                        label="Application"
                        value={info?.appVersion ?? "—"}
                        hint={info?.dev ? "build de développement" : "build publiée"}
                        size="sm"
                    />
                    <Stat
                        label="Serveur"
                        value={info?.serverVersion ?? "—"}
                        hint={info?.serverUrl ?? "—"}
                        size="sm"
                    />
                    <Stat
                        label="Electron"
                        value={info?.electronVersion ?? "—"}
                        hint={info ? `Chromium ${info.chromeVersion}` : "—"}
                        size="sm"
                    />
                    <Stat
                        label="Système"
                        value={info ? `${info.platform} ${info.arch}` : "—"}
                        hint={info ? `Node ${info.nodeVersion}` : "—"}
                        size="sm"
                    />
                </div>
            </SettingRow>

            <SettingRow
                title="Superposition compacte"
                description="Une petite fenêtre toujours au premier plan, à garder par-dessus le client pendant le champion select."
                note={
                    overlayVisible === null
                        ? "État de la superposition inconnu."
                        : overlayVisible
                          ? "La superposition est affichée."
                          : "La superposition est masquée."
                }
            >
                <Button
                    size="sm"
                    variant="secondary"
                    icon={<PictureInPicture2 className="h-4 w-4" />}
                    loading={desktop.busy}
                    onClick={() => void desktop.toggleOverlay()}
                >
                    {overlayVisible === null
                        ? "Basculer la superposition"
                        : overlayVisible
                          ? "Masquer la superposition"
                          : "Afficher la superposition"}
                </Button>
            </SettingRow>

            <SettingRow
                title="Démarrer avec le client League"
                description="Lance DraftPredict à l'ouverture de session et le laisse dans la zone de notification jusqu'à ce que le client League apparaisse."
            >
                <Toggle
                    checked={preferences?.startWithLeagueClient ?? false}
                    disabled={!preferences || desktop.busy}
                    ariaLabel="Démarrer avec le client League"
                    onCheckedChange={(checked) =>
                        void desktop.setPreference({ startWithLeagueClient: checked })
                    }
                />
            </SettingRow>

            <SettingRow
                title="Afficher au champion select"
                description="Mettre la fenêtre (ou la superposition) au premier plan dès qu'une sélection de champions démarre."
            >
                <Toggle
                    checked={preferences?.autoShowOnChampSelect ?? false}
                    disabled={!preferences || desktop.busy}
                    ariaLabel="Afficher au champion select"
                    onCheckedChange={(checked) =>
                        void desktop.setPreference({ autoShowOnChampSelect: checked })
                    }
                />
            </SettingRow>

            <SettingRow
                title="Mises à jour"
                description="Vérification auprès du canal de publication de l'application."
                note={
                    update?.checkedAt
                        ? `Dernière vérification ${formatRelativeTime(update.checkedAt)}.`
                        : "Aucune vérification effectuée depuis le démarrage."
                }
            >
                <div className="flex flex-col gap-2">
                    {updateReport && (
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={updateReport.tone} dot>
                                {updateReport.label}
                            </Badge>
                            {update?.nextVersion && (
                                <span className="tabular text-xs text-ink-muted">
                                    version {update.nextVersion}
                                </span>
                            )}
                        </div>
                    )}
                    {update?.message && (
                        <p className="text-xs text-ink-muted">{update.message}</p>
                    )}
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={<Download className="h-4 w-4" />}
                        loading={desktop.busy || update?.state === "checking"}
                        disabled={update?.state === "disabled"}
                        onClick={() => void desktop.checkForUpdates()}
                    >
                        Vérifier maintenant
                    </Button>
                </div>
            </SettingRow>
        </SettingsSection>
    );
}
