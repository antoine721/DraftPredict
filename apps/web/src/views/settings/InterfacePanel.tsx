import { useState, type ReactNode } from "react";
import { Grid2x2, List, Monitor, Moon, Palette, RotateCcw, Sun } from "lucide-react";
import type { ThemePreference } from "../../api";
import { cn, formatNumber } from "../../lib";
import { Button, Dialog, Slider, Toggle } from "../../ui";
import { toast } from "../../app/toast";
import {
    preferenceDefaults,
    usePreferencesStore,
    type ChampionLayout,
} from "../../state";
import { THEME_LABELS } from "./labels";
import { SettingRow, SettingsSection } from "./SettingsSection";

/**
 * The preferences that never leave this browser.
 *
 * Everything here is written to the persisted zustand store, applied
 * immediately by the view that reads it, and deliberately *not* sent to the
 * server: two people using the same DraftPredict server should be able to
 * disagree about the theme.
 */

type Option<T extends string> = { value: T; label: string; icon: ReactNode };

/** A one-of-N control: toggle buttons, one pressed. */
function SegmentedControl<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: T;
    options: readonly Option<T>[];
    onChange: (value: T) => void;
}) {
    return (
        <div
            role="group"
            aria-label={label}
            className="flex w-full gap-1 rounded-control border border-line-strong bg-surface-2 p-1"
        >
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "flex flex-1 items-center justify-center gap-1.5 rounded-control px-2 py-1.5 text-xs font-medium transition-colors",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                            active
                                ? "bg-gold/15 text-gold"
                                : "text-ink-muted hover:bg-surface-hover hover:text-ink",
                        )}
                    >
                        <span aria-hidden>{option.icon}</span>
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

const THEME_OPTIONS: readonly Option<ThemePreference>[] = [
    { value: "dark", label: THEME_LABELS.dark, icon: <Moon className="h-4 w-4" /> },
    { value: "light", label: THEME_LABELS.light, icon: <Sun className="h-4 w-4" /> },
    {
        value: "system",
        label: THEME_LABELS.system,
        icon: <Monitor className="h-4 w-4" />,
    },
];

const LAYOUT_OPTIONS: readonly Option<ChampionLayout>[] = [
    { value: "grid", label: "Grille", icon: <Grid2x2 className="h-4 w-4" /> },
    { value: "list", label: "Liste", icon: <List className="h-4 w-4" /> },
];

export function InterfacePanel() {
    // Primitive slices only: a selector that builds an object on every call
    // re-renders forever in zustand v5.
    const theme = usePreferencesStore((state) => state.theme);
    const suggestionLimit = usePreferencesStore((state) => state.suggestionLimit);
    const banLimit = usePreferencesStore((state) => state.banLimit);
    const matchCount = usePreferencesStore((state) => state.matchCount);
    const playstyleCount = usePreferencesStore((state) => state.playstyleCount);
    const followClientByDefault = usePreferencesStore(
        (state) => state.followClientByDefault,
    );
    const championLayout = usePreferencesStore((state) => state.championLayout);

    const setTheme = usePreferencesStore((state) => state.setTheme);
    const setSuggestionLimit = usePreferencesStore((state) => state.setSuggestionLimit);
    const setBanLimit = usePreferencesStore((state) => state.setBanLimit);
    const setMatchCount = usePreferencesStore((state) => state.setMatchCount);
    const setPlaystyleCount = usePreferencesStore((state) => state.setPlaystyleCount);
    const setFollowClientByDefault = usePreferencesStore(
        (state) => state.setFollowClientByDefault,
    );
    const setChampionLayout = usePreferencesStore((state) => state.setChampionLayout);
    const reset = usePreferencesStore((state) => state.reset);

    const [confirmingReset, setConfirmingReset] = useState(false);

    return (
        <SettingsSection
            id="interface"
            title="Interface"
            icon={<Palette className="h-4 w-4" />}
            subtitle="Réglages propres à ce navigateur, conservés localement."
            actions={
                <Button
                    size="sm"
                    variant="ghost"
                    icon={<RotateCcw className="h-4 w-4" />}
                    onClick={() => setConfirmingReset(true)}
                >
                    Réinitialiser
                </Button>
            }
        >
            <SettingRow
                title="Thème"
                description="« Système » suit le réglage clair/sombre de votre système d'exploitation."
            >
                <SegmentedControl
                    label="Thème de l'interface"
                    value={theme}
                    options={THEME_OPTIONS}
                    onChange={(next) => {
                        setTheme(next);
                        toast.success(`Thème : ${THEME_LABELS[next].toLowerCase()}`);
                    }}
                />
            </SettingRow>

            <SettingRow
                title="Suggestions par rôle"
                description="Nombre de champions proposés pour chaque rôle libre dans la vue Draft."
            >
                <Slider
                    label="Suggestions par rôle"
                    value={suggestionLimit}
                    onValueChange={setSuggestionLimit}
                    min={1}
                    max={50}
                    valueLabel={formatNumber(suggestionLimit)}
                    ticks={["1", "25", "50"]}
                />
            </SettingRow>

            <SettingRow
                title="Suggestions de bans"
                description="Longueur de la liste de bans conseillés."
            >
                <Slider
                    label="Suggestions de bans"
                    value={banLimit}
                    onValueChange={setBanLimit}
                    min={5}
                    max={100}
                    step={5}
                    valueLabel={formatNumber(banLimit)}
                    ticks={["5", "50", "100"]}
                />
            </SettingRow>

            <SettingRow
                title="Parties chargées"
                description="Taille de l'historique demandé dans la vue Compte. Chaque partie est un appel à l'API Riot."
            >
                <Slider
                    label="Parties chargées"
                    value={matchCount}
                    onValueChange={setMatchCount}
                    min={5}
                    max={100}
                    step={5}
                    valueLabel={formatNumber(matchCount)}
                    ticks={["5", "50", "100"]}
                />
            </SettingRow>

            <SettingRow
                title="Parties analysées pour le style de jeu"
                description="Plus l'échantillon est grand, plus le profil est stable — et plus le calcul est long, car les parties sont lues une par une."
            >
                <Slider
                    label="Parties analysées pour le style de jeu"
                    value={playstyleCount}
                    onValueChange={setPlaystyleCount}
                    min={10}
                    max={100}
                    step={10}
                    valueLabel={formatNumber(playstyleCount)}
                    ticks={["10", "50", "100"]}
                />
            </SettingRow>

            <SettingRow
                title="Affichage des champions"
                description="Disposition par défaut du catalogue de champions."
            >
                <SegmentedControl
                    label="Affichage des champions"
                    value={championLayout}
                    options={LAYOUT_OPTIONS}
                    onChange={(layout) => {
                        setChampionLayout(layout);
                        toast.success(
                            layout === "grid"
                                ? "Champions en grille"
                                : "Champions en liste",
                        );
                    }}
                />
            </SettingRow>

            <SettingRow
                title="Suivre le client par défaut"
                description="À l'ouverture de la vue Draft, refléter automatiquement le champion select en cours. Toute modification manuelle du tableau désactive le suivi."
            >
                <Toggle
                    checked={followClientByDefault}
                    ariaLabel="Suivre le client par défaut"
                    onCheckedChange={(checked) => {
                        setFollowClientByDefault(checked);
                        toast.success(
                            checked
                                ? "Suivi du client activé par défaut"
                                : "Suivi du client désactivé par défaut",
                        );
                    }}
                />
            </SettingRow>

            <Dialog
                open={confirmingReset}
                onClose={() => setConfirmingReset(false)}
                title="Réinitialiser les préférences ?"
                description="Thème, tailles de listes, favoris de champions et dernier compte consulté reviennent à leurs valeurs par défaut. Les réglages du serveur (clé, rang, risque) ne sont pas touchés."
                size="sm"
                footer={
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmingReset(false)}
                        >
                            Annuler
                        </Button>
                        <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                                reset();
                                setConfirmingReset(false);
                                toast.success(
                                    "Préférences réinitialisées",
                                    `Thème ${THEME_LABELS[preferenceDefaults.theme].toLowerCase()}, ${preferenceDefaults.suggestionLimit} suggestions par rôle.`,
                                );
                            }}
                        >
                            Réinitialiser
                        </Button>
                    </div>
                }
            />
        </SettingsSection>
    );
}
