import { Link } from "react-router-dom";
import { Button, ErrorState, Panel, RiotKeyMissingState, SkeletonList } from "../../ui";
import { ROUTES } from "../../app/routes";
import { PlaystyleProgress } from "./PlaystylePanel";
import type { PlaystyleView } from "./hooks";

/**
 * The champion pool comes out of the playstyle profile, so it shares its
 * states: no key, still profiling, failed. Rather than repeating them inside
 * the pool panel, the pool is simply not rendered until there is a profile —
 * and this says why.
 */
export function PoolPlaceholder({ view }: { view: PlaystyleView }) {
    if (view.error?.isRiotKeyMissing) {
        return (
            <Panel title="Pool de champions">
                <RiotKeyMissingState
                    description="Le pool de champions est calculé à partir de vos parties, que seule l'API de Riot peut fournir."
                    action={
                        <Link
                            to={ROUTES.settings.path}
                            className="text-sm font-medium text-gold underline-offset-4 hover:underline"
                        >
                            Ajouter une clé d'API Riot
                        </Link>
                    }
                />
            </Panel>
        );
    }

    if (view.error) {
        return (
            <Panel title="Pool de champions">
                <ErrorState
                    error={view.error}
                    title="Pool de champions indisponible"
                    onRetry={view.retry}
                />
            </Panel>
        );
    }

    return (
        <Panel
            title="Pool de champions"
            subtitle="Calculé à partir des parties analysées pour le style de jeu"
            actions={
                <Button size="sm" variant="secondary" onClick={view.refresh}>
                    Lancer l'analyse
                </Button>
            }
        >
            <div className="flex flex-col gap-3">
                <PlaystyleProgress view={view} />
                <SkeletonList rows={6} />
            </div>
        </Panel>
    );
}
