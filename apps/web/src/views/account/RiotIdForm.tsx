import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AtSign, Search } from "lucide-react";
import { useAccountLookup } from "../../api";
import { formatRiotId } from "../../lib/format";
import { Badge, Button, Card, Input, Select } from "../../ui";
import { ROUTES } from "../../app/routes";
import { PLATFORMS, platformLabel } from "./labels";
import { normalizeRiotId, riotIdError, type SavedAccount } from "./helpers";

/**
 * The manual path: a Riot ID and a shard.
 *
 * The field is validated locally before anything is sent — an unparsable
 * `Nom#TAG` is a typo, not a round-trip — and every server answer maps to a
 * precise French sentence rather than to a generic failure. The two that
 * matter most are 404 (right shape, wrong shard or wrong spelling) and 428
 * (no key at all), because they need completely different reactions from the
 * user.
 */
export function RiotIdForm({
    defaultRiotId,
    defaultPlatform,
    onConnect,
    /** Hides the submit path when there is no key: the lookup cannot work. */
    keyMissing = false,
}: {
    defaultRiotId: string | null;
    defaultPlatform: string;
    onConnect: (account: Omit<SavedAccount, "lastUsedAt">) => void;
    keyMissing?: boolean;
}) {
    const [riotId, setRiotId] = useState(defaultRiotId ?? "");
    const [platform, setPlatform] = useState(defaultPlatform);
    const [submitted, setSubmitted] = useState<string | null>(null);
    const [touched, setTouched] = useState(false);
    const connectedRef = useRef<string | null>(null);

    const localError = riotIdError(riotId);
    const lookup = useAccountLookup(submitted, platform);
    const account = lookup.data ?? null;

    // A successful lookup is the connection: nothing else to confirm.
    useEffect(() => {
        if (!account) return;
        const key = `${account.platform}:${account.puuid}`;
        if (connectedRef.current === key) return;
        connectedRef.current = key;
        onConnect({
            puuid: account.puuid,
            riotId: formatRiotId(account.gameName, account.tagLine),
            platform: account.platform,
            source: "riot-id",
        });
    }, [account, onConnect]);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        setTouched(true);
        if (localError !== null) return;
        setSubmitted(normalizeRiotId(riotId));
    };

    return (
        <Card padding="lg" className="flex flex-col gap-4">
            <header className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <span
                        aria-hidden
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card border border-line-strong bg-surface-3 text-ink-muted"
                    >
                        <AtSign className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-ink-strong">
                            Riot ID
                        </h3>
                        <p className="mt-0.5 text-xs text-ink-muted">
                            Pour un compte qui n'est pas celui du client — nécessite une
                            clé d'API Riot.
                        </p>
                    </div>
                </div>
                {keyMissing && <Badge tone="warning">Clé requise</Badge>}
            </header>

            <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
                    <Input
                        label="Riot ID"
                        placeholder="Nom#EUW"
                        autoComplete="off"
                        spellCheck={false}
                        value={riotId}
                        aria-label="Riot ID au format Nom#TAG"
                        onChange={(event) => setRiotId(event.target.value)}
                        onBlur={() => setTouched(true)}
                        error={touched && localError !== null ? localError : undefined}
                        hint={
                            touched && localError !== null
                                ? undefined
                                : "Le tag est la partie après le « # », visible dans le client."
                        }
                    />
                    <Select
                        label="Région"
                        value={platform}
                        onValueChange={setPlatform}
                        options={PLATFORMS.map((entry) => ({
                            value: entry.id,
                            label: `${entry.code} — ${entry.name}`,
                        }))}
                        aria-label="Région du compte"
                    />
                </div>

                <Button
                    type="submit"
                    variant={keyMissing ? "secondary" : "primary"}
                    icon={<Search className="h-4 w-4" />}
                    loading={lookup.isFetching}
                    disabled={keyMissing || (touched && localError !== null)}
                    fullWidth
                >
                    Rechercher ce compte
                </Button>

                <LookupFeedback error={lookup.error} platform={platform} />
            </form>
        </Card>
    );
}

/** Every documented failure of `/api/account/lookup`, in its own sentence. */
function LookupFeedback({
    error,
    platform,
}: {
    error: { code: string; isRiotKeyMissing: boolean } | null;
    platform: string;
}) {
    if (!error) return null;

    if (error.isRiotKeyMissing) {
        return (
            <Message tone="warning">
                Aucune clé d'API Riot n'est configurée : la recherche par Riot ID est
                impossible.{" "}
                <Link
                    to={ROUTES.settings.path}
                    className="font-medium underline underline-offset-4"
                >
                    Ajouter une clé
                </Link>
                . La détection via le client fonctionne sans clé.
            </Message>
        );
    }

    if (error.code === "NOT_FOUND") {
        return (
            <Message tone="negative">
                Compte introuvable sur {platformLabel(platform)}. Vérifiez le tag, puis
                la région : un compte créé sur un autre serveur n'existe pas ici.
            </Message>
        );
    }

    if (error.code === "INVALID_RIOT_ID") {
        return (
            <Message tone="negative">
                Riot a refusé ce Riot ID : il doit s'écrire exactement Nom#TAG.
            </Message>
        );
    }

    if (error.code === "RIOT_KEY_REJECTED") {
        return (
            <Message tone="negative">
                Riot a refusé la clé enregistrée : les clés de développement expirent au
                bout de 24 heures.{" "}
                <Link
                    to={ROUTES.settings.path}
                    className="font-medium underline underline-offset-4"
                >
                    Mettre à jour la clé
                </Link>
                .
            </Message>
        );
    }

    if (error.code === "UNKNOWN_PLATFORM") {
        return (
            <Message tone="negative">
                Cette région n'est pas une région Riot valide.
            </Message>
        );
    }

    if (error.code === "RATE_LIMITED") {
        return (
            <Message tone="warning">
                Riot limite temporairement les requêtes. Réessayez dans quelques
                secondes.
            </Message>
        );
    }

    if (error.code === "NETWORK_ERROR") {
        return (
            <Message tone="negative">
                Le serveur DraftPredict est injoignable. Vérifiez qu'il est bien lancé.
            </Message>
        );
    }

    return (
        <Message tone="negative">
            La recherche a échoué. Réessayez, puis vérifiez la clé d'API dans les
            paramètres.
        </Message>
    );
}

function Message({
    tone,
    children,
}: {
    tone: "negative" | "warning";
    children: React.ReactNode;
}) {
    return (
        <p
            role="alert"
            className={
                tone === "negative"
                    ? "rounded-card border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative"
                    : "rounded-card border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning"
            }
        >
            {children}
        </p>
    );
}
