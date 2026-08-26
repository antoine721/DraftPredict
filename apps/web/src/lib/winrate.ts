/**
 * The winrate colour scale — the single source of truth for "is this number
 * good?" across the whole app.
 *
 * Diverging, anchored on the only numbers a League player reads instinctively:
 * 45 % is bad, 50 % is neutral, 55 % is good. Values are clamped to
 * [42 %, 58 %] because beyond that the colour cannot get any louder and the
 * gradient would waste its range on outliers.
 */

export type WinrateTone = "terrible" | "bad" | "neutral" | "good" | "great";

type Stop = { at: number; color: [number, number, number]; tone: WinrateTone };

/** Kept in sync with the `--color-winrate-*` tokens in `styles.css`. */
const STOPS: readonly Stop[] = [
    { at: 0.42, color: [229, 72, 77], tone: "terrible" }, // #e5484d
    { at: 0.45, color: [240, 128, 60], tone: "bad" }, // #f0803c
    { at: 0.5, color: [139, 152, 173], tone: "neutral" }, // #8b98ad
    { at: 0.55, color: [74, 196, 122], tone: "good" }, // #4ac47a
    { at: 0.58, color: [38, 208, 124], tone: "great" }, // #26d07c
];

export const WINRATE_SCALE_MIN = STOPS[0]!.at;
export const WINRATE_SCALE_MAX = STOPS[STOPS.length - 1]!.at;

function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
}

function toHex(channel: number): string {
    return Math.round(clamp(channel, 0, 255))
        .toString(16)
        .padStart(2, "0");
}

/**
 * A hex colour for a 0-1 win rate. Use it for anything CSS classes cannot
 * express: SVG strokes, chart series, gradient stops.
 */
export function winrateColor(winrate: number): string {
    if (!Number.isFinite(winrate)) return "#8b98ad";
    const value = clamp(winrate, WINRATE_SCALE_MIN, WINRATE_SCALE_MAX);

    let lower = STOPS[0]!;
    let upper = STOPS[STOPS.length - 1]!;
    for (let index = 0; index < STOPS.length - 1; index += 1) {
        const a = STOPS[index]!;
        const b = STOPS[index + 1]!;
        if (value >= a.at && value <= b.at) {
            lower = a;
            upper = b;
            break;
        }
    }

    const span = upper.at - lower.at;
    const t = span === 0 ? 0 : (value - lower.at) / span;
    const [r1, g1, b1] = lower.color;
    const [r2, g2, b2] = upper.color;
    return `#${toHex(r1 + (r2 - r1) * t)}${toHex(g1 + (g2 - g1) * t)}${toHex(
        b1 + (b2 - b1) * t,
    )}`;
}

/** The qualitative bucket a win rate falls in. */
export function winrateTone(winrate: number): WinrateTone {
    if (!Number.isFinite(winrate)) return "neutral";
    if (winrate < 0.455) return winrate < 0.435 ? "terrible" : "bad";
    if (winrate > 0.545) return winrate > 0.565 ? "great" : "good";
    return "neutral";
}

const TEXT_CLASS: Record<WinrateTone, string> = {
    terrible: "text-winrate-terrible",
    bad: "text-winrate-bad",
    neutral: "text-winrate-neutral",
    good: "text-winrate-good",
    great: "text-winrate-great",
};

const BG_CLASS: Record<WinrateTone, string> = {
    terrible: "bg-winrate-terrible",
    bad: "bg-winrate-bad",
    neutral: "bg-winrate-neutral",
    good: "bg-winrate-good",
    great: "bg-winrate-great",
};

/** Tailwind text colour for a 0-1 win rate. */
export function winrateTextClass(winrate: number): string {
    return TEXT_CLASS[winrateTone(winrate)];
}

/** Tailwind background colour for a 0-1 win rate. */
export function winrateBgClass(winrate: number): string {
    return BG_CLASS[winrateTone(winrate)];
}

/**
 * A colour for a *delta* (a win-probability contribution, centred on 0).
 * `+0.03` is as green as a 53 % win rate.
 */
export function deltaColor(delta: number): string {
    return winrateColor(0.5 + (Number.isFinite(delta) ? delta : 0));
}

export function deltaTone(delta: number): WinrateTone {
    return winrateTone(0.5 + (Number.isFinite(delta) ? delta : 0));
}

/**
 * Where a win rate sits on a bar drawn over [min, max], as a 0-1 share.
 * Defaults match the colour scale, so bar and colour always agree.
 */
export function winrateBarShare(
    winrate: number,
    min: number = WINRATE_SCALE_MIN,
    max: number = WINRATE_SCALE_MAX,
): number {
    if (!Number.isFinite(winrate) || max <= min) return 0.5;
    return clamp((winrate - min) / (max - min), 0, 1);
}
