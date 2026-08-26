import type { ChampionSummary, SummonerSpellDetail } from "../../api/types";
import { cn } from "../../lib/cn";
import { BanStrip } from "./BanStrip";
import { LivePlayerRow } from "./LivePlayerRow";
import type { LiveParticipant, LiveSide } from "./helpers";

export type LiveTeamPanelProps = {
    side: LiveSide;
    title: string;
    /** "Bleue" / "Rouge" — the side of the map, which is not the ally/enemy axis. */
    sideLabel: string;
    rows: readonly LiveParticipant[];
    bans: readonly string[];
    byKey: Map<string, ChampionSummary>;
    spellsById: Map<number, SummonerSpellDetail>;
    className?: string;
};

/** One team of a spectated game: its five players and its bans. */
export function LiveTeamPanel({
    side,
    title,
    sideLabel,
    rows,
    bans,
    byKey,
    spellsById,
    className,
}: LiveTeamPanelProps) {
    return (
        <section
            className={cn("flex min-w-0 flex-col gap-2", className)}
            aria-label={title}
        >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3
                    className={cn(
                        "text-xs font-semibold tracking-wider uppercase",
                        side === "ally" ? "text-team-ally" : "text-team-enemy",
                    )}
                >
                    {title}
                </h3>
                <span className="text-[11px] text-ink-subtle">
                    Côté {sideLabel} · {rows.length} joueurs
                </span>
            </div>

            {rows.length === 0 ? (
                <p className="rounded-card border border-line bg-surface-2/50 px-3 py-4 text-sm text-ink-muted">
                    Riot n'a communiqué aucun joueur pour cette équipe.
                </p>
            ) : (
                <ul className="flex flex-col gap-1.5">
                    {rows.map((row) => (
                        <LivePlayerRow
                            key={row.id}
                            row={row}
                            side={side}
                            byKey={byKey}
                            spellsById={spellsById}
                        />
                    ))}
                </ul>
            )}

            <BanStrip
                side={side}
                label="Bans"
                championKeys={bans}
                byKey={byKey}
                slots={0}
            />
        </section>
    );
}
