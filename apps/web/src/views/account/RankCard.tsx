import { Flame } from "lucide-react";
import type { LeagueEntryDto } from "../../api";
import { cn } from "../../lib/cn";
import { NBSP, formatNumber, formatPercent, formatTier } from "../../lib/format";
import { winrateTextClass } from "../../lib/winrate";
import { Badge, Tooltip } from "../../ui";
import { isApexTier, rankStats, seriesMarks } from "./helpers";

/**
 * One ranked queue, as a card.
 *
 * Riot ships no emblem through the JSON API and the image CDN is optional, so
 * the tier is drawn: a coloured disc with the tier initial, which is readable
 * offline and needs no network. The winrate is always accompanied by the
 * number of games it comes from — the rule that runs through the whole app.
 */

const TIER_STYLES: Record<string, { ring: string; text: string; fill: string }> = {
    IRON: { ring: "border-[#6b625a]", text: "text-[#a89e94]", fill: "bg-[#6b625a]/15" },
    BRONZE: {
        ring: "border-[#8c5b3a]",
        text: "text-[#c08457]",
        fill: "bg-[#8c5b3a]/15",
    },
    SILVER: {
        ring: "border-[#8a97a3]",
        text: "text-[#b8c4cf]",
        fill: "bg-[#8a97a3]/15",
    },
    GOLD: { ring: "border-[#c8a44a]", text: "text-[#e2c169]", fill: "bg-[#c8a44a]/15" },
    PLATINUM: {
        ring: "border-[#4e9b93]",
        text: "text-[#6fc7bd]",
        fill: "bg-[#4e9b93]/15",
    },
    EMERALD: {
        ring: "border-[#3f9152]",
        text: "text-[#5fbd76]",
        fill: "bg-[#3f9152]/15",
    },
    DIAMOND: {
        ring: "border-[#5b7bd5]",
        text: "text-[#8aa6f0]",
        fill: "bg-[#5b7bd5]/15",
    },
    MASTER: {
        ring: "border-[#9b5bd5]",
        text: "text-[#c18ef0]",
        fill: "bg-[#9b5bd5]/15",
    },
    GRANDMASTER: {
        ring: "border-[#c4453f]",
        text: "text-[#e8756f]",
        fill: "bg-[#c4453f]/15",
    },
    CHALLENGER: {
        ring: "border-[#3fb6d8]",
        text: "text-[#79dcf5]",
        fill: "bg-[#3fb6d8]/15",
    },
};

const UNRANKED = {
    ring: "border-line-strong",
    text: "text-ink-subtle",
    fill: "bg-surface-3",
};

export function RankCard({
    label,
    entry,
    className,
}: {
    /** `"Classée solo/duo"` or `"Classée flexible"`. */
    label: string;
    entry: LeagueEntryDto | undefined;
    className?: string;
}) {
    const tier = entry?.tier?.toUpperCase() ?? null;
    const style = (tier && TIER_STYLES[tier]) || UNRANKED;
    const stats = rankStats(entry);
    const marks = seriesMarks(entry?.miniSeries?.progress);

    return (
        <div
            className={cn(
                "flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface-2/70 p-3",
                className,
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-ink-subtle">{label}</span>
                {entry?.hotStreak && (
                    <Badge tone="warning" icon={<Flame className="h-3 w-3" />}>
                        Série en cours
                    </Badge>
                )}
            </div>

            <div className="flex items-center gap-3">
                <span
                    aria-hidden
                    className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-base font-bold",
                        style.ring,
                        style.text,
                        style.fill,
                    )}
                >
                    {tier ? tier.slice(0, 1) : "—"}
                </span>
                <div className="min-w-0">
                    <p className={cn("truncate text-base font-semibold", style.text)}>
                        {entry
                            ? formatTier(
                                  entry.tier,
                                  isApexTier(entry.tier) ? null : entry.rank,
                              )
                            : "Non classé"}
                    </p>
                    <p className="tabular text-xs text-ink-muted">
                        {entry
                            ? `${formatNumber(entry.leaguePoints)}${NBSP}LP`
                            : "Aucune partie classée sur cette file"}
                    </p>
                </div>
            </div>

            {entry ? (
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
                    <span className="tabular text-ink-muted">
                        <span className="text-positive">
                            {formatNumber(stats.wins)}V
                        </span>
                        {NBSP}/{NBSP}
                        <span className="text-negative">
                            {formatNumber(stats.losses)}D
                        </span>
                    </span>
                    <Tooltip
                        wide
                        content={`Winrate classé de cette file sur ${formatNumber(stats.games)} parties, tel que Riot le comptabilise pour la saison en cours.`}
                    >
                        <span
                            className={cn(
                                "tabular font-semibold",
                                stats.games > 0
                                    ? winrateTextClass(stats.winrate)
                                    : "text-ink-subtle",
                            )}
                        >
                            {stats.games > 0 ? formatPercent(stats.winrate) : "—"}
                        </span>
                    </Tooltip>
                    <span className="tabular text-ink-subtle">
                        {formatNumber(stats.games)} parties
                    </span>
                </div>
            ) : (
                <p className="text-xs text-ink-subtle">
                    Jouez des parties classées sur cette file pour obtenir un rang.
                </p>
            )}

            {marks.length > 0 && (
                <div className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-subtle">Série&nbsp;:</span>
                    <span
                        className="flex items-center gap-1"
                        aria-label="Série de promotion"
                    >
                        {marks.map((mark, index) => (
                            <span
                                key={index}
                                className={cn(
                                    "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold",
                                    mark === "V" &&
                                        "border-positive/50 bg-positive/15 text-positive",
                                    mark === "D" &&
                                        "border-negative/50 bg-negative/15 text-negative",
                                    mark === "—" &&
                                        "border-line-strong bg-surface-3 text-ink-subtle",
                                )}
                            >
                                {mark}
                            </span>
                        ))}
                    </span>
                </div>
            )}
        </div>
    );
}
