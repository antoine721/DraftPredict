import { Check, KeyRound } from "lucide-react";
import { CAPABILITIES, type Capability } from "./labels";

/**
 * What works without a Riot API key, and what needs one.
 *
 * This is the single most useful thing this screen can say: most of
 * DraftPredict — the entire draft board, the builds, the League client
 * integration — never touches the Riot API. Someone who does not want to
 * create a key should be able to see that in two seconds and move on.
 */

function CapabilityList({
    items,
    tone,
}: {
    items: readonly Capability[];
    tone: "free" | "key";
}) {
    return (
        <ul className="flex flex-col gap-2.5">
            {items.map((capability) => (
                <li key={capability.label} className="flex gap-2.5">
                    <span
                        aria-hidden
                        className={
                            tone === "free"
                                ? "mt-0.5 text-positive"
                                : "mt-0.5 text-gold"
                        }
                    >
                        {tone === "free" ? (
                            <Check className="h-4 w-4" />
                        ) : (
                            <KeyRound className="h-4 w-4" />
                        )}
                    </span>
                    <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">
                            {capability.label}
                        </span>
                        <span className="block text-xs leading-relaxed text-ink-muted">
                            {capability.description}
                        </span>
                    </span>
                </li>
            ))}
        </ul>
    );
}

export function CapabilityTable() {
    const free = CAPABILITIES.filter((capability) => !capability.needsKey);
    const gated = CAPABILITIES.filter((capability) => capability.needsKey);

    return (
        <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-card border border-line bg-surface-2/60 p-3">
                <p className="mb-3 text-xs font-semibold text-positive">
                    Sans clé d'API
                </p>
                <CapabilityList items={free} tone="free" />
            </div>
            <div className="rounded-card border border-gold/30 bg-gold/5 p-3">
                <p className="mb-3 text-xs font-semibold text-gold">
                    Avec une clé d'API
                </p>
                <CapabilityList items={gated} tone="key" />
            </div>
        </div>
    );
}
