import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Every Data Dragon image in the app goes through here.
 *
 * The CDN is optional by design: it is blocked in the development container,
 * it is unreachable on a plane, and it fails silently behind some corporate
 * proxies. So the fallback is not an error path — it is the *initial* state.
 * The `<img>` is rendered transparent on top of a real, readable placeholder
 * and only fades in once the browser says it decoded. Nothing ever collapses,
 * flickers grey or shows a broken-image glyph.
 */

export type GameImageProps = {
    src: string | null | undefined;
    alt: string;
    /** Rendered underneath, and left visible when the image never loads. */
    fallback: ReactNode;
    className?: string;
    imgClassName?: string;
    /** `loading="lazy"` by default; pass `"eager"` above the fold. */
    loading?: "lazy" | "eager";
    title?: string;
};

export function GameImage({
    src,
    alt,
    fallback,
    className,
    imgClassName,
    loading = "lazy",
    title,
}: GameImageProps) {
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);

    // A new src is a new attempt, even if the previous one failed.
    useEffect(() => {
        setLoaded(false);
        setFailed(false);
    }, [src]);

    const usable = typeof src === "string" && src.length > 0 && !failed;

    return (
        <span
            className={cn(
                "relative isolate inline-flex shrink-0 items-center justify-center overflow-hidden",
                className,
            )}
            title={title}
        >
            <span
                aria-hidden={usable && loaded ? true : undefined}
                className="absolute inset-0 flex items-center justify-center"
            >
                {fallback}
            </span>
            {usable && (
                <img
                    src={src}
                    alt={alt}
                    loading={loading}
                    decoding="async"
                    draggable={false}
                    onLoad={() => setLoaded(true)}
                    onError={() => setFailed(true)}
                    className={cn(
                        "relative h-full w-full object-cover transition-opacity duration-200",
                        loaded ? "opacity-100" : "opacity-0",
                        imgClassName,
                    )}
                />
            )}
        </span>
    );
}
