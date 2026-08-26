import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DatasetNotice } from "../app/DatasetNotice";
import type { DatasetPairMeta } from "../api/types";
import * as UI from "./index";

/**
 * The design system, rendered.
 *
 * Server rendering needs no DOM, so this runs in the default `node`
 * environment: every primitive is rendered to HTML and inspected. Two
 * properties matter more than the markup itself and are asserted explicitly:
 *
 * - **Nothing depends on Data Dragon.** The container blocks the CDN, so every
 *   image component must produce a readable fallback with no image at all.
 * - **Interactive primitives carry their ARIA role**, since none of them are
 *   native elements a screen reader already understands.
 */

const OFFLINE_DATASET = {
    rank: "PLATINUM_PLUS",
    region: "ALL",
    provider: "bundled-fixture",
    date: "2026-08-26",
    offline: true,
} as unknown as DatasetPairMeta;

const LIVE_DATASET = {
    ...OFFLINE_DATASET,
    provider: "draftgap-remote",
    offline: false,
} as unknown as DatasetPairMeta;

describe("images without a CDN", () => {
    it("shows champion initials when there is no icon at all", () => {
        const html = renderToStaticMarkup(
            <UI.ChampionAvatar
                champion={{ key: "266", id: "Aatrox", name: "Aatrox", icon: null }}
            />,
        );
        expect(html).toContain(">AA<");
        expect(html).not.toContain("<img");
    });

    it("renders the initials underneath an image that may never load", () => {
        const html = renderToStaticMarkup(
            <UI.ChampionAvatar
                champion={{
                    key: "21",
                    name: "Miss Fortune",
                    icon: "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/MissFortune.png",
                }}
            />,
        );
        // The fallback is the initial state, not an error path: it is in the
        // markup from the first paint, with the image transparent on top.
        expect(html).toContain(">MF<");
        expect(html).toContain("opacity-0");
    });

    it("falls back for items, runes, spells and skills too", () => {
        const html = renderToStaticMarkup(
            <div>
                <UI.ItemIcon id={3009} name="Boots of Swiftness" corner={1} />
                <UI.RuneIcon name="Electrocute" keystone />
                <UI.SpellIcon name="Flash" />
                <UI.SkillIcon slot="q" active />
            </div>,
        );
        expect(html).toContain(">BO<");
        expect(html).toContain(">E<");
        expect(html).toContain(">FL<");
        expect(html).toContain(">Q<");
    });

    it("draws all five role icons inline", () => {
        const html = renderToStaticMarkup(
            <div>
                {([0, 1, 2, 3, 4] as const).map((role) => (
                    <UI.RoleIcon key={role} role={role} />
                ))}
            </div>,
        );
        expect(html.match(/<svg/g)).toHaveLength(5);
        expect(html).toContain("Toplane");
        expect(html).toContain("Support");
    });
});

describe("data display", () => {
    it("colours the winrate bar from the shared scale", () => {
        const html = renderToStaticMarkup(<UI.WinrateBar winrate={0.4511} />);
        expect(html).toContain('role="meter"');
        expect(html).toMatch(/background-color:#[0-9a-f]{6}/);
        expect(html).toContain("45,1");
    });

    it("renders a delta bar on both sides of zero", () => {
        const negative = renderToStaticMarkup(<UI.DeltaBar delta={-0.0324} />);
        const positive = renderToStaticMarkup(<UI.DeltaBar delta={0.0324} />);
        expect(negative).toContain("-3,2");
        expect(positive).toContain("+3,2");
        expect(negative).not.toBe(positive);
    });

    it("labels offline datasets as demonstration data", () => {
        const html = renderToStaticMarkup(<DatasetNotice dataset={OFFLINE_DATASET} />);
        expect(html).toContain("démonstration hors-ligne");
    });

    it("names the provider when the data is real", () => {
        const html = renderToStaticMarkup(<DatasetNotice dataset={LIVE_DATASET} />);
        expect(html).toContain("draftgap-remote");
        expect(html).not.toContain("démonstration");
    });
});

describe("interactive primitives", () => {
    it("carry the right ARIA roles", () => {
        const html = renderToStaticMarkup(
            <div>
                <UI.Tabs items={[{ value: "a", label: "Objets" }]}>
                    {(value) => <span>{value}</span>}
                </UI.Tabs>
                <UI.Toggle checked onCheckedChange={() => {}} ariaLabel="Suivre" />
                <UI.ProgressBar value={0.46} />
                <UI.Tooltip content="info">
                    <span>survoler</span>
                </UI.Tooltip>
            </div>,
        );
        expect(html).toContain('role="tablist"');
        expect(html).toContain('role="tab"');
        expect(html).toContain('role="switch"');
        expect(html).toContain('aria-checked="true"');
        expect(html).toContain('role="progressbar"');
        expect(html).toContain('role="tooltip"');
    });

    it("requires an accessible name on icon-only buttons", () => {
        const html = renderToStaticMarkup(
            <UI.IconButton label="Fermer" icon={<span>x</span>} />,
        );
        expect(html).toContain('aria-label="Fermer"');
    });

    it("keeps a dialog out of the markup until a document exists", () => {
        // `Dialog` portals into `document.body`; server-side there is none, so
        // it renders nothing instead of throwing.
        expect(
            renderToStaticMarkup(
                <UI.Dialog open onClose={() => {}} title="Choisir un champion">
                    contenu
                </UI.Dialog>,
            ),
        ).toBe("");
    });
});

describe("states", () => {
    it("renders the empty, error and Riot-key states in French", () => {
        const html = renderToStaticMarkup(
            <div>
                <UI.EmptyState title="Aucun champion" />
                <UI.ErrorState title="Erreur" description="Détail" onRetry={() => {}} />
                <UI.RiotKeyMissingState />
            </div>,
        );
        expect(html).toContain("Aucun champion");
        expect(html).toContain("Réessayer");
        expect(html).toContain("Connectez votre compte Riot");
        expect(html).toContain('role="alert"');
    });

    it("never leaks undefined into the markup", () => {
        const html = renderToStaticMarkup(
            <UI.Panel title="Panneau">
                <UI.Card>
                    <UI.Stat label="Victoire" value="51,2 %" />
                    <UI.Badge tone="gold">badge</UI.Badge>
                    <UI.Tag>Lee Sin</UI.Tag>
                    <UI.Skeleton className="h-4 w-20" />
                    <UI.Spinner />
                </UI.Card>
            </UI.Panel>,
        );
        expect(html).not.toContain("undefined");
    });
});
