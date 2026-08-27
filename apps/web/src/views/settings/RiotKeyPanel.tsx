import { useState } from "react";
import { Eye, EyeOff, ExternalLink, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { errorCodeOf, type PublicConfig, type RiotKeyProbeResult } from "../../api";
import { Button, Dialog, IconButton, Input } from "../../ui";
import { CapabilityTable } from "./CapabilityTable";
import { useConfigSaver } from "./hooks";
import { KEY_EXPIRY_NOTE, KEY_RETEST_NOTE, KEY_STORAGE_NOTE } from "./labels";
import {
    describeKeySource,
    describeProbe,
    keyFieldError,
    looksLikeRiotKey,
    normalizeKeyInput,
} from "./helpers";
import { ReportLine, SaveError, SettingRow, SettingsSection } from "./SettingsSection";

/**
 * The Riot API key.
 *
 * Three things make this panel different from a text field with a save button:
 *
 * - **The key never comes back.** The server returns `RGAPI-****1234` and
 *   nothing else, so the field starts empty, is cleared after every write, and
 *   the stored key can never be re-tested without pasting it again.
 * - **The probe is allowed to fail.** `POST /api/config` makes one live Riot
 *   call; unreachable saves the key anyway, only an explicit 401/403 refuses
 *   the write. The four outcomes are rendered as four different things.
 * - **A key from the environment is not ours to overwrite.** When
 *   `riotApiKeySource` is `env`, saving here shadows it and removing here does
 *   not delete it — both are said out loud.
 */

const DEVELOPER_PORTAL = "https://developer.riotgames.com/";

export function RiotKeyPanel({ config }: { config: PublicConfig }) {
    const saver = useConfigSaver();
    const [value, setValue] = useState("");
    const [visible, setVisible] = useState(false);
    const [probe, setProbe] = useState<RiotKeyProbeResult | null>(null);
    const [confirmingRemoval, setConfirmingRemoval] = useState(false);

    const fieldError = keyFieldError(value);
    const ready = looksLikeRiotKey(value);
    const source = describeKeySource(config);
    const probeReport = describeProbe(probe);
    // Derived, not stored: the panel offers the "save without testing" way out
    // only while the last attempt is the one Riot refused.
    const rejected = errorCodeOf(saver.error) === "RIOT_KEY_REJECTED";

    async function submit(validateKey: boolean): Promise<void> {
        const key = normalizeKeyInput(value);
        if (!looksLikeRiotKey(key)) return;
        setProbe(null);
        const response = await saver.save(
            { riotApiKey: key, validateKey },
            {
                title: validateKey ? "Clé enregistrée et testée" : "Clé enregistrée",
                description: validateKey
                    ? undefined
                    : "Aucun appel à Riot n'a été effectué.",
            },
        );
        if (!response) return;
        setProbe(response.probe);
        setValue("");
        setVisible(false);
    }

    async function removeKey(): Promise<void> {
        setConfirmingRemoval(false);
        setProbe(null);
        const response = await saver.save(
            { riotApiKey: null },
            {
                title: "Clé retirée",
                description:
                    "Les fonctions de compte sont désactivées jusqu'à la prochaine clé.",
            },
        );
        if (response) setValue("");
    }

    return (
        <SettingsSection
            id="cle-api"
            title="Clé API Riot"
            icon={<KeyRound className="h-4 w-4" />}
            subtitle="Facultative : elle n'ouvre que les fonctions liées à votre compte."
            footer={KEY_STORAGE_NOTE}
        >
            <div className="flex flex-col gap-4">
                <ReportLine report={source} />

                {config.hasRiotApiKey && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-2/60 px-3 py-2">
                        <span className="flex items-center gap-2 text-sm">
                            <ShieldCheck
                                className="h-4 w-4 text-positive"
                                aria-hidden
                            />
                            <span className="text-ink-muted">Clé active :</span>
                            <code className="tabular rounded bg-surface-3 px-1.5 py-0.5 text-xs text-ink-strong">
                                {config.riotApiKeyPreview ?? "RGAPI-****"}
                            </code>
                        </span>
                        <Button
                            variant="danger"
                            size="sm"
                            icon={<Trash2 className="h-4 w-4" />}
                            onClick={() => setConfirmingRemoval(true)}
                            disabled={saver.isSaving}
                        >
                            Retirer la clé
                        </Button>
                    </div>
                )}

                <SettingRow
                    stacked
                    title={
                        config.hasRiotApiKey ? "Remplacer la clé" : "Ajouter une clé"
                    }
                    description={
                        <>
                            Collez la clé affichée sur{" "}
                            <a
                                href={DEVELOPER_PORTAL}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-1 text-gold underline-offset-4 hover:underline"
                            >
                                developer.riotgames.com
                                <ExternalLink className="h-3 w-3" aria-hidden />
                            </a>
                            . {KEY_EXPIRY_NOTE}
                        </>
                    }
                    note={config.hasRiotApiKey ? KEY_RETEST_NOTE : undefined}
                >
                    <form
                        className="flex flex-col gap-3"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void submit(true);
                        }}
                    >
                        <Input
                            label="Clé d'API Riot"
                            type={visible ? "text" : "password"}
                            value={value}
                            onChange={(event) => setValue(event.target.value)}
                            placeholder={
                                config.riotApiKeyPreview ??
                                "RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            }
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            error={fieldError}
                            hint={
                                fieldError
                                    ? undefined
                                    : "La clé n'est jamais réaffichée après son enregistrement."
                            }
                            className="font-mono"
                            trailing={
                                <IconButton
                                    size="sm"
                                    label={
                                        visible
                                            ? "Masquer la clé saisie"
                                            : "Afficher la clé saisie"
                                    }
                                    icon={
                                        visible ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )
                                    }
                                    onClick={() => setVisible((previous) => !previous)}
                                />
                            }
                        />
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="submit"
                                variant="primary"
                                size="sm"
                                loading={saver.isSaving}
                                disabled={!ready}
                            >
                                Enregistrer et tester la clé
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                disabled={!ready || saver.isSaving}
                                onClick={() => void submit(false)}
                            >
                                Enregistrer sans tester
                            </Button>
                        </div>
                    </form>

                    {probeReport && (
                        <div className="mt-3">
                            <ReportLine report={probeReport} />
                        </div>
                    )}

                    <SaveError error={saver.error} />

                    {rejected && (
                        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                            Riot a répondu 401 ou 403 : la clé est expirée, révoquée —
                            ou un proxy a intercepté l'appel de vérification. Si vous
                            êtes certain de la clé, utilisez « Enregistrer sans tester
                            ».
                        </p>
                    )}
                </SettingRow>

                <div>
                    <p className="mb-3 text-xs font-medium text-ink-muted">
                        Ce que la clé change
                    </p>
                    <CapabilityTable />
                </div>
            </div>

            <Dialog
                open={confirmingRemoval}
                onClose={() => setConfirmingRemoval(false)}
                title="Retirer la clé d'API ?"
                description={
                    config.riotApiKeySource === "env"
                        ? "La clé enregistrée dans le fichier de configuration sera supprimée. La variable d'environnement RIOT_API_KEY, elle, restera active tant que le serveur tournera avec."
                        : "Le compte, l'historique, le style de jeu et la partie en cours ne seront plus disponibles. Le draft et le client League continuent de fonctionner."
                }
                size="sm"
                footer={
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmingRemoval(false)}
                        >
                            Annuler
                        </Button>
                        <Button
                            variant="danger"
                            size="sm"
                            loading={saver.isSaving}
                            onClick={() => void removeKey()}
                        >
                            Retirer la clé
                        </Button>
                    </div>
                }
            >
                <p className="text-sm text-ink-muted">
                    Cette action ne révoque rien chez Riot : la clé reste valide sur
                    developer.riotgames.com.
                </p>
            </Dialog>
        </SettingsSection>
    );
}
