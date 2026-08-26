import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "../../lib";
import { Badge, Panel } from "../../ui";
import { toUserMessage } from "../../api";
import type { Report } from "./helpers";

/**
 * The layout primitives shared by every settings panel.
 *
 * A settings row is always the same three things: what the option is called,
 * what it actually changes, and the control. Splitting that into a component
 * keeps the seven panels visually identical and stops each one from inventing
 * its own margins.
 */

export type SettingsSectionProps = {
    /** Anchor target, so `/parametres#cle-api` scrolls straight to it. */
    id: string;
    title: string;
    subtitle?: ReactNode;
    icon?: ReactNode;
    actions?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
};

export function SettingsSection({
    id,
    title,
    subtitle,
    icon,
    actions,
    footer,
    children,
}: SettingsSectionProps) {
    return (
        <Panel
            id={id}
            className="scroll-mt-24"
            title={title}
            subtitle={
                subtitle === undefined ? undefined : (
                    <span className="flex items-center gap-1.5">
                        {icon !== undefined && (
                            <span aria-hidden className="text-gold">
                                {icon}
                            </span>
                        )}
                        <span className="min-w-0">{subtitle}</span>
                    </span>
                )
            }
            actions={actions}
            footer={footer}
        >
            {children}
        </Panel>
    );
}

export type SettingRowProps = {
    title: ReactNode;
    /** What the setting changes, in one or two sentences. Never optional in spirit. */
    description?: ReactNode;
    /** Extra explanation shown under the control. */
    note?: ReactNode;
    /** The control itself. */
    children: ReactNode;
    /** Lets the control span the full width (a table, a list of chips). */
    stacked?: boolean;
    className?: string;
};

export function SettingRow({
    title,
    description,
    note,
    children,
    stacked = false,
    className,
}: SettingRowProps) {
    return (
        <div
            className={cn(
                "flex flex-col gap-3 border-b border-line py-4 first:pt-0 last:border-b-0 last:pb-0",
                !stacked && "md:flex-row md:items-start md:justify-between md:gap-8",
                className,
            )}
        >
            <div className="min-w-0 max-w-prose">
                <p className="text-sm font-medium text-ink">{title}</p>
                {description !== undefined && (
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                        {description}
                    </p>
                )}
            </div>
            <div
                className={cn(
                    "min-w-0",
                    stacked ? "w-full" : "w-full shrink-0 md:w-72",
                )}
            >
                {children}
                {note !== undefined && (
                    <p className="mt-2 text-xs text-ink-subtle">{note}</p>
                )}
            </div>
        </div>
    );
}

/** A `Report` rendered as a badge plus its sentence. */
export function ReportLine({
    report,
    className,
}: {
    report: Report;
    className?: string;
}) {
    return (
        <div className={cn("flex flex-wrap items-center gap-2", className)}>
            <Badge tone={report.tone} dot>
                {report.label}
            </Badge>
            <span className="min-w-0 text-xs text-ink-muted">{report.detail}</span>
        </div>
    );
}

/**
 * A write that failed, shown where it happened.
 *
 * A toast disappears; a setting that did not save must stay visibly unsaved.
 */
export function SaveError({ error }: { error: unknown }) {
    if (error === null || error === undefined) return null;
    return (
        <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-card border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative"
        >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0">
                Modification non enregistrée : {toUserMessage(error)}
            </span>
        </p>
    );
}

/** A short list of facts (« lit ceci », « ne fait jamais cela »). */
export function FactList({
    items,
    tone = "neutral",
}: {
    items: readonly string[];
    tone?: "neutral" | "positive" | "negative";
}) {
    const marker =
        tone === "positive"
            ? "text-positive"
            : tone === "negative"
              ? "text-negative"
              : "text-ink-subtle";
    return (
        <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-ink-muted">
            {items.map((item) => (
                <li key={item} className="flex gap-2">
                    <span aria-hidden className={cn("shrink-0", marker)}>
                        {tone === "negative" ? "✕" : "•"}
                    </span>
                    <span className="min-w-0">{item}</span>
                </li>
            ))}
        </ul>
    );
}
