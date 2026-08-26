export type QueryValue = string | number | boolean | undefined | null;

/**
 * Builds `base + path` with an encoded query string. `undefined`/`null`
 * parameters are dropped. Path segments must be encoded by the caller
 * (see {@link encodeSegment}).
 */
export function buildUrl(
    base: string,
    path: string,
    query: Record<string, QueryValue> = {},
): string {
    const entries = Object.entries(query).filter(
        ([, value]) => value !== undefined && value !== null && value !== "",
    );
    const search = entries
        .map(
            ([key, value]) =>
                `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
        )
        .join("&");
    return search.length > 0 ? `${base}${path}?${search}` : `${base}${path}`;
}

/** Encodes one path segment (Riot IDs may contain spaces and unicode). */
export function encodeSegment(value: string): string {
    return encodeURIComponent(value);
}
