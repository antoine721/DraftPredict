/**
 * Token-bucket rate limiting for the Riot API.
 *
 * Riot enforces several windows at once (a development key allows 20 requests
 * per second *and* 100 requests per 2 minutes), plus a separate budget per
 * endpoint ("method" limits). A request is only allowed when every bucket it
 * touches has a token, and it consumes one token from each of them.
 *
 * Everything is injectable (`now`, `sleep`) so the behaviour is unit-testable
 * without real timers.
 */

export type RateLimitRule = {
    /** Number of requests allowed per window. */
    requests: number;
    /** Window length, in seconds. */
    seconds: number;
};

/** Development key limits — the default. */
export const DEV_KEY_RATE_LIMITS: readonly RateLimitRule[] = [
    { requests: 20, seconds: 1 },
    { requests: 100, seconds: 120 },
];

/** Personal/production key limits, for reference. */
export const PRODUCTION_KEY_RATE_LIMITS: readonly RateLimitRule[] = [
    { requests: 500, seconds: 10 },
    { requests: 30_000, seconds: 600 },
];

export type RateLimiterOptions = {
    /** Application-wide rules. Defaults to {@link DEV_KEY_RATE_LIMITS}. */
    rules?: readonly RateLimitRule[];
    /** Extra rules applied to a single logical method, keyed by method name. */
    methodRules?: Record<string, readonly RateLimitRule[]>;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
};

export type RateLimiterSnapshot = {
    application: BucketSnapshot[];
    methods: Record<string, BucketSnapshot[]>;
    /** Timestamp until which every request is held back, `0` when free. */
    blockedUntil: number;
};

export type BucketSnapshot = {
    requests: number;
    seconds: number;
    /** Tokens currently available (fractional). */
    available: number;
};

const defaultSleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

class TokenBucket {
    readonly rule: RateLimitRule;
    private tokens: number;
    private updatedAt: number;

    constructor(rule: RateLimitRule, now: number) {
        this.rule = rule;
        this.tokens = rule.requests;
        this.updatedAt = now;
    }

    private refill(now: number): void {
        if (now <= this.updatedAt) return;
        const perMs = this.rule.requests / (this.rule.seconds * 1000);
        this.tokens = Math.min(this.rule.requests, this.tokens + (now - this.updatedAt) * perMs);
        this.updatedAt = now;
    }

    /** Milliseconds until a token is available; `0` when one is available now. */
    waitMs(now: number): number {
        this.refill(now);
        if (this.tokens >= 1) return 0;
        const perMs = this.rule.requests / (this.rule.seconds * 1000);
        return Math.ceil((1 - this.tokens) / perMs);
    }

    take(now: number): void {
        this.refill(now);
        this.tokens = Math.max(0, this.tokens - 1);
    }

    /** Drops every token, as if the window had just been fully spent. */
    drain(now: number): void {
        this.refill(now);
        this.tokens = 0;
    }

    available(now: number): number {
        this.refill(now);
        return this.tokens;
    }
}

export class RateLimiter {
    private readonly now: () => number;
    private readonly sleep: (ms: number) => Promise<void>;
    private readonly application: TokenBucket[];
    private readonly methodRuleSets: Map<string, readonly RateLimitRule[]>;
    private readonly methodBuckets = new Map<string, TokenBucket[]>();
    private blockedUntil = 0;
    private readonly methodBlockedUntil = new Map<string, number>();
    /** FIFO chain so concurrent acquires cannot spend the same token twice. */
    private tail: Promise<void> = Promise.resolve();

    constructor(options: RateLimiterOptions = {}) {
        this.now = options.now ?? (() => Date.now());
        this.sleep = options.sleep ?? defaultSleep;
        const rules = options.rules ?? DEV_KEY_RATE_LIMITS;
        const start = this.now();
        this.application = rules.map((rule) => new TokenBucket(rule, start));
        this.methodRuleSets = new Map(Object.entries(options.methodRules ?? {}));
    }

    /** Declares (or replaces) the per-method rules for `method`. */
    setMethodLimits(method: string, rules: readonly RateLimitRule[]): void {
        this.methodRuleSets.set(method, rules);
        this.methodBuckets.delete(method);
    }

    private bucketsFor(method?: string): TokenBucket[] {
        if (!method) return this.application;
        const existing = this.methodBuckets.get(method);
        if (existing) return [...this.application, ...existing];
        const rules = this.methodRuleSets.get(method);
        if (!rules || rules.length === 0) return this.application;
        const created = rules.map((rule) => new TokenBucket(rule, this.now()));
        this.methodBuckets.set(method, created);
        return [...this.application, ...created];
    }

    /**
     * Waits until a request may be sent, then consumes one token from every
     * bucket involved. Calls are served in FIFO order.
     */
    async acquire(method?: string): Promise<void> {
        const previous = this.tail;
        let release!: () => void;
        this.tail = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous.catch(() => undefined);
        try {
            await this.waitForSlot(method);
        } finally {
            release();
        }
    }

    private async waitForSlot(method?: string): Promise<void> {
        // Bounded loop: each iteration either consumes a token or sleeps for
        // the exact time the slowest bucket needs.
        for (;;) {
            const now = this.now();
            const buckets = this.bucketsFor(method);
            const penalty = Math.max(
                this.blockedUntil - now,
                method ? (this.methodBlockedUntil.get(method) ?? 0) - now : 0,
            );
            const bucketWait = buckets.reduce(
                (max, bucket) => Math.max(max, bucket.waitMs(now)),
                0,
            );
            const wait = Math.max(penalty, bucketWait);
            if (wait <= 0) {
                for (const bucket of buckets) bucket.take(now);
                return;
            }
            await this.sleep(wait);
        }
    }

    /**
     * Applies a Riot `Retry-After`: holds back every request (or only one
     * method, for a method limit) for `seconds` and empties the matching
     * buckets so the next window starts clean.
     */
    penalize(seconds: number, scope: { method?: string; scope?: "application" | "method" } = {}): void {
        const now = this.now();
        const until = now + Math.max(0, seconds) * 1000;
        if (scope.scope === "method" && scope.method) {
            const current = this.methodBlockedUntil.get(scope.method) ?? 0;
            this.methodBlockedUntil.set(scope.method, Math.max(current, until));
            for (const bucket of this.methodBuckets.get(scope.method) ?? []) {
                bucket.drain(now);
            }
            return;
        }
        this.blockedUntil = Math.max(this.blockedUntil, until);
        for (const bucket of this.application) bucket.drain(now);
    }

    /** Milliseconds a new request would currently have to wait. */
    estimateWaitMs(method?: string): number {
        const now = this.now();
        const buckets = this.bucketsFor(method);
        const penalty = Math.max(
            this.blockedUntil - now,
            method ? (this.methodBlockedUntil.get(method) ?? 0) - now : 0,
            0,
        );
        return Math.max(
            penalty,
            buckets.reduce((max, bucket) => Math.max(max, bucket.waitMs(now)), 0),
        );
    }

    snapshot(): RateLimiterSnapshot {
        const now = this.now();
        const toSnapshot = (bucket: TokenBucket): BucketSnapshot => ({
            requests: bucket.rule.requests,
            seconds: bucket.rule.seconds,
            available: bucket.available(now),
        });
        const methods: Record<string, BucketSnapshot[]> = {};
        for (const [method, buckets] of this.methodBuckets) {
            methods[method] = buckets.map(toSnapshot);
        }
        return {
            application: this.application.map(toSnapshot),
            methods,
            blockedUntil: this.blockedUntil,
        };
    }
}
