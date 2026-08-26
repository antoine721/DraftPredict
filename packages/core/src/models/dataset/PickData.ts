import type { Role } from "../Role.js";
import type { ChampionData } from "./ChampionData.js";

/** A champion plus the probability that it is played in each role. */
export type PickData = ChampionData & {
    probabilityByRole: Map<Role, number>;
};
