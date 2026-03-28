// Re-export state serialization from FogFilter for convenience.
// gameHandlers uses serializeFullState for broadcasting to all players.
export { serializeFullState as serializeGameState } from '../services/FogFilter';

