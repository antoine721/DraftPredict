/** Test-only mocked `fetch`. Never performs any I/O. */
import type { RiotFetch, RiotFetchInit, RiotResponseLike } from "../http.js";

export type MockResponse = {
    status?: number;
    /** Serialised as the response body. */
    body?: unknown;
    /** Raw body, wins over `body` (used for malformed JSON tests). */
    text?: string;
    headers?: Record<string, string>;
    /** When set, the fetch call rejects with this error. */
    throws?: Error;
};

export type MockFetch = {
    fetch: RiotFetch;
    calls: { url: string; init: RiotFetchInit }[];
    /** Number of times the mock was called. */
    readonly count: number;
};

/**
 * Replays `responses` in order; the last one repeats once the list is
 * exhausted, so a "always fails" scenario needs a single entry.
 */
export function mockFetch(responses: readonly MockResponse[]): MockFetch {
    const queue = [...responses];
    const calls: { url: string; init: RiotFetchInit }[] = [];
    const fetchImpl: RiotFetch = async (url, init) => {
        calls.push({ url, init });
        const response = queue.length > 1 ? queue.shift()! : (queue[0] ?? {});
        if (response.throws) throw response.throws;
        const headers = new Map(
            Object.entries(response.headers ?? {}).map(([key, value]) => [
                key.toLowerCase(),
                value,
            ]),
        );
        const result: RiotResponseLike = {
            status: response.status ?? 200,
            headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
            text: async () =>
                response.text ??
                (response.body === undefined ? "" : JSON.stringify(response.body)),
        };
        return result;
    };
    return {
        fetch: fetchImpl,
        calls,
        get count() {
            return calls.length;
        },
    };
}
