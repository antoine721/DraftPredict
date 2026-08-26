export type Team = "ally" | "opponent";

export const TEAMS = ["ally", "opponent"] as const;

export const displayNameByTeam: Record<Team, string> = {
    ally: "Ally",
    opponent: "Opponent",
};

export function otherTeam(team: Team): Team {
    return team === "ally" ? "opponent" : "ally";
}
