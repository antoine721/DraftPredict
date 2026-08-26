import { MonitorSmartphone, Trash2, UserRound } from "lucide-react";
import { cn } from "../../lib/cn";
import { formatRelativeTime } from "../../lib/format";
import { initials } from "../../lib/helpers";
import { Badge, IconButton } from "../../ui";
import { accountKey, type SavedAccount } from "./helpers";
import { platformCode, platformLabel } from "./labels";

/**
 * The accounts this browser remembers.
 *
 * A player with a main and a smurf switches between them constantly, so the
 * list is a real control and not a history: one click connects, the bin
 * forgets. Only a puuid, a Riot ID and a shard are stored — never a key.
 */
export function SavedAccountList({
    accounts,
    activePuuid,
    onSelect,
    onForget,
    className,
}: {
    accounts: readonly SavedAccount[];
    activePuuid: string | null;
    onSelect: (account: SavedAccount) => void;
    onForget: (account: SavedAccount) => void;
    className?: string;
}) {
    if (accounts.length === 0) return null;

    return (
        <ul className={cn("flex flex-col gap-2", className)}>
            {accounts.map((account) => {
                const key = accountKey(account);
                const active = account.puuid === activePuuid;
                const label = account.riotId ?? "Compte sans Riot ID";
                return (
                    <li key={key}>
                        <div
                            className={cn(
                                "flex items-center gap-3 rounded-card border px-3 py-2 transition-colors",
                                active
                                    ? "border-gold/60 bg-gold/8"
                                    : "border-line bg-surface-2/60",
                            )}
                        >
                            <button
                                type="button"
                                onClick={() => onSelect(account)}
                                disabled={active}
                                aria-label={`Basculer sur ${label} (${platformLabel(account.platform)})`}
                                className={cn(
                                    "flex min-w-0 flex-1 items-center gap-3 text-left",
                                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                                    active ? "cursor-default" : "cursor-pointer",
                                )}
                            >
                                <span
                                    aria-hidden
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-3 text-[10px] font-semibold text-ink-muted"
                                >
                                    {initials(account.riotId ?? "?")}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2">
                                        <span className="truncate text-sm font-medium text-ink">
                                            {label}
                                        </span>
                                        {active && <Badge tone="gold">Connecté</Badge>}
                                    </span>
                                    <span className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-subtle">
                                        <span className="inline-flex items-center gap-1">
                                            {account.source === "lcu" ? (
                                                <MonitorSmartphone
                                                    aria-hidden
                                                    className="h-3 w-3"
                                                />
                                            ) : (
                                                <UserRound
                                                    aria-hidden
                                                    className="h-3 w-3"
                                                />
                                            )}
                                            {account.source === "lcu"
                                                ? "client"
                                                : "Riot ID"}
                                        </span>
                                        <span aria-hidden>·</span>
                                        <span>{platformCode(account.platform)}</span>
                                        {account.lastUsedAt > 0 && (
                                            <>
                                                <span aria-hidden>·</span>
                                                <span>
                                                    {formatRelativeTime(
                                                        account.lastUsedAt,
                                                    )}
                                                </span>
                                            </>
                                        )}
                                    </span>
                                </span>
                            </button>
                            <IconButton
                                label={`Oublier ${label}`}
                                size="sm"
                                variant="ghost"
                                icon={<Trash2 className="h-3.5 w-3.5" />}
                                onClick={() => onForget(account)}
                            />
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
