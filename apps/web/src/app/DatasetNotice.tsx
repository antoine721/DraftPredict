import { FlaskConical, Info } from "lucide-react";
import { cn } from "../lib/cn";
import { formatDatasetDate } from "../lib/format";
import type { DatasetPairMeta } from "../api/types";

/**
 * Dataset honesty, in one component.
 *
 * The provider chain silently falls back to a synthetic bundled fixture when
 * the DraftGap bucket is unreachable — which is *always* the case offline.
 * Those numbers are internally consistent and completely made up, so every
 * view that renders them must say so. Drop this under the title.
 */
export function DatasetNotice({
    dataset,
    source,
    className,
    compact = false,
}: {
    /** The `dataset` block of any analysis response. */
    dataset?: DatasetPairMeta | null;
    /** The `source` block of a builds response, when that is what is shown. */
    source?: { provider: string; description: string; offline: boolean } | null;
    className?: string;
    compact?: boolean;
}) {
    const offline = source?.offline ?? dataset?.offline ?? false;
    const provider = source?.provider ?? dataset?.provider ?? null;
    if (!provider) return null;

    if (!offline) {
        if (compact) return null;
        return (
            <p
                className={cn(
                    "flex items-center gap-1.5 text-xs text-ink-subtle",
                    className,
                )}
            >
                <Info className="h-3.5 w-3.5" />
                Source : {provider}
                {dataset ? ` — échantillon du ${formatDatasetDate(dataset.date)}` : ""}
            </p>
        );
    }

    return (
        <div
            className={cn(
                "flex items-start gap-2 rounded-card border border-warning/40 bg-warning/10 px-3 py-2",
                "text-xs text-warning",
                className,
            )}
            role="note"
        >
            <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p className="min-w-0">
                <span className="font-semibold">
                    Données de démonstration hors-ligne.
                </span>{" "}
                {source?.description ??
                    "Les statistiques affichées proviennent d'un jeu de données synthétique généré localement"}
                {dataset ? ` (${formatDatasetDate(dataset.date)})` : ""} : elles sont
                cohérentes mais ne reflètent pas les vraies statistiques de la saison.
            </p>
        </div>
    );
}
