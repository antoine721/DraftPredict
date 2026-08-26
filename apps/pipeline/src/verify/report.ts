import type { VerifyReport, VerifyStatus } from "./verify.js";

const MARK: Record<VerifyStatus, string> = {
    pass: "PASS",
    warn: "WARN",
    fail: "FAIL",
};

/** Renders a {@link VerifyReport} as the block `verify` prints to a terminal. */
export function formatVerifyReport(report: VerifyReport, title = "dataset"): string {
    const lines: string[] = [];
    const summary = report.summary;

    lines.push(`${title}: v${summary.version || "?"} dated ${summary.date || "?"}`);
    lines.push(
        `  ${summary.champions} champions (${summary.championsWithGames} played), ` +
            `${summary.totalGames.toLocaleString("en-US")} champion-games ` +
            `(~${Math.round(summary.impliedMatches).toLocaleString("en-US")} matches)`,
    );
    lines.push(
        `  ${summary.matchupEntries.toLocaleString("en-US")} matchup entries, ` +
            `${summary.synergyEntries.toLocaleString("en-US")} synergy entries`,
    );
    lines.push("");

    for (const check of report.checks) {
        lines.push(`  [${MARK[check.status]}] ${check.name}: ${check.message}`);
        for (const detail of check.details ?? []) {
            lines.push(`         - ${detail}`);
        }
    }

    lines.push("");
    lines.push(
        report.ok
            ? `OK — ${report.checks.length} checks, ${report.warnings} warning(s)`
            : `FAILED — ${report.failures} failing check(s), ${report.warnings} warning(s)`,
    );

    return lines.join("\n");
}
