import { Ban, Sparkles } from "lucide-react";
import type { Role } from "@draftpredict/core";
import type { ApiError } from "../../api";
import type {
    BanEntry,
    BansPayload,
    SuggestionEntry,
    SuggestionsPayload,
} from "../../api/types";
import { Panel, Tabs } from "../../ui";
import { BanSuggestionList } from "./BanSuggestionList";
import { MetaTierList } from "./MetaTierList";
import { SuggestionList } from "./SuggestionList";

export type AdviceTab = "picks" | "bans";

export type AdvicePanelProps = {
    /** Nothing on the board: the meta tier list replaces the advice. */
    empty: boolean;
    meta: { payload: SuggestionsPayload | null; isLoading: boolean };
    suggestions: {
        payload: SuggestionsPayload | null;
        isLoading: boolean;
        error: ApiError | null;
    };
    bans: { payload: BansPayload | null; isLoading: boolean; error: ApiError | null };
    tab: AdviceTab;
    onTabChange: (tab: AdviceTab) => void;
    suggestionLimit: number;
    banLimit: number;
    /** Open ally roles, shown as a badge on the picks tab. */
    openRoleCount: number;
    priorityRole: Role | null;
    bansFull: boolean;
    onPreview: (entry: SuggestionEntry | null) => void;
    onPick: (entry: SuggestionEntry) => void;
    onBan: (entry: BanEntry) => void;
    onPickFromMeta: (role: Role, championKey: string) => void;
};

/**
 * What to do next: the ranked picks for the open roles, the bans that would
 * hurt you most — or, on an empty board, the meta of the current dataset.
 */
export function AdvicePanel({
    empty,
    meta,
    suggestions,
    bans,
    tab,
    onTabChange,
    suggestionLimit,
    banLimit,
    openRoleCount,
    priorityRole,
    bansFull,
    onPreview,
    onPick,
    onBan,
    onPickFromMeta,
}: AdvicePanelProps) {
    if (empty) {
        return (
            <Panel
                title="Le méta, rôle par rôle"
                subtitle="Classement du jeu de données courant : cliquez un champion pour le placer."
            >
                <MetaTierList
                    payload={meta.payload}
                    isLoading={meta.isLoading}
                    onPick={onPickFromMeta}
                />
            </Panel>
        );
    }

    return (
        <Panel flush>
            <Tabs<AdviceTab>
                className="px-1 pt-1"
                value={tab}
                onValueChange={onTabChange}
                items={[
                    {
                        value: "picks",
                        label: "Picks conseillés",
                        icon: <Sparkles className="h-3.5 w-3.5" />,
                        badge: openRoleCount || undefined,
                    },
                    {
                        value: "bans",
                        label: "Bans conseillés",
                        icon: <Ban className="h-3.5 w-3.5" />,
                    },
                ]}
            >
                {(value) => (
                    <div className="p-4">
                        {value === "picks" ? (
                            <SuggestionList
                                payload={suggestions.payload}
                                isLoading={suggestions.isLoading}
                                error={suggestions.error}
                                limit={suggestionLimit}
                                priorityRole={priorityRole}
                                onPreview={onPreview}
                                onPick={onPick}
                            />
                        ) : (
                            <BanSuggestionList
                                payload={bans.payload}
                                isLoading={bans.isLoading}
                                error={bans.error}
                                limit={banLimit}
                                full={bansFull}
                                onBan={onBan}
                            />
                        )}
                    </div>
                )}
            </Tabs>
        </Panel>
    );
}
