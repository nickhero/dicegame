// Game action recorder — pure TypeScript, no Phaser imports.

export type GameAction =
  | { type: 'attack'; attackerId: number; defenderId: number; attackerPlayerId: number; defenderPlayerId: number }
  | { type: 'endTurn'; playerId: number }
  | { type: 'surrender'; playerId: number }
  | { type: 'powerUp'; action: string; playerId: number; territoryId: number }
  | { type: 'fortify'; fromId: number; toId: number; diceCount: number; playerId: number }
  | { type: 'reinforce'; territoryId: number; playerId: number };

export interface TurnRecord {
  turnNumber: number;
  playerId: number;
  actions: GameAction[];
}

export class GameRecorder {
  private turns: TurnRecord[] = [];
  private currentTurn: TurnRecord | null = null;

  startTurn(turnNumber: number, playerId: number): void {
    this.endCurrentTurn();
    this.currentTurn = { turnNumber, playerId, actions: [] };
  }

  recordAction(action: GameAction): void {
    if (this.currentTurn) {
      this.currentTurn.actions.push(action);
    }
  }

  endCurrentTurn(): void {
    if (this.currentTurn) {
      this.turns.push(this.currentTurn);
      this.currentTurn = null;
    }
  }

  getRecording(): TurnRecord[] {
    const result = [...this.turns];
    if (this.currentTurn) {
      result.push(this.currentTurn);
    }
    return result;
  }

  clear(): void {
    this.turns = [];
    this.currentTurn = null;
  }
}
