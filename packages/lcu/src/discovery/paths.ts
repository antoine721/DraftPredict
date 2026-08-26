/**
 * Where the League Client leaves its lockfile.
 *
 * The client writes `lockfile` into its install directory while it runs and
 * deletes it on exit. There is no registry-free API for the install directory,
 * so we probe the handful of locations Riot's installers actually use, plus
 * anything the environment points us at.
 *
 * Path building is done by hand (`\` for Windows, `/` elsewhere) rather than
 * with `node:path`, so the candidate list for a platform is the same no matter
 * which platform is asking — that is what makes it testable.
 */

/** Environment a discovery run sees. Injected so tests never read the real one. */
export type DiscoveryEnvironment = {
    platform: NodeJS.Platform;
    env: Record<string, string | undefined>;
    homedir: string;
};

/** Env var pointing straight at a lockfile, for unusual installs and tests. */
export const LOCKFILE_PATH_ENV = "DRAFTPREDICT_LCU_LOCKFILE";

/** Name of the lockfile itself. */
export const LOCKFILE_NAME = "lockfile";

/** Install-directory suffix shared by every Riot installer. */
const RIOT_SUFFIX = ["Riot Games", "League of Legends"];

function winPath(...parts: string[]): string {
    return parts
        .map((part, index) => (index === 0 ? part.replace(/[\\/]+$/, "") : part))
        .join("\\");
}

function posixPath(...parts: string[]): string {
    return parts
        .map((part, index) => (index === 0 ? part.replace(/\/+$/, "") : part))
        .join("/");
}

function windowsCandidates(env: DiscoveryEnvironment["env"]): string[] {
    const roots: (string | undefined)[] = [
        env.LOCALAPPDATA,
        env.ProgramData,
        env["ProgramFiles"],
        env["ProgramFiles(x86)"],
        env.SystemDrive ?? "C:",
        "C:",
        "D:",
    ];

    const seen = new Set<string>();
    const paths: string[] = [];
    for (const root of roots) {
        if (!root || root.trim().length === 0) continue;
        const path = winPath(root, ...RIOT_SUFFIX, LOCKFILE_NAME);
        if (seen.has(path)) continue;
        seen.add(path);
        paths.push(path);
    }
    return paths;
}

function macCandidates(homedir: string): string[] {
    const app = ["League of Legends.app", "Contents", "LoL", LOCKFILE_NAME];
    return [
        posixPath("/Applications", ...app),
        posixPath(homedir, "Applications", ...app),
        posixPath("/Applications/Riot Games", ...app),
    ];
}

function linuxCandidates(env: DiscoveryEnvironment["env"], homedir: string): string[] {
    // On Linux the client only exists inside a Wine prefix (Lutris, plain Wine,
    // a Flatpak Lutris, or a hand-rolled prefix). Each prefix keeps the normal
    // Windows layout under `drive_c`.
    const prefixes = [
        env.WINEPREFIX,
        posixPath(homedir, "Games/league-of-legends"),
        posixPath(homedir, ".wine"),
        posixPath(homedir, ".local/share/wineprefixes/league-of-legends"),
        posixPath(homedir, ".local/share/lutris/prefixes/league-of-legends"),
        posixPath(
            homedir,
            ".var/app/net.lutris.Lutris/data/lutris/prefixes/league-of-legends",
        ),
        posixPath(
            homedir,
            ".var/app/net.lutris.Lutris/data/wineprefixes/league-of-legends",
        ),
    ];

    const seen = new Set<string>();
    const paths: string[] = [];
    for (const prefix of prefixes) {
        if (!prefix || prefix.trim().length === 0) continue;
        const path = posixPath(prefix, "drive_c", ...RIOT_SUFFIX, LOCKFILE_NAME);
        if (seen.has(path)) continue;
        seen.add(path);
        paths.push(path);
    }
    return paths;
}

/**
 * Lockfile paths to try, most likely first.
 *
 * `DRAFTPREDICT_LCU_LOCKFILE` always comes first when set, so a user with an
 * exotic install (or a test) can point us at the real file.
 */
export function lockfileCandidatePaths(environment: DiscoveryEnvironment): string[] {
    const override = environment.env[LOCKFILE_PATH_ENV]?.trim();
    const candidates: string[] = [];
    if (override) candidates.push(override);

    if (environment.platform === "win32") {
        candidates.push(...windowsCandidates(environment.env));
    } else if (environment.platform === "darwin") {
        candidates.push(...macCandidates(environment.homedir));
        // A Windows install reachable through a mounted volume is not a thing,
        // but a Wine prefix on macOS is — cheap to also try.
        candidates.push(...linuxCandidates(environment.env, environment.homedir));
    } else {
        candidates.push(...linuxCandidates(environment.env, environment.homedir));
    }

    return candidates.filter((path, index) => candidates.indexOf(path) === index);
}
