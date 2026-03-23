import { PersonalityType, AIPersonality } from './AIPersonality';

export interface Player {
  id: number;
  name: string;
  isHuman: boolean;
  isAlive: boolean;
  reserveDice: number; // surplus dice stored when all territories are at max
  color: number;       // hex color
  personality: PersonalityType | null; // null for human players
  customPersonalityConfig?: AIPersonality; // overrides named personality when set
}

export function createPlayer(
  id: number,
  name: string,
  isHuman: boolean,
  color: number,
  personality: PersonalityType | null = null,
  customPersonalityConfig?: AIPersonality,
): Player {
  return {
    id,
    name,
    isHuman,
    isAlive: true,
    reserveDice: 0,
    color,
    personality,
    customPersonalityConfig,
  };
}
