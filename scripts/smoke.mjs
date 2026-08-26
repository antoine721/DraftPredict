#!/usr/bin/env node
/**
 * DraftPredict smoke test.
 *
 * Exercises the running server end to end and prints a readable report:
 * static data, dataset provider, draft analysis, suggestions, bans, builds,
 * the League client integration and - when a Riot API key is configured -
 * account lookup, profile, matches, playstyle and live game.
 *
 * Usage:
 *   node scripts/smoke.mjs                      # everything that needs no key
 *   node scripts/smoke.mjs --riot-id "Nom#TAG"  # + the account features
 *   node scripts/smoke.mjs --watch              # then follow champ select live
 *
 * The Riot API key is never read, printed or transmitted by this script: it
 * lives server-side only. --riot-id merely asks the server to use it.
 */
import { parseArgs } from "node:util";

const { values } = parseArgs({
    options: {
        url: { type: "string", default: "http://localhost:4700" },
        "riot-id": { type: "string" },
        platform: { type: "string" },
        watch: { type: "boolean", default: false },
        timeout: { type: "string", default: "20000" },
    },
});

const BASE = values.url.replace(/\/$/, "");
const TIMEOUT = Number(values.timeout);

const ESC = "\u001b[";
const C = {
    reset: `${ESC}0m`,
    dim: `${ESC}2m`,
    bold: `${ESC}1m`,
    green: `${ESC}32m`,
    red: `${ESC}31m`,
    yellow: `${ESC}33m`,
    cyan: `${ESC}36m`,
};

const results = [];
const SKIP = Symbol("skip");

function line(status, name, detail) {
    const mark =
        status === "ok"
            ? `${C.green}OK${C.reset}  `
            : status === "skip"
              ? `${C.yellow}--${C.reset}  `
              : `${C.red}KO${C.reset}  `;
    console.log(`${mark}${name}${detail ? `  ${C.dim}${detail}${C.reset}` : ""}`);
    results.push({ status, name, detail });
}

async function call(path, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
        const response = await fetch(`${BASE}${path}`, {
            ...init,
            signal: controller.signal,
            headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
        });
        const text = await response.text();
        let body;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = text;
        }
        return { status: response.status, body };
    } finally {
        clearTimeout(timer);
    }
}

const post = (path, payload) =>
    call(path, { method: "POST", body: JSON.stringify(payload) });

async function step(name, run) {
    try {
        const detail = await run();
        if (detail === SKIP) return;
        line("ok", name, detail ?? "");
    } catch (error) {
        line("fail", name, error instanceof Error ? error.message : String(error));
    }
}

function skip(name, why) {
    line("skip", name, why);
    return SKIP;
}

function expectOk(response, path) {
    if (response.status >= 400) {
        const code = response.body?.error?.code ?? response.status;
        const message = response.body?.error?.message ?? "";
        throw new Error(`${path} -> ${code}${message ? `: ${message}` : ""}`);
    }
    return response.body;
}

const pct = (value) => `${(value * 100).toFixed(1)}%`;

console.log(
    `\n${C.bold}DraftPredict - test de bout en bout${C.reset}  ${C.dim}${BASE}${C.reset}\n`,
);

// ----------------------------------------------------------------- server ---
let health;
await step("Serveur joignable", async () => {
    health = expectOk(await call("/api/health"), "/api/health");
    return `v${health.version}, en ligne depuis ${Math.round((health.uptimeMs ?? 0) / 1000)}s`;
});

if (!health) {
    console.log(
        `\n${C.red}Le serveur ne repond pas.${C.reset} Lancez-le avec ${C.cyan}npm run dev${C.reset} ` +
            `(ou ${C.cyan}npm start${C.reset} apres ${C.cyan}npm run build${C.reset}), puis relancez ce script.\n`,
    );
    process.exit(1);
}

await step("Donnees statiques (Data Dragon)", async () => {
    const summary = expectOk(await call("/api/static/summary"), "/api/static/summary");
    if (!summary.champions?.length) throw new Error("aucun champion charge");
    return `patch ${summary.version} (${summary.source}), ${summary.counts.champions} champions, ${summary.counts.items} objets`;
});

await step("Dataset statistique", async () => {
    const { dataset } = health;
    if (!dataset?.available) throw new Error("aucun dataset disponible");
    const origin = dataset.offline
        ? `${C.yellow}fixture hors-ligne${C.reset}${C.dim}`
        : `source reelle "${dataset.provider}"`;
    return `${origin}, ${dataset.championCount} champions, date du ${dataset.date}`;
});

// ------------------------------------------------------------------ draft ---
// Aatrox top + Lee Sin jungle contre Darius top + Ahri mid.
const DRAFT = {
    team: [
        [0, "266"],
        [1, "64"],
    ],
    enemy: [
        [0, "122"],
        [2, "103"],
    ],
};

await step("Analyse de draft", async () => {
    const body = expectOk(
        await post("/api/draft/analyze", DRAFT),
        "/api/draft/analyze",
    );
    const winrate = body.result?.winrate;
    if (typeof winrate !== "number" || Number.isNaN(winrate)) {
        throw new Error("winrate absent ou invalide");
    }
    const contributions = Object.entries(body.breakdown ?? {})
        .map(([key, group]) => `${key}:${group?.entries?.length ?? 0}`)
        .join(" ");
    return `victoire alliee ${pct(winrate)} - ${contributions} - courbe ${body.winrateByTime?.length ?? 0} points`;
});

await step("Suggestions de picks", async () => {
    const body = expectOk(
        await post("/api/draft/suggestions", { ...DRAFT, limit: 5 }),
        "/api/draft/suggestions",
    );
    const best = body.best?.[0];
    if (!best) throw new Error("aucune suggestion renvoyee");
    const openRoles = body.roles?.filter((role) => role.open).length ?? 0;
    return `${openRoles} roles libres - meilleur choix ${best.name} (${pct(best.winrate)})`;
});

await step("Suggestions de bans", async () => {
    const body = expectOk(
        await post("/api/draft/bans", { ...DRAFT, limit: 5 }),
        "/api/draft/bans",
    );
    const top = body.bans?.[0];
    if (!top) throw new Error("aucun ban suggere");
    return `a bannir en priorite : ${top.name}`;
});

await step("Builds (objets, runes, sorts, competences)", async () => {
    const body = expectOk(await call("/api/builds/266?role=0"), "/api/builds/266");
    const items = body.items?.byOrder?.[0]?.length ?? body.items?.sets?.length ?? 0;
    const runes = body.runes?.primary?.length ?? 0;
    const spells = body.summonerSpells?.length ?? 0;
    return `${body.champion?.name ?? "?"} : ${items} objets, ${runes} runes, ${spells} paires de sorts`;
});

// --------------------------------------------------------- League client ---
let lcu;
await step("Client League of Legends", async () => {
    lcu = expectOk(await call("/api/lcu/status"), "/api/lcu/status");
    // A disabled integration is a configuration choice, not a malfunction:
    // report it as skipped so the run does not fail on a deliberate setting.
    if (!lcu.enabled) {
        return skip(
            "Client League of Legends",
            "integration desactivee - reactivez-la dans les parametres (ou retirez DRAFTPREDICT_LCU=0)",
        );
    }
    if (!lcu.connected) {
        return `${C.yellow}non connecte${C.reset}${C.dim} - lancez le client LoL puis relancez`;
    }
    const who = lcu.summoner?.displayName ?? lcu.summoner?.gameName ?? "compte inconnu";
    return `connecte - ${who} - phase "${lcu.phase ?? "?"}"`;
});

if (lcu?.connected) {
    await step("Champ select en direct", async () => {
        const body = expectOk(
            await call("/api/lcu/champ-select"),
            "/api/lcu/champ-select",
        );
        if (!body.inChampSelect) {
            return `${C.yellow}pas en selection${C.reset}${C.dim} - relancez pendant une draft`;
        }
        const picks = body.state?.ally?.length ?? 0;
        return `${picks} picks allies lus - victoire estimee ${pct(body.analysis?.result?.winrate ?? 0)}`;
    });
}

// ----------------------------------------------------------------- compte ---
const keyConfigured = health.riot?.configured === true;
let puuid = null;

if (!keyConfigured) {
    skip(
        "Compte Riot",
        "aucune cle API configuree - voir RIOT_API_KEY dans .env, ou POST /api/config",
    );
} else if (!values["riot-id"] && !lcu?.summoner?.puuid) {
    skip("Compte Riot", 'passez --riot-id "Nom#TAG" pour tester cette partie');
} else {
    await step("Recherche du compte", async () => {
        if (values["riot-id"]) {
            const query = new URLSearchParams({ riotId: values["riot-id"] });
            if (values.platform) query.set("platform", values.platform);
            const body = expectOk(
                await call(`/api/account/lookup?${query}`),
                "/api/account/lookup",
            );
            puuid = body.puuid;
            return `${body.gameName}#${body.tagLine} sur ${body.platform}`;
        }
        puuid = lcu.summoner.puuid;
        return "compte detecte depuis le client (aucune cle necessaire pour cette etape)";
    });

    if (puuid) {
        const platformQuery = values.platform ? `?platform=${values.platform}` : "";

        await step("Profil et rangs", async () => {
            const body = expectOk(
                await call(`/api/account/${puuid}/profile${platformQuery}`),
                "/api/account/:puuid/profile",
            );
            const solo = body.ranks?.solo;
            const rank = solo
                ? `${solo.tier} ${solo.rank} - ${solo.leaguePoints} LP`
                : "non classe";
            return `niveau ${body.summoner?.summonerLevel ?? "?"} - solo/duo : ${rank}`;
        });

        await step("Historique de parties", async () => {
            const query = new URLSearchParams({ count: "5" });
            if (values.platform) query.set("platform", values.platform);
            const body = expectOk(
                await call(`/api/account/${puuid}/matches?${query}`),
                "/api/account/:puuid/matches",
            );
            const games = body.matches?.length ?? 0;
            if (!games) return "aucune partie recente";
            const wins = body.matches.filter((match) => match.win).length;
            return `${games} parties - ${wins} victoires - dernier champion ${body.matches[0].champion?.name ?? "?"}`;
        });

        await step("Profil de style de jeu", async () => {
            const query = new URLSearchParams({ count: "20" });
            if (values.platform) query.set("platform", values.platform);
            const body = expectOk(
                await call(`/api/account/${puuid}/playstyle?${query}`),
                "/api/account/:puuid/playstyle",
            );
            const profile = body.profile;
            if (!profile) throw new Error("profil absent");
            const axes = Object.entries(profile.axes ?? {})
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([axis, score]) => `${axis} ${Math.round(score)}`)
                .join(", ");
            return `${profile.archetype?.key ?? "?"} sur ${body.sampleSize} parties - ${axes}`;
        });

        await step("Partie en cours", async () => {
            const body = expectOk(
                await call(`/api/account/${puuid}/live${platformQuery}`),
                "/api/account/:puuid/live",
            );
            if (!body.inGame) return "pas en partie actuellement";
            return `en partie - victoire estimee ${pct(body.analysis?.result?.winrate ?? 0)}`;
        });
    }
}

// -------------------------------------------------------------- websocket ---
await step("WebSocket temps reel", async () => {
    const socket = new WebSocket(`${BASE.replace(/^http/, "ws")}/ws`);
    const received = await new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error("aucun message en 10s")),
            10_000,
        );
        const seen = [];
        socket.onmessage = (event) => {
            try {
                seen.push(JSON.parse(event.data).type);
            } catch {
                /* ignore malformed frames */
            }
            if (seen.includes("hello")) {
                clearTimeout(timer);
                resolve(seen);
            }
        };
        socket.onerror = () => {
            clearTimeout(timer);
            reject(new Error("connexion refusee"));
        };
    });
    socket.close();
    return `connecte - trames recues : ${received.join(", ")}`;
});

// ------------------------------------------------------------------ bilan ---
const failed = results.filter((result) => result.status === "fail");
const skipped = results.filter((result) => result.status === "skip");
const passed = results.filter((result) => result.status === "ok");

console.log(
    `\n${C.bold}Bilan${C.reset}  ${C.green}${passed.length} ok${C.reset}` +
        (skipped.length ? `  ${C.yellow}${skipped.length} ignores${C.reset}` : "") +
        (failed.length ? `  ${C.red}${failed.length} en echec${C.reset}` : "") +
        "\n",
);

if (!values.watch) {
    process.exit(failed.length ? 1 : 0);
}

console.log(
    `${C.bold}Surveillance du champ select${C.reset} ${C.dim}(Ctrl+C pour arreter)${C.reset}\n`,
);

const watcher = new WebSocket(`${BASE.replace(/^http/, "ws")}/ws`);
watcher.onopen = () =>
    watcher.send(JSON.stringify({ type: "subscribe", topics: ["lcu", "champselect"] }));
watcher.onmessage = (event) => {
    let message;
    try {
        message = JSON.parse(event.data);
    } catch {
        return;
    }
    const at = new Date().toLocaleTimeString();
    if (message.type === "champselect:update") {
        const winrate = message.analysis?.result?.winrate;
        const best = message.suggestions?.best?.[0];
        console.log(
            `${at}  victoire ${winrate != null ? pct(winrate) : "?"}` +
                (best ? `  ${C.dim}meilleur pick : ${best.name}${C.reset}` : ""),
        );
    } else if (message.type === "champselect:end") {
        console.log(`${C.dim}${at}  fin de la selection${C.reset}`);
    } else if (message.type === "lcu:status") {
        const state = message.status?.connected ? "connecte" : "deconnecte";
        console.log(`${C.dim}${at}  client : ${state}${C.reset}`);
    }
};
