import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Database, KeyRound, MonitorSmartphone } from "lucide-react";
import { useConfig } from "../../api";
import { cn, formatDatasetDate } from "../../lib";
import { Badge, ErrorState, Panel, SkeletonList } from "../../ui";
import { ROUTES } from "../../app/routes";
import { AccountPanel } from "./AccountPanel";
import { AnalysisPanel } from "./AnalysisPanel";
import { ClientPanel } from "./ClientPanel";
import { DataPanel } from "./DataPanel";
import { DesktopPanel } from "./DesktopPanel";
import { InterfacePanel } from "./InterfacePanel";
import { RiotKeyPanel } from "./RiotKeyPanel";
import { useClientStatus, useDesktopBridge } from "./hooks";
import { describeLcu, providerLabel, visibleSections } from "./helpers";

/**
 * Paramètres.
 *
 * Every onboarding path in the app ends here, so the screen is built to be
 * landed on: one scrollable column of self-explanatory sections, a nav rail
 * that jumps to them, and anchors (`/parametres#cle-api`) that a call to
 * action elsewhere can link straight to.
 *
 * The split is strict. Anything the *server* computes with — the key, the
 * platform, the rank, the risk level, the dataset — is written through
 * `POST /api/config`, which invalidates the draft and build caches so the
 * change is visible immediately. Anything that is merely how *this* browser
 * looks lives in the persisted preferences store.
 */

/** The three facts worth seeing before scrolling. */
function SummaryStrip() {
    const config = useConfig();
    const client = useClientStatus();
    const payload = config.data;
    const lcu = describeLcu(client.status);
    const meta = payload?.dataset.last ?? null;

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Badge
                tone={payload?.config.hasRiotApiKey ? "positive" : "offline"}
                icon={<KeyRound className="h-3 w-3" />}
            >
                {payload?.config.hasRiotApiKey
                    ? `Clé ${payload.config.riotApiKeyPreview ?? "enregistrée"}`
                    : "Aucune clé d'API"}
            </Badge>
            <Badge tone={lcu.tone} icon={<MonitorSmartphone className="h-3 w-3" />}>
                {lcu.label}
            </Badge>
            <Badge
                tone={meta?.offline ? "warning" : "neutral"}
                icon={<Database className="h-3 w-3" />}
            >
                {meta
                    ? `${providerLabel(meta.provider)} — ${formatDatasetDate(meta.date)}`
                    : "Aucun jeu de données"}
            </Badge>
        </div>
    );
}

/** Jump list. Plain anchors: they survive a reload and can be linked to. */
function SectionNav({
    sections,
    active,
}: {
    sections: readonly { id: string; label: string }[];
    active: string | null;
}) {
    return (
        <nav
            aria-label="Sections des paramètres"
            className="hidden xl:sticky xl:top-20 xl:block xl:self-start"
        >
            <ul className="flex flex-col gap-1">
                {sections.map((section) => (
                    <li key={section.id}>
                        <a
                            href={`#${section.id}`}
                            aria-current={active === section.id ? "true" : undefined}
                            className={cn(
                                "block rounded-control border border-transparent px-3 py-1.5 text-sm transition-colors",
                                active === section.id
                                    ? "border-gold/40 bg-gold/10 text-gold"
                                    : "text-ink-muted hover:bg-surface-hover hover:text-ink",
                            )}
                        >
                            {section.label}
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
    );
}

export default function SettingsView() {
    const config = useConfig();
    const desktop = useDesktopBridge();
    const location = useLocation();
    const [active, setActive] = useState<string | null>(null);

    // Memoised on the one thing it depends on: a fresh array on every render
    // would rebuild the intersection observer below on every render too.
    const hasDesktopBridge = desktop.bridge !== null;
    const sections = useMemo(
        () => visibleSections(hasDesktopBridge),
        [hasDesktopBridge],
    );

    // The view is lazily loaded, so the browser has already given up on the
    // hash by the time the panels exist: scroll to it ourselves, once.
    useEffect(() => {
        const id = location.hash.replace(/^#/, "");
        if (!id) return;
        const target = document.getElementById(id);
        if (target) target.scrollIntoView({ block: "start" });
    }, [location.hash, config.isSuccess]);

    // Highlights the section being read. Purely decorative — the nav works
    // without it, and browsers without the observer simply get no highlight.
    useEffect(() => {
        if (typeof IntersectionObserver === "undefined") return;
        const nodes = sections
            .map((section) => document.getElementById(section.id))
            .filter((node): node is HTMLElement => node !== null);
        if (nodes.length === 0) return;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort(
                        (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
                    );
                if (visible[0]) setActive(visible[0].target.id);
            },
            { rootMargin: "-96px 0px -60% 0px", threshold: 0 },
        );
        for (const node of nodes) observer.observe(node);
        return () => observer.disconnect();
    }, [sections, config.isSuccess]);

    if (config.isLoading) {
        return (
            <Panel title={ROUTES.settings.label} subtitle={ROUTES.settings.description}>
                <SkeletonList rows={6} />
            </Panel>
        );
    }

    if (config.error || !config.data) {
        return (
            <Panel title={ROUTES.settings.label} subtitle={ROUTES.settings.description}>
                <ErrorState
                    error={config.error}
                    title="Paramètres indisponibles"
                    description="Le serveur DraftPredict n'a pas renvoyé sa configuration : impossible d'afficher ou de modifier les réglages sans lui."
                    onRetry={() => void config.refetch()}
                />
            </Panel>
        );
    }

    const payload = config.data;

    return (
        <div className="flex flex-col gap-4">
            <header className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                    <h1 className="text-lg font-semibold text-ink-strong">
                        {ROUTES.settings.label}
                    </h1>
                    <p className="text-sm text-ink-muted">
                        {ROUTES.settings.description}. Les réglages du serveur sont
                        enregistrés dans{" "}
                        <code className="rounded bg-surface-2 px-1 py-0.5 text-xs text-ink">
                            {payload.config.configPath}
                        </code>{" "}
                        ; les préférences d'affichage restent dans ce navigateur.
                    </p>
                </div>
                <SummaryStrip />
            </header>

            <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[200px_minmax(0,1fr)]">
                <SectionNav sections={sections} active={active} />
                <div className="flex min-w-0 flex-col gap-4">
                    <RiotKeyPanel config={payload.config} />
                    <AccountPanel config={payload.config} />
                    <AnalysisPanel config={payload.config} />
                    <ClientPanel config={payload.config} />
                    <DataPanel config={payload} />
                    <InterfacePanel />
                    {desktop.bridge !== null && <DesktopPanel desktop={desktop} />}
                </div>
            </div>
        </div>
    );
}
