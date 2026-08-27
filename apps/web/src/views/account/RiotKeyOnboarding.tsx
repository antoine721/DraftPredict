import { Link } from "react-router-dom";
import {
    Activity,
    ArrowRight,
    History,
    KeyRound,
    Monitor,
    Radar,
    Trophy,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Badge, Card } from "../../ui";
import { ROUTES } from "../../app/routes";

/**
 * What a Riot API key buys, as onboarding rather than as an error.
 *
 * Every `/api/account/*` route answers `428 RIOT_KEY_MISSING` until a key is
 * configured. That is the state a new user is in on their very first visit, so
 * it gets a real screen: what each feature needs the key for, the fact that
 * the League Client path works *without* one, and a single link to the place
 * where the key is entered. Never a red toast.
 */

const UNLOCKS: { icon: ReactNode; title: string; description: string }[] = [
    {
        icon: <Trophy className="h-4 w-4" />,
        title: "Profil et rangs",
        description:
            "Niveau, icône, classement solo et flexible, séries en cours et maîtrises de champions.",
    },
    {
        icon: <Radar className="h-4 w-4" />,
        title: "Profil de style de jeu",
        description:
            "Les huit axes, l'archétype, vos forces et vos faiblesses, calculés sur vos 20 à 100 dernières parties.",
    },
    {
        icon: <History className="h-4 w-4" />,
        title: "Historique détaillé",
        description:
            "Chaque partie avec son draft complet et la prédiction que le moteur aurait faite avant le début.",
    },
    {
        icon: <Activity className="h-4 w-4" />,
        title: "Partie en cours",
        description:
            "Les dix joueurs de votre partie en direct et l'analyse du draft adverse.",
    },
];

export function RiotKeyOnboarding({
    /** Set when the server refused a key it *has* (expired or revoked). */
    rejected = false,
    className,
}: {
    rejected?: boolean;
    className?: string;
}) {
    return (
        <Card
            padding="lg"
            className={cn("border-gold/30 bg-gold/5", className)}
            role="note"
        >
            <div className="flex flex-col gap-5">
                <div className="flex items-start gap-4">
                    <span
                        aria-hidden
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card border border-gold/40 bg-gold/12 text-gold"
                    >
                        <KeyRound className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold text-ink-strong">
                            {rejected
                                ? "Votre clé d'API Riot a été refusée"
                                : "Ajoutez une clé d'API Riot pour aller plus loin"}
                        </h2>
                        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
                            {rejected
                                ? "Riot a rejeté la clé enregistrée : les clés de développement expirent au bout de 24 heures. Générez-en une nouvelle sur le portail développeur de Riot, puis remplacez-la dans les paramètres."
                                : "DraftPredict interroge l'API de Riot avec votre propre clé. Elle reste sur cette machine, n'est jamais renvoyée au navigateur et n'apparaît dans aucun journal."}
                        </p>
                    </div>
                </div>

                <ul className="grid gap-3 sm:grid-cols-2">
                    {UNLOCKS.map((unlock) => (
                        <li
                            key={unlock.title}
                            className="flex items-start gap-3 rounded-card border border-line bg-surface-2/60 px-3 py-2.5"
                        >
                            <span aria-hidden className="mt-0.5 shrink-0 text-gold">
                                {unlock.icon}
                            </span>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-ink">
                                    {unlock.title}
                                </p>
                                <p className="mt-0.5 text-xs text-ink-muted">
                                    {unlock.description}
                                </p>
                            </div>
                        </li>
                    ))}
                </ul>

                <div className="flex items-start gap-3 rounded-card border border-info/40 bg-info/10 px-3 py-2.5">
                    <Monitor
                        aria-hidden
                        className="mt-0.5 h-4 w-4 shrink-0 text-info"
                    />
                    <p className="min-w-0 text-xs text-info">
                        <span className="font-semibold">
                            Le client League of Legends fonctionne sans clé.
                        </span>{" "}
                        Tant que le client tourne, DraftPredict détecte votre compte,
                        suit la sélection des champions et analyse le draft en direct.
                        La clé ne sert qu'aux données hébergées par Riot : rangs,
                        historique et style de jeu.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <Link
                        to={ROUTES.settings.path}
                        className={cn(
                            "inline-flex h-10 items-center gap-2 rounded-control border border-gold/60 bg-gold px-4",
                            "text-sm font-medium text-gold-ink transition-colors hover:bg-gold-bright",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                        )}
                    >
                        Ouvrir les paramètres
                        <ArrowRight aria-hidden className="h-4 w-4" />
                    </Link>
                    <Badge tone="neutral">Paramètres → Clé d'API Riot</Badge>
                </div>
            </div>
        </Card>
    );
}
