import type { ComponentType } from "react";

/**
 * The five views, in navigation order.
 *
 * Paths are French because they are user-visible; identifiers stay English.
 * Every view is lazily imported in `App.tsx`, so a heavy view never delays the
 * first paint of the draft board.
 */

export type AppRouteId = "draft" | "champions" | "account" | "live" | "settings";

export type AppRoute = {
    id: AppRouteId;
    path: string;
    label: string;
    /** One line under the title, used by the page header and the nav tooltip. */
    description: string;
    /** Digit shortcut, matching the position in the nav. */
    shortcut: string;
};

export const ROUTES: Record<AppRouteId, AppRoute> = {
    draft: {
        id: "draft",
        path: "/draft",
        label: "Draft",
        description: "Probabilité de victoire, suggestions de picks et de bans",
        shortcut: "1",
    },
    champions: {
        id: "champions",
        path: "/champions",
        label: "Champions & builds",
        description: "Objets, runes, sorts et ordre de compétences",
        shortcut: "2",
    },
    account: {
        id: "account",
        path: "/compte",
        label: "Compte",
        description: "Profil, historique et style de jeu",
        shortcut: "3",
    },
    live: {
        id: "live",
        path: "/live",
        label: "Live",
        description: "Partie en cours et analyse du draft adverse",
        shortcut: "4",
    },
    settings: {
        id: "settings",
        path: "/parametres",
        label: "Paramètres",
        description: "Clé Riot, région, rang, niveau de risque et données",
        shortcut: "5",
    },
};

export const ROUTE_LIST: AppRoute[] = [
    ROUTES.draft,
    ROUTES.champions,
    ROUTES.account,
    ROUTES.live,
    ROUTES.settings,
];

/** `/champions/266` — the champion view accepts an optional champion key. */
export function championPath(
    championKey?: string | null,
    role?: number | null,
): string {
    if (!championKey) return ROUTES.champions.path;
    const suffix =
        role === null || role === undefined ? "" : `?role=${encodeURIComponent(role)}`;
    return `${ROUTES.champions.path}/${encodeURIComponent(championKey)}${suffix}`;
}

export type ViewComponent = ComponentType;
