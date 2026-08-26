import { ROLES, type Role, type Team } from "@draftpredict/core";
import type { AnalyzePayload, ChampionSummary } from "../../api/types";
import { cn } from "../../lib/cn";
import { formatSigned } from "../../lib/format";
import { Panel, Tooltip } from "../../ui";
import { BanRow } from "./BanRow";
import { RoleSlot, type RoleSlotGhost } from "./RoleSlot";
import { slotSample } from "./helpers";
import type { DraftBoard } from "../../state";
import type { SlotPreview } from "./types";

export type TeamColumnProps = {
    team: Team;
    board: DraftBoard;
    byKey: Map<string, ChampionSummary>;
    analysis: AnalyzePayload | null;
    selectedRole: Role | null;
    preview: SlotPreview | null;
    /** Roles whose champion is only hovered in the League Client, not locked. */
    hoveredRoles: ReadonlySet<Role>;
    /** The role currently picking, when the client says so. */
    actingRole: Role | null;
    onSelectSlot: (role: Role) => void;
    onClearSlot: (role: Role) => void;
    onSwapRole: (from: Role, to: Role) => void;
    onAddBan: () => void;
    onRemoveBan: (championKey: string) => void;
};

/** One side of the board: five role slots and a ban row. */
export function TeamColumn({
    team,
    board,
    byKey,
    analysis,
    selectedRole,
    preview,
    hoveredRoles,
    actingRole,
    onSelectSlot,
    onClearSlot,
    onSwapRole,
    onAddBan,
    onRemoveBan,
}: TeamColumnProps) {
    const ally = team === "ally";
    const slots = ally ? board.ally : board.opponent;
    const bans = ally ? board.bans.ally : board.bans.opponent;
    const group = ally
        ? analysis?.breakdown.allyChampions
        : analysis?.breakdown.enemyChampions;
    const picked = ROLES.filter((role) => slots[role]).length;

    return (
        <Panel
            flush
            className={cn(
                "border-t-2",
                ally ? "border-t-team-ally/70" : "border-t-team-enemy/70",
            )}
        >
            <header className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5">
                <div className="min-w-0">
                    <h2
                        className={cn(
                            "truncate text-sm font-semibold tracking-wide uppercase",
                            ally ? "text-team-ally" : "text-team-enemy",
                        )}
                    >
                        {ally ? "Votre équipe" : "Équipe adverse"}
                    </h2>
                    <p className="tabular text-xs text-ink-muted">
                        {picked}/5 champions
                    </p>
                </div>
                {group && (
                    <Tooltip
                        content="Somme des forces individuelles de l'équipe, en points de rating (échelle Elo)."
                        side="left"
                    >
                        <span className="tabular shrink-0 rounded-control border border-line bg-surface-2 px-2 py-1 text-xs text-ink-muted">
                            {formatSigned(group.totalRating, 1)} pts
                        </span>
                    </Tooltip>
                )}
            </header>

            <div className="flex flex-col gap-2 p-3">
                {ROLES.map((role) => {
                    const committed = slots[role];
                    const previewed =
                        preview && preview.team === team && preview.role === role
                            ? preview.championKey
                            : null;
                    const championKey = previewed ?? committed;
                    const ghost: RoleSlotGhost = previewed
                        ? "preview"
                        : committed && hoveredRoles.has(role)
                          ? "hover"
                          : null;
                    return (
                        <RoleSlot
                            key={role}
                            team={team}
                            role={role}
                            championKey={championKey}
                            champion={
                                championKey ? (byKey.get(championKey) ?? null) : null
                            }
                            sample={
                                championKey && !previewed
                                    ? slotSample(
                                          analysis?.breakdown,
                                          team,
                                          role,
                                          championKey,
                                      )
                                    : null
                            }
                            selected={selectedRole === role}
                            ghost={ghost}
                            acting={actingRole === role}
                            onSelect={() => onSelectSlot(role)}
                            onClear={() => onClearSlot(role)}
                            onSwapRole={(to) => onSwapRole(role, to)}
                        />
                    );
                })}

                <div className="mt-1 border-t border-line pt-3">
                    <BanRow
                        team={team}
                        bans={bans}
                        byKey={byKey}
                        onAdd={onAddBan}
                        onRemove={onRemoveBan}
                    />
                </div>
            </div>
        </Panel>
    );
}
