import { useMemo } from "react";
import type { AccountMeResponse, ApiError } from "../../api";
import { useAccountMe, useLcuStatus, useLcuLiveStatus } from "../../api";

/**
 * `GET /api/account/me` — the only account route that needs no API key.
 *
 * It asks the local League Client who is logged in, which is how a player can
 * connect in one click without ever seeing a Riot ID field. The request itself
 * lives in `src/api` (`useAccountMe`); what this file adds is the gating below.
 *
 * Errors are a normal part of its contract:
 * - `404 LCU_NO_SUMMONER` — the client is closed or nobody is logged in;
 * - `409 LCU_DISABLED` — the integration is switched off in the settings.
 *
 * Both are answers, not failures, so the query never retries them and the view
 * renders the matching sentence.
 */

/** The League client's own account, as `GET /api/account/me` returns it. */
export type LcuAccount = AccountMeResponse;

export type LcuAccountQuery = {
    /** The account the client is logged in as, or `null`. */
    account: LcuAccount | null;
    error: ApiError | null;
    isLoading: boolean;
    isFetching: boolean;
    /** The client is connected and a summoner is logged in. */
    ready: boolean;
    /** The integration is switched off in the settings. */
    disabled: boolean;
    refetch: () => void;
};

/**
 * The League Client account, polled off the LCU status rather than blindly.
 *
 * The status is already pushed over the WebSocket and mirrored into the query
 * cache, so this only fires when a client is actually connected: no request at
 * all while the game is closed, one request when it opens, and a refresh every
 * half minute while it stays open (the logged-in account can change).
 */
export function useLcuAccount(): LcuAccountQuery {
    const live = useLcuLiveStatus();
    const rest = useLcuStatus();
    const status = live ?? rest.data ?? null;

    const disabled = status !== null && !status.enabled;
    const ready = Boolean(status?.enabled && status.connected && status.summoner);

    const query = useAccountMe({
        enabled: ready,
        refetchInterval: ready ? 30_000 : false,
    });

    const { data, error, isLoading, isFetching, refetch } = query;

    return useMemo(
        () => ({
            account: data ?? null,
            error: error ?? null,
            isLoading: ready && isLoading,
            isFetching,
            ready,
            disabled,
            refetch: () => void refetch(),
        }),
        [data, error, isLoading, isFetching, ready, disabled, refetch],
    );
}
