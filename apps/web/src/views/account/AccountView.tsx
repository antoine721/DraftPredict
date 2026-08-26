import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMatches, useProfile, useRiotKeyState } from "../../api";
import { usePreferencesStore } from "../../state";
import { toast } from "../../app/toast";
import { ROUTES } from "../../app/routes";
import { Tabs } from "../../ui";
import { ChampionPoolPanel } from "./ChampionPoolPanel";
import { ConnectScreen } from "./ConnectScreen";
import { MatchHistoryPanel } from "./MatchHistoryPanel";
import { PlaystylePanel } from "./PlaystylePanel";
import { ProfileHeader } from "./ProfileHeader";
import { RiotKeyOnboarding } from "./RiotKeyOnboarding";
import { PoolPlaceholder } from "./PoolPlaceholder";
import { useLcuAccount } from "./api";
import {
    useAccountActions,
    useActiveAccount,
    usePlaystyleProfile,
    useSavedAccounts,
    useStaticVersion,
} from "./hooks";
import { csPerMinuteByChampion, type SavedAccount } from "./helpers";

/**
 * Compte & style de jeu.
 *
 * Two screens behind one route. Disconnected, it is a connection screen where
 * both paths are first class: the League Client (one click, no API key) and a
 * Riot ID (any account, needs a key). Connected, it is a dashboard: identity
 * and ranks at the top, then the playstyle profile, the champion pool and the
 * match history — each of which knows how to render itself with no key, with
 * no data, while loading and after a failure, because those are the states a
 * real install spends most of its time in.
 */

const TABS = ["style", "champions", "historique"] as const;
type TabId = (typeof TABS)[number];

export default function AccountView() {
    const [search, setSearch] = useSearchParams();
    const [switching, setSwitching] = useState(false);

    const keyState = useRiotKeyState();
    const active = useActiveAccount();
    const savedAccounts = useSavedAccounts();
    const { connect, disconnect, forget } = useAccountActions();
    const version = useStaticVersion();
    const lcu = useLcuAccount();

    const matchCount = usePreferencesStore((state) => state.matchCount);
    const setMatchCount = usePreferencesStore((state) => state.setMatchCount);
    const playstyleCount = usePreferencesStore((state) => state.playstyleCount);
    const setPlaystyleCount = usePreferencesStore((state) => state.setPlaystyleCount);

    const puuid = active?.puuid ?? null;
    const platform = active?.platform ?? keyState.platform;

    const profile = useProfile(puuid, platform);
    const matches = useMatches(puuid, { count: matchCount, platform });
    const playstyle = usePlaystyleProfile(puuid, playstyleCount, platform);

    // A development key expires after 24 hours; when Riot starts refusing it,
    // every panel would otherwise show a different generic failure.
    const keyRejected = [profile.error, matches.error, playstyle.error].some(
        (error) => error?.code === "RIOT_KEY_REJECTED",
    );

    const csPerMinute = useMemo(
        () => csPerMinuteByChampion(matches.data?.matches ?? []),
        [matches.data],
    );

    const onConnect = useCallback(
        (account: Omit<SavedAccount, "lastUsedAt">) => {
            connect(account);
            setSwitching(false);
            toast.success(
                "Compte connecté",
                account.riotId ?? "Compte détecté depuis le client.",
            );
        },
        [connect],
    );

    const onDisconnect = useCallback(() => {
        disconnect();
        setSwitching(false);
        toast.info(
            "Compte déconnecté",
            "Il reste enregistré dans ce navigateur : vous pouvez le rouvrir en un clic.",
        );
    }, [disconnect]);

    const tabParam = search.get("onglet");
    const tab: TabId = TABS.includes(tabParam as TabId) ? (tabParam as TabId) : "style";
    const setTab = useCallback(
        (next: TabId) => {
            const params = new URLSearchParams(search);
            if (next === "style") params.delete("onglet");
            else params.set("onglet", next);
            setSearch(params, { replace: true });
        },
        [search, setSearch],
    );

    // The client already told us who we are; that identity survives a missing
    // key, so the header is never empty once a client account is connected.
    const fallbackIdentity =
        lcu.account && lcu.account.puuid === puuid
            ? {
                  displayName: lcu.account.displayName ?? lcu.account.gameName,
                  summonerLevel: lcu.account.summonerLevel,
                  profileIconId: lcu.account.profileIconId,
                  source: "lcu" as const,
              }
            : null;

    if (!active || switching) {
        return (
            <div className="flex flex-col gap-4">
                <header className="flex flex-col gap-1">
                    <h1 className="text-lg font-semibold text-ink-strong">
                        {switching ? "Changer de compte" : ROUTES.account.label}
                    </h1>
                    <p className="max-w-3xl text-sm text-ink-muted">
                        {switching
                            ? "Choisissez un compte enregistré, détectez celui du client ou saisissez un autre Riot ID."
                            : "Connectez votre compte League of Legends pour obtenir votre profil, votre historique et votre profil de style de jeu."}
                    </p>
                </header>

                <ConnectScreen
                    hasRiotApiKey={keyState.hasRiotApiKey}
                    defaultRiotId={active?.riotId ?? null}
                    defaultPlatform={platform}
                    accounts={savedAccounts}
                    activePuuid={puuid}
                    onConnect={onConnect}
                    onForget={forget}
                />

                {switching && (
                    <button
                        type="button"
                        onClick={() => setSwitching(false)}
                        className="self-start text-xs font-medium text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                    >
                        Revenir au profil
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <ProfileHeader
                account={active}
                profile={profile.data ?? null}
                error={profile.error ?? null}
                isLoading={profile.isLoading}
                isFetching={profile.isFetching}
                onRetry={() => void profile.refetch()}
                onDisconnect={onDisconnect}
                onSwitch={() => setSwitching(true)}
                version={version}
                fallback={fallbackIdentity}
            />

            {keyRejected && <RiotKeyOnboarding rejected />}

            <Tabs
                items={[
                    { value: "style", label: "Style de jeu" },
                    { value: "champions", label: "Pool de champions" },
                    {
                        value: "historique",
                        label: "Historique",
                        badge: matches.data?.matches.length,
                    },
                ]}
                value={tab}
                onValueChange={setTab}
            >
                {(value) => (
                    <div className="pt-4">
                        {value === "style" && (
                            <PlaystylePanel
                                view={playstyle}
                                count={playstyleCount}
                                onCountChange={setPlaystyleCount}
                            />
                        )}
                        {value === "champions" &&
                            (playstyle.data?.profile ? (
                                <ChampionPoolPanel
                                    profile={playstyle.data.profile}
                                    csPerMinute={csPerMinute}
                                />
                            ) : (
                                <PoolPlaceholder view={playstyle} />
                            ))}
                        {value === "historique" && (
                            <MatchHistoryPanel
                                puuid={active.puuid}
                                data={matches.data ?? null}
                                error={matches.error ?? null}
                                isLoading={matches.isLoading}
                                isFetching={matches.isFetching}
                                onRetry={() => void matches.refetch()}
                                count={matchCount}
                                onCountChange={setMatchCount}
                            />
                        )}
                    </div>
                )}
            </Tabs>
        </div>
    );
}
