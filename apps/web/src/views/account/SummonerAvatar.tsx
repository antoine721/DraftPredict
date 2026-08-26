import { cn } from "../../lib/cn";
import { initials } from "../../lib/helpers";
import { formatNumber } from "../../lib/format";
import { GameImage } from "../../ui";
import { profileIconUrl } from "./helpers";

const SIZES = {
    sm: "h-10 w-10 text-[10px]",
    md: "h-14 w-14 text-xs",
    lg: "h-20 w-20 text-base",
} as const;

/**
 * A summoner icon with its level badge.
 *
 * Same contract as {@link ChampionAvatar}: Data Dragon is optional, so the
 * initials tile is the *initial* state and the portrait fades in over it if
 * the CDN answers. Offline, this is simply what an avatar looks like.
 */
export function SummonerAvatar({
    name,
    version,
    profileIconId,
    summonerLevel,
    size = "md",
    className,
}: {
    name: string | null;
    /** Data Dragon patch the icon URL is built from; `null` skips the image. */
    version: string | null;
    profileIconId: number | null | undefined;
    summonerLevel?: number | null;
    size?: keyof typeof SIZES;
    className?: string;
}) {
    const src = profileIconUrl(version, profileIconId ?? null);
    return (
        <span className={cn("relative inline-flex shrink-0", SIZES[size], className)}>
            <GameImage
                src={src}
                alt={name ? `Icône de profil de ${name}` : "Icône de profil"}
                loading="eager"
                className="h-full w-full rounded-full border border-gold/40 bg-surface-3"
                fallback={
                    <span className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-surface-3 to-surface-4 font-semibold tracking-wide text-ink-muted">
                        {initials(name)}
                    </span>
                }
            />
            {summonerLevel !== null && summonerLevel !== undefined && (
                <span
                    className="tabular absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full border border-line-strong bg-surface-1 px-1.5 text-[10px] leading-4 font-semibold text-ink"
                    title={`Niveau ${formatNumber(summonerLevel)}`}
                >
                    {formatNumber(summonerLevel)}
                </span>
            )}
        </span>
    );
}
