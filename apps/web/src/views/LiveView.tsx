import { Panel } from "../ui";
import { ROUTES } from "../app/routes";

/**
 * Placeholder — replaced by the Live view.
 *
 * Foundation: `useLiveGame(puuid)` for spectator data plus its embedded draft
 * analysis, `useLiveChampSelect()` for champion select, `useLcuLiveStatus()`
 * for the client state.
 */
export default function LiveView() {
    return (
        <Panel title={ROUTES.live.label} subtitle={ROUTES.live.description}>
            <p className="text-sm text-ink-muted">Vue en cours de construction.</p>
        </Panel>
    );
}
