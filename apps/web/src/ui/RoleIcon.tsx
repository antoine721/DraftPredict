import type { Role } from "@draftpredict/core";
import { cn } from "../lib/cn";
import { roleLabels, roleLongLabels } from "../lib/format";

/**
 * The five position icons, drawn inline.
 *
 * Riot ships position icons on a CDN this app must never depend on: the dev
 * container has no outbound access and a user in champion select cannot wait
 * for a request that will time out. These are plain paths in `currentColor`,
 * so they inherit the ally/enemy/gold colour of whatever contains them.
 */

const PATHS: Record<Role, string> = {
    // Top: an arrow pointing up-lane.
    0: "M3 11 12 2l9 9h-4v11H7V11z",
    // Jungle: a pine.
    1: "M12 2 6 11h3l-4 7h5v4h4v-4h5l-4-7h3z",
    // Middle: a diagonal, both ways.
    2: "M21 3v9l-3.5-3.5-9 9L12 21H3v-9l3.5 3.5 9-9L12 3z",
    // Bottom: an arrow pointing down-lane.
    3: "M3 13 12 22l9-9h-4V2H7v11z",
    // Support: a warded shield.
    4: "M12 2 4 5v7c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V5zM11 7h2v3h3v2h-3v3h-2v-3H8v-2h3z",
};

export type RoleIconSize = "xs" | "sm" | "md" | "lg";

const SIZES: Record<RoleIconSize, string> = {
    xs: "h-3 w-3",
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-7 w-7",
};

export type RoleIconProps = {
    role: Role;
    size?: RoleIconSize;
    className?: string;
    /**
     * Adds an accessible name. Pass `false` for an icon next to a visible
     * label, so screen readers do not read the role twice.
     */
    labelled?: boolean;
};

export function RoleIcon({
    role,
    size = "md",
    className,
    labelled = true,
}: RoleIconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            fillRule="evenodd"
            aria-hidden={labelled ? undefined : true}
            role={labelled ? "img" : undefined}
            aria-label={labelled ? roleLongLabels[role] : undefined}
            className={cn("shrink-0", SIZES[size], className)}
        >
            <path d={PATHS[role]} />
        </svg>
    );
}

export type RoleChipProps = {
    role: Role;
    /** Adds the French short name next to the icon. */
    withLabel?: boolean;
    active?: boolean;
    className?: string;
};

/** A role icon in a bordered chip — role filters and slot headers. */
export function RoleChip({
    role,
    withLabel = true,
    active = false,
    className,
}: RoleChipProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-control border px-2 py-1 text-xs font-medium",
                active
                    ? "border-gold/50 bg-gold/12 text-gold"
                    : "border-line bg-surface-2 text-ink-muted",
                className,
            )}
        >
            <RoleIcon role={role} size="sm" labelled={!withLabel} />
            {withLabel && roleLabels[role]}
        </span>
    );
}
