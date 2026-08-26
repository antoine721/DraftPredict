import type { ReactNode } from "react";
import type { Role } from "@draftpredict/core";
import { cn } from "../lib/cn";
import { initials } from "../lib/helpers";
import { GameImage } from "./GameImage";
import { RoleIcon } from "./RoleIcon";

export type ChampionAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZES: Record<ChampionAvatarSize, string> = {
    xs: "h-6 w-6 text-[9px]",
    sm: "h-8 w-8 text-[10px]",
    md: "h-11 w-11 text-xs",
    lg: "h-16 w-16 text-base",
    xl: "h-24 w-24 text-xl",
};

const RINGS = {
    none: "border-line",
    ally: "border-team-ally/70",
    enemy: "border-team-enemy/70",
    gold: "border-gold/70",
    muted: "border-line-strong",
} as const;

export type ChampionAvatarProps = {
    /** Anything with a name and an icon: `ChampionRef`, `ChampionSummary`, … */
    champion?: {
        key?: string;
        id?: string | null;
        name?: string | null;
        icon?: string | null;
    } | null;
    /** Overrides `champion.icon`. */
    src?: string | null;
    /** Overrides `champion.name`; also the alt text. */
    name?: string | null;
    size?: ChampionAvatarSize;
    ring?: keyof typeof RINGS;
    rounded?: "card" | "full";
    /** Dims the portrait — banned or unavailable champions. */
    dimmed?: boolean;
    /** Small role glyph in the bottom-left corner. */
    role?: Role | null;
    /** Free-form corner content (a level, a count). */
    corner?: ReactNode;
    className?: string;
    title?: string;
};

/**
 * A champion portrait.
 *
 * When Data Dragon cannot be reached the champion's initials are shown in a
 * bordered tile — still readable, still the right size, still recognisable
 * next to a name. This is the normal state offline, not a failure.
 */
export function ChampionAvatar({
    champion,
    src,
    name,
    size = "md",
    ring = "none",
    rounded = "card",
    dimmed = false,
    role,
    corner,
    className,
    title,
}: ChampionAvatarProps) {
    const label = name ?? champion?.name ?? champion?.id ?? null;
    const source = src ?? champion?.icon ?? null;
    const alt = label ?? "Champion inconnu";

    return (
        <span
            className={cn(
                "relative inline-flex shrink-0",
                SIZES[size],
                dimmed && "opacity-40 grayscale",
                className,
            )}
            title={title ?? label ?? undefined}
        >
            <GameImage
                src={source}
                alt={alt}
                loading={size === "xl" ? "eager" : "lazy"}
                className={cn(
                    "h-full w-full border bg-surface-3",
                    RINGS[ring],
                    rounded === "full" ? "rounded-full" : "rounded-card",
                )}
                fallback={
                    <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-3 to-surface-4 font-semibold tracking-wide text-ink-muted">
                        {initials(label)}
                    </span>
                }
            />
            {role !== null && role !== undefined && (
                <span
                    className={cn(
                        "absolute -bottom-1 -left-1 flex items-center justify-center rounded-full",
                        "border border-line-strong bg-surface-1 p-0.5 text-ink-muted",
                    )}
                >
                    <RoleIcon role={role} size="xs" labelled={false} />
                </span>
            )}
            {corner !== undefined && (
                <span className="tabular absolute -right-1 -bottom-1 rounded-full border border-line-strong bg-surface-1 px-1 text-[9px] leading-4 font-semibold text-ink">
                    {corner}
                </span>
            )}
        </span>
    );
}
