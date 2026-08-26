import type { Role } from "../Role";
import type { ChampionData } from "./ChampionData";

/** A champion plus the probability that it is played in each role. */
export type PickData = ChampionData & {
    probabilityByRole: Map<Role, number>;
};
