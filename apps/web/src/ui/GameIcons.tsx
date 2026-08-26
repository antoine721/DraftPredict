import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { initials } from "../lib/helpers";
import { GameImage } from "./GameImage";

/**
 * Item, rune and summoner-spell icons.
 *
 * Same contract as {@link ChampionAvatar}: readable without the CDN. Items
 * fall back to their initials, runes to a gold ring, spells to their initials —
 * the build view stays usable with every image broken.
 */

export type GameIconSize = "xs" | "sm" | "md" | "lg";

const SIZES: Record<GameIconSize, string> = {
    xs: "h-6 w-6 text-[9px]",
    sm: "h-8 w-8 text-[10px]",
    md: "h-10 w-10 text-[11px]",
    lg: "h-14 w-14 text-sm",
};

type BaseProps = {
    src?: string | null;
    name?: string | null;
    size?: GameIconSize;
    className?: string;
    /** Overlay in the bottom-right corner (an order number, a count). */
    corner?: ReactNode;
    title?: string;
};

function IconFrame({
    src,
    name,
    size = "md",
    className,
    corner,
    title,
    rounded,
    fallback,
}: BaseProps & { rounded: string; fallback: ReactNode }) {
    return (
        <span
            className={cn("relative inline-flex shrink-0", SIZES[size], className)}
            title={title ?? name ?? undefined}
        >
            <GameImage
                src={src}
                alt={name ?? ""}
                className={cn("h-full w-full border border-line bg-surface-3", rounded)}
                fallback={fallback}
            />
            {corner !== undefined && (
                <span className="tabular absolute -right-1 -bottom-1 rounded-full border border-line-strong bg-surface-1 px-1 text-[9px] leading-4 font-semibold text-ink">
                    {corner}
                </span>
            )}
        </span>
    );
}

export type ItemIconProps = BaseProps & { id?: number | string | null };

/** A shop item. Square, like the in-game inventory. */
export function ItemIcon({ id, name, ...props }: ItemIconProps) {
    return (
        <IconFrame
            {...props}
            name={name ?? null}
            rounded="rounded-card"
            fallback={
                <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-3 to-surface-4 font-semibold text-ink-muted">
                    {name ? initials(name) : (id ?? "?")}
                </span>
            }
        />
    );
}

export type RuneIconProps = BaseProps & {
    /** Keystones are drawn larger and with a gold rim. */
    keystone?: boolean;
};

/** A rune or a stat shard. Round, like the rune tree. */
export function RuneIcon({
    keystone = false,
    name,
    className,
    ...props
}: RuneIconProps) {
    return (
        <IconFrame
            {...props}
            name={name ?? null}
            className={cn(keystone && "ring-1 ring-gold/50", className)}
            rounded="rounded-full"
            fallback={
                <span
                    className={cn(
                        "flex h-full w-full items-center justify-center rounded-full",
                        "bg-gradient-to-br from-surface-3 to-surface-4 font-semibold",
                        keystone ? "text-gold" : "text-ink-muted",
                    )}
                >
                    {initials(name ?? null, 1)}
                </span>
            }
        />
    );
}

export type SpellIconProps = BaseProps;

/** A summoner spell. Square with a softer radius than an item. */
export function SpellIcon({ name, ...props }: SpellIconProps) {
    return (
        <IconFrame
            {...props}
            name={name ?? null}
            rounded="rounded-control"
            fallback={
                <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-3 to-surface-4 font-semibold text-ink-muted">
                    {initials(name ?? null)}
                </span>
            }
        />
    );
}

/**
 * A skill slot (`Q`/`W`/`E`/`R`). The build fixture has no icons for these, so
 * this is a letter tile by design, not a fallback.
 */
export function SkillIcon({
    slot,
    size = "sm",
    active = false,
    className,
}: {
    slot: string;
    size?: GameIconSize;
    active?: boolean;
    className?: string;
}) {
    return (
        <span
            className={cn(
                "inline-flex items-center justify-center rounded-control border font-semibold",
                SIZES[size],
                active
                    ? "border-gold/60 bg-gold/15 text-gold"
                    : "border-line bg-surface-3 text-ink-muted",
                className,
            )}
        >
            {slot.toUpperCase()}
        </span>
    );
}
