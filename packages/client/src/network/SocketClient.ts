import { io, Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  SocketAck,
  BattleResultPayload,
  TurnChangedPayload,
  WireGameState,
  AttackIntent,
  PowerUpIntent,
  AllianceProposalIntent,
  AllianceResponseIntent,
} from '@dicewars/shared';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export class SocketClient {
  private socket: TypedSocket | null = null;
  private serverUrl: string;
  private _state: ConnectionState = 'disconnected';
  private stateListeners: Array<(state: ConnectionState) => void> = [];

  constructor(serverUrl: string = 'http://localhost:3001') {
    this.serverUrl = serverUrl;
  }

  get state(): ConnectionState {
    return this._state;
  }

  get isConnected(): boolean {
    return this._state === 'connected';
  }

  private setState(state: ConnectionState): void {
    this._state = state;
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  onConnectionStateChange(handler: (state: ConnectionState) => void): () => void {
    this.stateListeners.push(handler);
    return () => {
      this.stateListeners = this.stateListeners.filter((h) => h !== handler);
    };
  }

  connect(token: string, namespace: string = '/'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.setState('connecting');

      this.socket = io(`${this.serverUrl}${namespace}`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      }) as TypedSocket;

      this.socket.on('connect', () => {
        this.setState('connected');
        resolve();
      });

      this.socket.on('connect_error', (err) => {
        if (this._state === 'connecting') {
          this.setState('disconnected');
          reject(err);
        }
      });

      this.socket.on('disconnect', () => {
        this.setState('disconnected');
      });
    });
  }

  connectToNamespace(token: string, namespace: string): Promise<TypedSocket> {
    return new Promise((resolve, reject) => {
      const nsSocket = io(`${this.serverUrl}${namespace}`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      }) as TypedSocket;

      nsSocket.on('connect', () => resolve(nsSocket));
      nsSocket.on('connect_error', (err) => reject(err));
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.setState('disconnected');
  }

  // Game action methods — send intent, await server ack

  attack(fromTerritoryId: number, toTerritoryId: number): Promise<SocketAck<BattleResultPayload>> {
    return this.emitWithAck('game:attack', { fromTerritoryId, toTerritoryId } as AttackIntent);
  }

  endTurn(): Promise<SocketAck<TurnChangedPayload>> {
    return this.emitWithAckNoData('game:endTurn');
  }

  usePowerUp(type: string, targetTerritoryId: number, sourceTerritoryId?: number): Promise<SocketAck> {
    return this.emitWithAck('game:usePowerUp', {
      type,
      targetTerritoryId,
      sourceTerritoryId,
    } as PowerUpIntent);
  }

  surrender(): Promise<SocketAck> {
    return this.emitWithAckNoData('game:surrender');
  }

  undo(): Promise<SocketAck<WireGameState>> {
    return this.emitWithAckNoData('game:undo');
  }

  proposeAlliance(targetPlayerIndex: number): Promise<SocketAck> {
    return this.emitWithAck('game:proposeAlliance', {
      targetPlayerIndex,
    } as AllianceProposalIntent);
  }

  respondAlliance(proposalId: string, accept: boolean): Promise<SocketAck> {
    return this.emitWithAck('game:respondAlliance', {
      proposalId,
      accept,
    } as AllianceResponseIntent);
  }

  joinGame(gameId: string): Promise<SocketAck<WireGameState>> {
    return this.emitWithAck('game:join', { gameId });
  }

  leaveGame(): Promise<SocketAck> {
    return this.emitWithAckNoData('game:leave');
  }

  ready(): Promise<SocketAck> {
    return this.emitWithAckNoData('game:ready');
  }

  reconnectGame(gameId: string): Promise<SocketAck<WireGameState>> {
    return this.emitWithAck('game:reconnect', { gameId });
  }

  sendChat(message: string): void {
    this.socket?.emit('game:chat' as keyof ClientToServerEvents, { message } as never);
  }

  // Event listeners

  on<E extends keyof ServerToClientEvents>(
    event: E,
    handler: ServerToClientEvents[E],
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.socket?.on(event as any, handler as any);
  }

  off<E extends keyof ServerToClientEvents>(
    event: E,
    handler: ServerToClientEvents[E],
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.socket?.off(event as any, handler as any);
  }

  // Internal helpers

  private emitWithAck<T>(event: string, data: unknown): Promise<SocketAck<T>> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        return reject(new Error('Not connected'));
      }
      this.socket.emit(event as keyof ClientToServerEvents, data as never, ((res: SocketAck<T>) => {
        resolve(res);
      }) as never);
    });
  }

  private emitWithAckNoData<T>(event: string): Promise<SocketAck<T>> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        return reject(new Error('Not connected'));
      }
      this.socket.emit(event as keyof ClientToServerEvents, ((res: SocketAck<T>) => {
        resolve(res);
      }) as never);
    });
  }
}
