import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * The one class-name helper every component uses: `clsx` for conditionals,
 * `tailwind-merge` so a caller's `className` always wins over the default one
 * (`cn("px-3", "px-6")` is `"px-6"`, not both).
 */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}

export type { ClassValue };
