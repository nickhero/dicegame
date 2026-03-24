// Socket.IO typed events — will be expanded in Phase 5

export interface ServerToClientEvents {
  'lobby:gameList': (games: unknown[]) => void;
  'game:stateUpdate': (state: unknown) => void;
  'game:battleResult': (result: unknown) => void;
  'game:turnChanged': (data: unknown) => void;
  'game:aiAction': (action: unknown) => void;
  'game:gameOver': (data: unknown) => void;
  'game:error': (error: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'game:attack': (data: { from: number; to: number }, ack: (result: unknown) => void) => void;
  'game:endTurn': (ack: (result: unknown) => void) => void;
}

export interface SocketData {
  userId: string;
  userName: string;
}
