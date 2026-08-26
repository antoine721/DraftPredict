import { Panel } from "../ui";
import { ROUTES } from "../app/routes";

/**
 * Placeholder — replaced by the Draft view.
 *
 * The foundation it builds on: `useDraftStore` for the board,
 * `useDraftUrlSync()` for the shareable URL, `useDraftAnalysis` /
 * `useSuggestions` / `useBanSuggestions` for the numbers,
 * `useLiveChampSelect()` for the League Client, and `<DatasetNotice/>` for
 * data provenance.
 */
export default function DraftView() {
    return (
        <Panel title={ROUTES.draft.label} subtitle={ROUTES.draft.description}>
            <p className="text-sm text-ink-muted">Vue en cours de construction.</p>
        </Panel>
    );
}
