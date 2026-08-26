import { BarChart3, Hourglass, Swords } from "lucide-react";
import type { ApiError } from "../../api";
import type { AnalyzePayload } from "../../api/types";
import { ErrorState, Panel, Tabs } from "../../ui";
import { ContributionBreakdown } from "./ContributionBreakdown";
import { DamageDistribution } from "./DamageDistribution";
import { WhyPanel } from "./WhyPanel";
import { WinProbabilityGauge } from "./WinProbabilityGauge";
import { WinrateOverTime } from "./WinrateOverTime";
import { smallestSample } from "./helpers";

export type AnalysisColumnProps = {
    analysis: AnalyzePayload | null;
    error: ApiError | null;
    isFetching: boolean;
    /** The numbers were pushed by the server with the champ-select frame. */
    fromLive: boolean;
    onRetry: () => void;
    /** The champion being previewed on the board, if any. */
    preview: { winrate: number; label: string } | null;
};

/**
 * The middle column: the answer, then the reasons, then the details.
 *
 * The gauge and the "pourquoi" list are always visible because they are what a
 * player reads under a timer; the three detailed views share a tab strip, so
 * the column stays the same height whichever one is open.
 */
export function AnalysisColumn({
    analysis,
    error,
    isFetching,
    fromLive,
    onRetry,
    preview,
}: AnalysisColumnProps) {
    return (
        <div className="order-first flex min-w-0 flex-col gap-4 lg:order-none">
            <Panel
                title="Probabilité de victoire"
                subtitle={
                    fromLive
                        ? "Calculée par le serveur à partir du client League"
                        : "Analyse du tableau ci-contre"
                }
            >
                {error ? (
                    <ErrorState error={error} onRetry={onRetry} size="sm" />
                ) : (
                    <div className="flex flex-col gap-5">
                        <WinProbabilityGauge
                            winrate={analysis?.result.winrate ?? 0.5}
                            preview={preview}
                            totalRating={analysis?.result.totalRating ?? 0}
                            sample={smallestSample(analysis?.breakdown)}
                            isFetching={isFetching}
                            fromLive={fromLive}
                        />
                        <div className="border-t border-line pt-4">
                            <WhyPanel breakdown={analysis?.breakdown} />
                        </div>
                    </div>
                )}
            </Panel>

            <Panel flush>
                <Tabs
                    className="px-1 pt-1"
                    defaultValue="contributions"
                    items={[
                        {
                            value: "contributions",
                            label: "Contributions",
                            icon: <BarChart3 className="h-3.5 w-3.5" />,
                        },
                        {
                            value: "duration",
                            label: "Durée",
                            icon: <Hourglass className="h-3.5 w-3.5" />,
                        },
                        {
                            value: "damage",
                            label: "Dégâts",
                            icon: <Swords className="h-3.5 w-3.5" />,
                        },
                    ]}
                >
                    {(value) => (
                        <div className="p-4">
                            {value === "contributions" && (
                                <ContributionBreakdown
                                    breakdown={analysis?.breakdown}
                                />
                            )}
                            {value === "duration" && (
                                <WinrateOverTime points={analysis?.winrateByTime} />
                            )}
                            {value === "damage" && (
                                <DamageDistribution
                                    ally={analysis?.damageDistribution.ally}
                                    opponent={analysis?.damageDistribution.opponent}
                                />
                            )}
                        </div>
                    )}
                </Tabs>
            </Panel>
        </div>
    );
}
