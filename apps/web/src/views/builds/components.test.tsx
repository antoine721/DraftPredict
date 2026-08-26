import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import type { BuildEntry, ChampionSummary } from "../../api";
import { ChampionTable, orderIndexRows, type IndexRow } from "./ChampionIndex";
import { DamageBar } from "./DamageBar";
import { EntryRow } from "./EntryRow";
import { PairTable } from "./PairTable";
import { TierBadge } from "./TierBadge";
import { resolveRole } from "./ChampionsView";
import type { ChampionRoleRow, PairRow } from "./stats";

/**
 * The pieces that the full-screen test cannot reach: the table layout (the
 * stored preference is not readable during server rendering), and the small
 * components whose whole job is to be honest about a sample.
 */

function html(node: ReactNode): string {
    return renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
}

const champion = (key: string, name: string, icon = ""): ChampionSummary => ({
    key,
    id: name,
    name,
    title: `titre de ${name}`,
    tags: ["Fighter"],
    icon,
});

const roleRow = (key: string, games: number, wins: number): ChampionRoleRow => ({
    championKey: key,
    role: 0,
    games,
    wins,
    winrate: games > 0 ? wins / games : 0.5,
    adjustedWinrate: 0.51,
    rating: 8,
    pickrate: 0.034,
    roleShare: 0.9,
    damage: { magic: 0.2, physical: 0.7, true: 0.1 },
    statsByTime: [],
});

const indexRow = (key: string, name: string, games: number): IndexRow => ({
    champion: champion(key, name),
    row: roleRow(key, games, Math.round(games * 0.52)),
    others: [],
    tier: { tier: "A", score: 0.9, ratingZ: 0.8, popularityZ: 0.2 },
    favourite: false,
});

describe("champion table", () => {
    it("renders a row per champion, with bans marked as unavailable", () => {
        const markup = html(
            <ChampionTable
                rows={[
                    indexRow("266", "Aatrox", 1806),
                    indexRow("122", "Darius", 21716),
                ]}
                onToggleFavourite={() => {}}
            />,
        );
        expect(markup).toContain("Aatrox");
        expect(markup).toContain("Darius");
        expect(markup).toContain("n/d");
        expect(markup).toContain('href="/champions/266?role=0"');
        // Initials, not a broken image: the CDN is not reachable.
        expect(markup).toContain(">AA<");
    });

    it("marks the sorted column for assistive technology", () => {
        const markup = html(
            <ChampionTable
                rows={[indexRow("266", "Aatrox", 1806)]}
                sort="winrate"
                ascending={false}
                onSort={() => {}}
                onToggleFavourite={() => {}}
            />,
        );
        expect(markup).toContain('aria-sort="descending"');
        expect(markup).toContain('aria-sort="none"');
    });

    it("offers a favourite toggle labelled for screen readers", () => {
        const markup = html(
            <ChampionTable
                rows={[indexRow("266", "Aatrox", 1806)]}
                onToggleFavourite={() => {}}
            />,
        );
        expect(markup).toContain('aria-label="Ajouter Aatrox aux favoris"');
    });
});

describe("orderIndexRows", () => {
    const rows = [indexRow("1", "Beta", 100), indexRow("2", "Alpha", 5000)];

    it("pins favourites above everything else", () => {
        const ordered = orderIndexRows(
            [rows[0], { ...rows[1], favourite: true }],
            "games",
            false,
        );
        expect(ordered[0].champion.name).toBe("Alpha");
    });

    it("sorts by the requested column and direction", () => {
        expect(orderIndexRows(rows, "games", false)[0].champion.name).toBe("Alpha");
        expect(orderIndexRows(rows, "games", true)[0].champion.name).toBe("Beta");
        expect(orderIndexRows(rows, "name", true)[0].champion.name).toBe("Alpha");
    });

    it("pushes champions without data in the role to the bottom", () => {
        const missing: IndexRow = { ...rows[0], row: null, tier: null };
        expect(orderIndexRows([missing, rows[1]], "winrate", false)[1]).toBe(missing);
    });
});

describe("resolveRole", () => {
    const rows = [
        roleRow("266", 1806, 950),
        { ...roleRow("266", 400, 200), role: 1 as const },
    ];

    it("honours the requested role when the champion is played there", () => {
        expect(resolveRole(rows, "1")).toBe(1);
    });

    it("falls back to the most played role", () => {
        expect(resolveRole(rows, null)).toBe(0);
        expect(resolveRole(rows, "4")).toBe(0);
        expect(resolveRole(rows, "not-a-role")).toBe(0);
    });

    it("still answers something for a champion with no data at all", () => {
        expect(resolveRole([], "3")).toBe(3);
        expect(resolveRole([], null)).toBe(0);
    });
});

describe("honesty of a single row", () => {
    const entry = (games: number): BuildEntry => ({
        id: 3009,
        name: "Boots of Swiftness",
        icon: null,
        rating: 12,
        winrate: 0.62,
        winrateDelta: 0.017,
        wins: games * 0.62,
        games,
        matchups: [],
    });

    it("de-emphasises a 11-game winrate and keeps its interval", () => {
        const markup = html(
            <ul>
                <EntryRow entry={entry(11)} icon={<span />} title="Bottes" />
            </ul>,
        );
        expect(markup).toContain("opacity-70");
        expect(markup).toContain("Échantillon insuffisant");
        expect(markup).toContain("text-ink-subtle");
    });

    it("colours a 3 000-game winrate normally", () => {
        const markup = html(
            <ul>
                <EntryRow entry={entry(3000)} icon={<span />} title="Bottes" />
            </ul>,
        );
        expect(markup).not.toContain("opacity-70");
        expect(markup).toContain("text-winrate");
    });

    it("adds a versus column only when a matchup is requested", () => {
        const withMatchup: BuildEntry = {
            ...entry(3000),
            matchups: [
                {
                    championKey: "122",
                    name: "Darius",
                    role: 0,
                    rating: 8,
                    wins: 400,
                    games: 800,
                },
            ],
        };
        const markup = html(
            <ul>
                <EntryRow
                    entry={withMatchup}
                    icon={<span />}
                    title="Bottes"
                    enemyKey="122"
                    enemyName="Darius"
                />
            </ul>,
        );
        expect(markup).toContain("Darius");
    });
});

describe("pair table", () => {
    const rows: PairRow[] = [
        {
            championKey: "122",
            role: 0,
            games: 700,
            wins: 340,
            winrate: 340 / 700,
            rating: -12,
            winrateDelta: -0.017,
        },
    ];

    it("shows the pairing, its delta and its sample", () => {
        const markup = html(
            <PairTable
                rows={rows}
                byKey={new Map([["122", champion("122", "Darius")]])}
                emptyLabel="rien"
            />,
        );
        expect(markup).toContain("Darius");
        expect(markup).toContain("Apport");
        expect(markup).toContain("700");
    });

    it("names an unknown champion by its key instead of rendering a blank", () => {
        const markup = html(
            <PairTable rows={rows} byKey={new Map()} emptyLabel="rien" />,
        );
        expect(markup).toContain("Champion 122");
    });

    it("renders an empty state rather than an empty table", () => {
        const markup = html(
            <PairTable rows={[]} byKey={new Map()} emptyLabel="Aucun duel" />,
        );
        expect(markup).toContain("Aucun duel");
    });
});

describe("small components", () => {
    it("labels a damage profile for screen readers", () => {
        const markup = html(
            <DamageBar profile={{ magic: 20, physical: 70, true: 10 }} />,
        );
        expect(markup).toContain('role="img"');
        expect(markup).toContain("Physiques");
        expect(markup).toContain("70");
    });

    it("says so when a champion has no recorded damage", () => {
        expect(
            html(<DamageBar profile={{ magic: 0, physical: 0, true: 0 }} />),
        ).toContain("indisponible");
    });

    it("shows a dash instead of a tier for an unrated champion", () => {
        expect(html(<TierBadge estimate={null} />)).toContain("pas assez de données");
    });

    it("attaches the recipe to every tier it does show", () => {
        const markup = html(
            <TierBadge
                estimate={{ tier: "S", score: 2, ratingZ: 1.8, popularityZ: 0.4 }}
            />,
        );
        expect(markup).toContain('aria-label="Tier S"');
    });
});
