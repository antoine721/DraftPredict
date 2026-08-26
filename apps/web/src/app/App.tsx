import { Suspense, lazy, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { LiveSocketProvider } from "../api/live";
import { createQueryClient } from "../api/queries";
import { EmptyState, LoadingState, Panel } from "../ui";
import { AppLayout } from "./AppLayout";
import { ErrorBoundary } from "./ErrorBoundary";
import { ROUTES } from "./routes";
import { Toaster } from "./toast";

/**
 * Composition root.
 *
 * Order matters: the query client wraps the socket provider (which mirrors
 * pushes into the cache), and the router wraps the layout (which reads the
 * location). Views are lazy so the draft board paints without waiting for the
 * account or build code.
 */

const DraftView = lazy(() => import("../views/DraftView"));
const ChampionsView = lazy(() => import("../views/ChampionsView"));
const AccountView = lazy(() => import("../views/AccountView"));
const LiveView = lazy(() => import("../views/LiveView"));
const SettingsView = lazy(() => import("../views/SettingsView"));

function ViewFrame({ children }: { children: React.ReactNode }) {
    return (
        <ErrorBoundary>
            <Suspense fallback={<LoadingState label="Chargement de la vue…" />}>
                {children}
            </Suspense>
        </ErrorBoundary>
    );
}

function NotFoundView() {
    return (
        <Panel title="Page introuvable">
            <EmptyState
                title="Cette page n'existe pas"
                description="Le lien est peut-être obsolète. Utilisez le menu pour revenir à une vue connue."
            />
        </Panel>
    );
}

export function App() {
    // One client for the lifetime of the app, created lazily so StrictMode's
    // double render does not build two caches.
    const [queryClient] = useState(createQueryClient);

    return (
        <QueryClientProvider client={queryClient}>
            <LiveSocketProvider>
                <BrowserRouter>
                    <Routes>
                        <Route element={<AppLayout />}>
                            <Route
                                index
                                element={<Navigate to={ROUTES.draft.path} replace />}
                            />
                            <Route
                                path={ROUTES.draft.path}
                                element={
                                    <ViewFrame>
                                        <DraftView />
                                    </ViewFrame>
                                }
                            />
                            <Route
                                path={ROUTES.champions.path}
                                element={
                                    <ViewFrame>
                                        <ChampionsView />
                                    </ViewFrame>
                                }
                            />
                            <Route
                                path={`${ROUTES.champions.path}/:championKey`}
                                element={
                                    <ViewFrame>
                                        <ChampionsView />
                                    </ViewFrame>
                                }
                            />
                            <Route
                                path={ROUTES.account.path}
                                element={
                                    <ViewFrame>
                                        <AccountView />
                                    </ViewFrame>
                                }
                            />
                            <Route
                                path={ROUTES.live.path}
                                element={
                                    <ViewFrame>
                                        <LiveView />
                                    </ViewFrame>
                                }
                            />
                            <Route
                                path={ROUTES.settings.path}
                                element={
                                    <ViewFrame>
                                        <SettingsView />
                                    </ViewFrame>
                                }
                            />
                            <Route path="*" element={<NotFoundView />} />
                        </Route>
                    </Routes>
                </BrowserRouter>
                <Toaster />
            </LiveSocketProvider>
        </QueryClientProvider>
    );
}

export default App;
