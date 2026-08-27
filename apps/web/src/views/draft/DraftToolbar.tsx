import { useEffect, useState } from "react";
import {
    ArrowLeftRight,
    Link2,
    PictureInPicture2,
    Redo2,
    Trash2,
    Undo2,
} from "lucide-react";
import {
    RANKS,
    REGIONS,
    RISK_LEVELS,
    type Rank,
    type Region,
    type RiskLevel,
} from "@draftpredict/core";
import type { AnalyzeDraftConfig } from "@draftpredict/core";
import { formatRank } from "../../lib/format";
import { Button, IconButton, Select, Tooltip } from "../../ui";

export type DraftToolbarProps = {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onClear: () => void;
    onSwapSides: () => void;
    onShare: () => void;
    riskLevel: RiskLevel | null;
    rank: Rank | null;
    region: Region | null;
    onRiskLevelChange: (value: RiskLevel | null) => void;
    onRankChange: (value: Rank | null) => void;
    onRegionChange: (value: Region | null) => void;
    /** The config the server actually used, echoed in the analysis. */
    resolved: AnalyzeDraftConfig | null;
    resolvedRank: Rank | null;
    resolvedRegion: Region | null;
};

const AUTO = "";

const RISK_LABELS: Record<RiskLevel, string> = {
    "very-low": "Très faible",
    low: "Faible",
    medium: "Moyen",
    high: "Élevé",
    "very-high": "Très élevé",
};

const REGION_LABELS: Partial<Record<Region, string>> = { ALL: "Toutes régions" };

type DesktopBridge = {
    overlay?: { control: (action: "toggle") => Promise<{ visible: boolean }> };
};

/** `window.draftpredict`, when the app runs inside the Electron shell. */
function desktopBridge(): DesktopBridge | null {
    if (typeof window === "undefined") return null;
    const bridge = (window as unknown as { draftpredict?: DesktopBridge }).draftpredict;
    return bridge?.overlay ? bridge : null;
}

/**
 * Board actions and the three analysis knobs.
 *
 * Rank, region and risk default to "auto": the value the server is configured
 * with, echoed back in every analysis. Choosing one overrides it for this
 * board only — and, because the override travels in the URL, for anyone the
 * draft is shared with.
 */
export function DraftToolbar({
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onClear,
    onSwapSides,
    onShare,
    riskLevel,
    rank,
    region,
    onRiskLevelChange,
    onRankChange,
    onRegionChange,
    resolved,
    resolvedRank,
    resolvedRegion,
}: DraftToolbarProps) {
    const [bridge, setBridge] = useState<DesktopBridge | null>(null);

    // Feature detection, not a build flag: the same bundle runs in a browser.
    useEffect(() => setBridge(desktopBridge()), []);

    return (
        <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
                <IconButton
                    label="Annuler (Ctrl+Z)"
                    size="sm"
                    icon={<Undo2 className="h-4 w-4" />}
                    disabled={!canUndo}
                    onClick={onUndo}
                />
                <IconButton
                    label="Rétablir (Ctrl+Maj+Z)"
                    size="sm"
                    icon={<Redo2 className="h-4 w-4" />}
                    disabled={!canRedo}
                    onClick={onRedo}
                />
                <Tooltip content="Échanger les deux équipes, bans compris">
                    <IconButton
                        label="Inverser les côtés"
                        size="sm"
                        icon={<ArrowLeftRight className="h-4 w-4" />}
                        onClick={onSwapSides}
                    />
                </Tooltip>
                <Tooltip content="Copier un lien qui rejoue ce draft">
                    <IconButton
                        label="Copier le lien du draft"
                        size="sm"
                        icon={<Link2 className="h-4 w-4" />}
                        onClick={onShare}
                    />
                </Tooltip>
                {bridge && (
                    <Tooltip content="Afficher ou masquer la fenêtre compacte par-dessus le jeu">
                        <IconButton
                            label="Basculer l'overlay"
                            size="sm"
                            icon={<PictureInPicture2 className="h-4 w-4" />}
                            onClick={() => void bridge.overlay?.control("toggle")}
                        />
                    </Tooltip>
                )}
                <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="h-4 w-4" />}
                    onClick={onClear}
                >
                    Vider
                </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Select<string>
                    size="sm"
                    aria-label="Rang analysé"
                    containerClassName="w-28"
                    value={rank ?? AUTO}
                    onValueChange={(value) =>
                        onRankChange(value === AUTO ? null : (value as Rank))
                    }
                    options={[
                        {
                            value: AUTO,
                            label: resolvedRank
                                ? formatRank(resolvedRank)
                                : "Rang auto",
                        },
                        ...RANKS.map((value) => ({
                            value,
                            label: formatRank(value),
                        })),
                    ]}
                />
                <Select<string>
                    size="sm"
                    aria-label="Région analysée"
                    containerClassName="w-32"
                    value={region ?? AUTO}
                    onValueChange={(value) =>
                        onRegionChange(value === AUTO ? null : (value as Region))
                    }
                    options={[
                        {
                            value: AUTO,
                            label: resolvedRegion
                                ? (REGION_LABELS[resolvedRegion] ?? resolvedRegion)
                                : "Région auto",
                        },
                        ...REGIONS.map((value) => ({
                            value,
                            label: REGION_LABELS[value] ?? value,
                        })),
                    ]}
                />
                <Tooltip
                    content="Le niveau de risque règle la confiance accordée aux petits échantillons : plus il est élevé, moins les données sont lissées."
                    wide
                    side="left"
                >
                    <Select<string>
                        size="sm"
                        aria-label="Niveau de risque"
                        containerClassName="w-36"
                        value={riskLevel ?? AUTO}
                        onValueChange={(value) =>
                            onRiskLevelChange(
                                value === AUTO ? null : (value as RiskLevel),
                            )
                        }
                        options={[
                            {
                                value: AUTO,
                                label: resolved
                                    ? `Risque ${RISK_LABELS[resolved.riskLevel].toLowerCase()}`
                                    : "Risque auto",
                            },
                            ...RISK_LEVELS.map((value) => ({
                                value,
                                label: `Risque ${RISK_LABELS[value].toLowerCase()}`,
                            })),
                        ]}
                    />
                </Tooltip>
            </div>
        </div>
    );
}
