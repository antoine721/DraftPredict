import { Panel } from "../ui";
import { ROUTES } from "../app/routes";

/**
 * Placeholder — replaced by the Champions & builds view.
 *
 * Foundation: `useChampionIndex()` for the catalogue, `useBuilds()` for
 * items/runes/spells/skills, `useParams().championKey` for the route
 * parameter, `<DatasetNotice source={payload.source}/>` for the fixture
 * warning.
 */
export default function ChampionsView() {
    return (
        <Panel title={ROUTES.champions.label} subtitle={ROUTES.champions.description}>
            <p className="text-sm text-ink-muted">Vue en cours de construction.</p>
        </Panel>
    );
}
