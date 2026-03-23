// AI Personality system — pure TypeScript, no Phaser imports.

import { AIMove } from './AIPlayer';
import { GameState } from './GameState';
import { findConnectedComponents, buildAdjacencyMap } from '../utils/graph';

export type PersonalityType =
  | 'cautious'
  | 'balanced'
  | 'aggressive'
  | 'reckless'
  | 'expansionist'
  | 'turtle';

export interface AIPersonality {
  type: PersonalityType;
  label: string;
  minAdvantage: number;       // minimum dice advantage to consider attacking
  maxAttacksPerTurn: number;  // cap on attacks per turn (Infinity = no cap)
  /** Extra score for moves that connect disconnected territory groups. */
  connectivityBonus: number;
  description: string;
}

export const PERSONALITIES: Record<PersonalityType, AIPersonality> = {
  cautious: {
    type: 'cautious',
    label: 'Cautious',
    minAdvantage: 2,
    maxAttacksPerTurn: 3,
    connectivityBonus: 0,
    description: 'Only attacks when very safe. Builds up slowly.',
  },
  balanced: {
    type: 'balanced',
    label: 'Balanced',
    minAdvantage: 1,
    maxAttacksPerTurn: Infinity,
    connectivityBonus: 0,
    description: 'Attacks favorable targets. Standard strategy.',
  },
  aggressive: {
    type: 'aggressive',
    label: 'Aggressive',
    minAdvantage: 0,
    maxAttacksPerTurn: Infinity,
    connectivityBonus: 0,
    description: 'Attacks even at equal odds. Expands fast, dies fast.',
  },
  reckless: {
    type: 'reckless',
    label: 'Reckless',
    minAdvantage: -1,
    maxAttacksPerTurn: Infinity,
    connectivityBonus: 0,
    description: 'Yolo attacks, even at disadvantage. Chaotic wildcard.',
  },
  expansionist: {
    type: 'expansionist',
    label: 'Expansionist',
    minAdvantage: 1,
    maxAttacksPerTurn: Infinity,
    connectivityBonus: 5,
    description: 'Prioritizes connecting territory groups over raw advantage.',
  },
  turtle: {
    type: 'turtle',
    label: 'Turtle',
    minAdvantage: 3,
    maxAttacksPerTurn: 2,
    connectivityBonus: 0,
    description: 'Almost never attacks. Hoards dice. Dangerous late-game.',
  },
};

export const ALL_PERSONALITY_TYPES: PersonalityType[] = Object.keys(PERSONALITIES) as PersonalityType[];

/**
 * Score a move based on the AI's personality.
 * Higher score = more attractive move.
 */
export function scoreMove(
  move: AIMove,
  personality: AIPersonality,
  state: GameState,
): number {
  // Base score is the dice advantage
  let score = move.advantage;

  // Connectivity bonus: extra score if capturing the target would connect
  // two of our territory groups
  if (personality.connectivityBonus > 0) {
    const playerId = state.currentPlayerIndex;
    const wouldConnect = checkConnectivityGain(
      move.defenderId,
      playerId,
      state,
    );
    if (wouldConnect) {
      score += personality.connectivityBonus;
    }
  }

  return score;
}

/**
 * Check if capturing targetId would connect previously disconnected groups
 * of the given player's territories.
 */
export function checkConnectivityGain(
  targetId: number,
  playerId: number,
  state: GameState,
): boolean {
  const ownedIds = state.territories
    .filter((t) => t.owner === playerId)
    .map((t) => t.id);

  // Current number of connected components
  const currentComponents = countPlayerComponents(ownedIds, state);

  // Components if we owned the target too
  const withTarget = [...ownedIds, targetId];
  const futureComponents = countPlayerComponents(withTarget, state);

  return futureComponents < currentComponents;
}

function countPlayerComponents(
  territoryIds: number[],
  state: GameState,
): number {
  if (territoryIds.length === 0) return 0;
  const idSet = new Set(territoryIds);
  const edges: [number, number][] = [];

  for (const id of territoryIds) {
    const t = state.territories[id];
    for (const nId of t.neighbors) {
      if (idSet.has(nId)) {
        edges.push([id, nId]);
      }
    }
  }

  const adjacency = buildAdjacencyMap(edges);
  const components = findConnectedComponents(territoryIds, adjacency);
  return components.length;
}

/**
 * Filter moves that meet the personality's minimum advantage threshold.
 */
export function filterMovesByPersonality(
  moves: AIMove[],
  personality: AIPersonality,
): AIMove[] {
  return moves.filter((m) => m.advantage >= personality.minAdvantage);
}

/**
 * Pick a random personality type (useful for game setup).
 */
export function getRandomPersonality(rng: { next: () => number }): PersonalityType {
  const types = ALL_PERSONALITY_TYPES;
  const index = Math.floor(rng.next() * types.length);
  return types[index];
}

/* ------------------------------------------------------------------ */
/*  Custom AI Presets                                                  */
/* ------------------------------------------------------------------ */

export interface CustomAIPreset {
  name: string;
  minAdvantage: number;
  maxAttacksPerTurn: number;  // Infinity for unlimited
  connectivityBonus: number;
}

const CUSTOM_PRESETS_KEY = 'dicewars-custom-ai-presets';

/** Convert a custom preset to an AIPersonality config usable by the AI system. */
export function customPresetToPersonality(preset: CustomAIPreset): AIPersonality {
  const maxLabel = preset.maxAttacksPerTurn === Infinity ? '∞' : String(preset.maxAttacksPerTurn);
  return {
    type: 'balanced',
    label: preset.name || 'Custom',
    minAdvantage: preset.minAdvantage,
    maxAttacksPerTurn: preset.maxAttacksPerTurn,
    connectivityBonus: preset.connectivityBonus,
    description: `Custom: adv≥${preset.minAdvantage}, max=${maxLabel}, conn=${preset.connectivityBonus}`,
  };
}

/** Save a custom preset to localStorage. Overwrites if name already exists. */
export function saveCustomPreset(preset: CustomAIPreset): void {
  const name = preset.name.trim();
  if (!name) return;
  try {
    const existing = loadCustomPresets();
    const filtered = existing.filter((p) => p.name !== name);
    filtered.push({ ...preset, name });
    const serialized = filtered.map(serializePreset);
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(serialized));
  } catch {
    // Storage unavailable — silently ignore
  }
}

/** Load all custom presets from localStorage. */
export function loadCustomPresets(): CustomAIPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(deserializePreset).filter(isValidPreset);
  } catch {
    return [];
  }
}

/** Delete a custom preset by name. */
export function deleteCustomPreset(name: string): void {
  try {
    const existing = loadCustomPresets();
    const filtered = existing.filter((p) => p.name !== name);
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(filtered.map(serializePreset)));
  } catch {
    // Storage unavailable — silently ignore
  }
}

function serializePreset(preset: CustomAIPreset): object {
  return {
    name: preset.name,
    minAdvantage: preset.minAdvantage,
    maxAttacksPerTurn: preset.maxAttacksPerTurn === Infinity ? -1 : preset.maxAttacksPerTurn,
    connectivityBonus: preset.connectivityBonus,
  };
}

function deserializePreset(raw: Record<string, unknown>): CustomAIPreset {
  return {
    name: String(raw.name ?? ''),
    minAdvantage: Number(raw.minAdvantage ?? 1),
    maxAttacksPerTurn: raw.maxAttacksPerTurn === -1 ? Infinity : Number(raw.maxAttacksPerTurn ?? Infinity),
    connectivityBonus: Number(raw.connectivityBonus ?? 0),
  };
}

function isValidPreset(preset: CustomAIPreset): boolean {
  return (
    typeof preset.name === 'string' &&
    preset.name.trim().length > 0 &&
    typeof preset.minAdvantage === 'number' &&
    Number.isFinite(preset.minAdvantage) &&
    typeof preset.maxAttacksPerTurn === 'number' &&
    (Number.isFinite(preset.maxAttacksPerTurn) || preset.maxAttacksPerTurn === Infinity) &&
    typeof preset.connectivityBonus === 'number' &&
    Number.isFinite(preset.connectivityBonus)
  );
}
