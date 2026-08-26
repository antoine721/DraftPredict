import { Panel } from "../ui";
import { ROUTES } from "../app/routes";

/**
 * Placeholder — replaced by the Paramètres view.
 *
 * Foundation: `useConfig()` / `useUpdateConfig()` (never echo the key — only
 * `hasRiotApiKey` and `riotApiKeyPreview` exist), `useDatasetProviders()` and
 * `useRefreshDataset()`, `usePreferencesStore` for the local preferences.
 */
export default function SettingsView() {
    return (
        <Panel title={ROUTES.settings.label} subtitle={ROUTES.settings.description}>
            <p className="text-sm text-ink-muted">Vue en cours de construction.</p>
        </Panel>
    );
}
