import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
    Keyboard,
    LayoutGrid,
    PanelLeftClose,
    PanelLeftOpen,
    Radar,
    Settings,
    Swords,
    User,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { usePreferencesStore } from "../state/preferences";
import { useChampSelectSync, useThemeEffect } from "../state/hooks";
import { useDraftStore } from "../state/draft-store";
import { IconButton, Tooltip } from "../ui";
import { ConnectionStatus } from "./ConnectionStatus";
import { ROUTE_LIST, ROUTES, type AppRouteId } from "./routes";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { ViewToolbarProvider } from "./ViewToolbar";
import { dispatchFocusSearch, useShortcuts } from "./shortcuts";
import { toast } from "./toast";

const ICONS: Record<AppRouteId, ReactNode> = {
    draft: <Swords className="h-4.5 w-4.5" />,
    champions: <LayoutGrid className="h-4.5 w-4.5" />,
    account: <User className="h-4.5 w-4.5" />,
    live: <Radar className="h-4.5 w-4.5" />,
    settings: <Settings className="h-4.5 w-4.5" />,
};

/**
 * The application shell: navigation, live-status cluster, global shortcuts and
 * the toast host. Views render into the `<Outlet/>` and own nothing else.
 */
export function AppLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [helpOpen, setHelpOpen] = useState(false);
    // Filled by whichever view is mounted; see ViewToolbar.
    const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);

    const collapsed = usePreferencesStore((state) => state.navCollapsed);
    const setCollapsed = usePreferencesStore((state) => state.setNavCollapsed);

    useThemeEffect();
    useChampSelectSync();

    useShortcuts([
        ...ROUTE_LIST.map((route) => ({
            combo: route.shortcut,
            description: `Aller à ${route.label}`,
            handler: () => navigate(route.path),
        })),
        { combo: "mod+k", description: "Rechercher", handler: dispatchFocusSearch },
        {
            combo: "?",
            description: "Aide",
            handler: () => setHelpOpen((open) => !open),
        },
        {
            combo: "mod+z",
            description: "Annuler",
            handler: () => useDraftStore.getState().undo(),
        },
        {
            combo: "mod+shift+z",
            description: "Rétablir",
            handler: () => useDraftStore.getState().redo(),
        },
        {
            combo: "l",
            description: "Suivre le client",
            handler: () => {
                const { followClient, setFollowClient } = useDraftStore.getState();
                setFollowClient(!followClient);
                toast.info(
                    followClient
                        ? "Suivi du client désactivé"
                        : "Suivi du client activé",
                );
            },
        },
    ]);

    const current =
        ROUTE_LIST.find((route) => location.pathname.startsWith(route.path)) ??
        ROUTES.draft;

    return (
        <div className="relative z-10 flex min-h-full">
            <nav
                aria-label="Navigation principale"
                className={cn(
                    "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line",
                    "bg-surface-1/70 backdrop-blur-sm transition-[width] duration-200 md:flex",
                    collapsed ? "w-16" : "w-60",
                )}
            >
                <div
                    className={cn(
                        "flex h-16 items-center gap-2 border-b border-line px-4",
                        collapsed && "justify-center px-0",
                    )}
                >
                    <span
                        aria-hidden
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card border border-gold/50 bg-gold/10 text-sm font-black text-gold"
                    >
                        DP
                    </span>
                    {!collapsed && (
                        <span className="truncate text-sm font-semibold tracking-wide text-ink-strong">
                            DraftPredict
                        </span>
                    )}
                </div>

                <ul className="flex flex-1 flex-col gap-1 p-2">
                    {ROUTE_LIST.map((route) => (
                        <li key={route.id}>
                            <Tooltip
                                content={collapsed ? route.label : null}
                                side="right"
                                wrapperClassName="block w-full"
                            >
                                <NavLink
                                    to={route.path}
                                    className={({ isActive }) =>
                                        cn(
                                            "flex w-full items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors",
                                            collapsed && "justify-center px-0",
                                            isActive
                                                ? "bg-surface-3 text-ink-strong shadow-[inset_2px_0_0_0_var(--color-gold)]"
                                                : "text-ink-muted hover:bg-surface-hover hover:text-ink",
                                        )
                                    }
                                >
                                    <span className="shrink-0">{ICONS[route.id]}</span>
                                    {!collapsed && (
                                        <span className="truncate">{route.label}</span>
                                    )}
                                </NavLink>
                            </Tooltip>
                        </li>
                    ))}
                </ul>

                <div
                    className={cn(
                        "flex items-center gap-1 border-t border-line p-2",
                        collapsed && "justify-center",
                    )}
                >
                    <IconButton
                        label={collapsed ? "Déplier le menu" : "Replier le menu"}
                        size="sm"
                        icon={
                            collapsed ? (
                                <PanelLeftOpen className="h-4 w-4" />
                            ) : (
                                <PanelLeftClose className="h-4 w-4" />
                            )
                        }
                        onClick={() => setCollapsed(!collapsed)}
                    />
                    {!collapsed && (
                        <IconButton
                            label="Raccourcis clavier"
                            size="sm"
                            icon={<Keyboard className="h-4 w-4" />}
                            onClick={() => setHelpOpen(true)}
                        />
                    )}
                </div>
            </nav>

            <div className="flex min-w-0 flex-1 flex-col">
                {/*
                 * One bar for the whole application: the view's name, the
                 * view's own controls, and the connection status. Views must
                 * not add a second strip of their own.
                 */}
                <header className="sticky top-0 z-30 flex flex-col gap-2 border-b border-line bg-surface-0/90 px-4 py-2.5 backdrop-blur md:min-h-14 md:flex-row md:flex-wrap md:items-center md:gap-x-4 md:gap-y-2 md:py-2">
                    <h1 className="shrink-0 truncate text-sm font-semibold text-ink-strong">
                        {current.label}
                    </h1>
                    <div
                        ref={setToolbarSlot}
                        className="flex min-w-0 flex-1 flex-wrap items-center gap-2 md:justify-start"
                    />
                    <ConnectionStatus className="shrink-0 justify-start md:justify-end" />
                </header>

                {/* Mobile navigation. */}
                <nav
                    aria-label="Navigation principale"
                    className="scrollbar-slim flex gap-1 overflow-x-auto border-b border-line bg-surface-1/60 px-2 py-2 md:hidden"
                >
                    {ROUTE_LIST.map((route) => (
                        <NavLink
                            key={route.id}
                            to={route.path}
                            className={({ isActive }) =>
                                cn(
                                    "flex shrink-0 items-center gap-2 rounded-control px-3 py-1.5 text-xs font-medium transition-colors",
                                    isActive
                                        ? "bg-surface-3 text-ink-strong"
                                        : "text-ink-muted hover:bg-surface-hover",
                                )
                            }
                        >
                            {ICONS[route.id]}
                            {route.label}
                        </NavLink>
                    ))}
                </nav>

                <main className="min-w-0 flex-1 p-4 lg:p-6">
                    <ViewToolbarProvider slot={toolbarSlot}>
                        <Outlet />
                    </ViewToolbarProvider>
                </main>
            </div>

            <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
        </div>
    );
}
