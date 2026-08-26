import { Panel } from "../../ui";
import { LcuConnectCard } from "./LcuConnectCard";
import { RiotIdForm } from "./RiotIdForm";
import { RiotKeyOnboarding } from "./RiotKeyOnboarding";
import { SavedAccountList } from "./SavedAccountList";
import type { SavedAccount } from "./helpers";

/**
 * The first screen a new user sees, and the one they see again every time
 * they disconnect.
 *
 * Both paths are first class and shown side by side: the client detection
 * (one click, no key) on the left because it is the one that always works,
 * the Riot ID (any account, needs a key) on the right. The key onboarding is
 * on top when there is no key, since it explains why the right-hand card is
 * disabled — and, just as importantly, that the left-hand one is not.
 */
export function ConnectScreen({
    hasRiotApiKey,
    defaultRiotId,
    defaultPlatform,
    accounts,
    activePuuid,
    onConnect,
    onForget,
}: {
    hasRiotApiKey: boolean;
    defaultRiotId: string | null;
    defaultPlatform: string;
    accounts: readonly SavedAccount[];
    activePuuid: string | null;
    onConnect: (account: Omit<SavedAccount, "lastUsedAt">) => void;
    onForget: (account: SavedAccount) => void;
}) {
    return (
        <div className="flex flex-col gap-4">
            {!hasRiotApiKey && <RiotKeyOnboarding />}

            <div className="grid gap-4 xl:grid-cols-2">
                <LcuConnectCard onConnect={onConnect} activePuuid={activePuuid} />
                <RiotIdForm
                    defaultRiotId={defaultRiotId}
                    defaultPlatform={defaultPlatform}
                    onConnect={onConnect}
                    keyMissing={!hasRiotApiKey}
                />
            </div>

            {accounts.length > 0 && (
                <Panel
                    title="Comptes enregistrés"
                    subtitle="Conservés dans ce navigateur : identifiant de compte, Riot ID et région. Aucune clé n'est stockée."
                >
                    <SavedAccountList
                        accounts={accounts}
                        activePuuid={activePuuid}
                        onSelect={(account) =>
                            onConnect({
                                puuid: account.puuid,
                                riotId: account.riotId,
                                platform: account.platform,
                                source: account.source,
                            })
                        }
                        onForget={onForget}
                    />
                </Panel>
            )}
        </div>
    );
}
