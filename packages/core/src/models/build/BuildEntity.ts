import type { Skill, SkillOrder } from "./BuildDataset.js";

export type RuneEntityType =
    | "primary"
    | "secondary"
    | "shard-offense"
    | "shard-defense"
    | "shard-flex";

export type BuildEntity =
    | {
          type: "rune";
          runeType: RuneEntityType;
          id: number;
      }
    | {
          type: "item";
          /** Order index (0-based) or "boots". */
          itemType: number | "boots";
          id: number;
      }
    | {
          type: "item";
          itemType: "startingSets" | "sets";
          id: string;
      }
    | {
          type: "summonerSpells";
          id: string;
      }
    | ({
          type: "skills";
      } & (
          | {
                skillsType: "order";
                id: SkillOrder;
            }
          | {
                skillsType: "level";
                level: number;
                id: Skill;
            }
      ));

export type BuildEntityType = BuildEntity["type"];
