import { Panel } from "../ui";
import { ROUTES } from "../app/routes";

/**
 * Placeholder — replaced by the Compte view.
 *
 * Foundation: `useAccountLookup` / `useProfile` / `useMatches` /
 * `usePlaystyle`, `useRiotKeyState()` and `<RiotKeyMissingState/>` for the 428
 * path, `useJobProgress("playstyle", puuid)` for the progress bar.
 */
export default function AccountView() {
    return (
        <Panel title={ROUTES.account.label} subtitle={ROUTES.account.description}>
            <p className="text-sm text-ink-muted">Vue en cours de construction.</p>
        </Panel>
    );
}
