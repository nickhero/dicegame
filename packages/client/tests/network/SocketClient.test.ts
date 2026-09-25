import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SocketClient } from '../../src/network/SocketClient';

describe('SocketClient', () => {
  let client: SocketClient;

  beforeEach(() => {
    client = new SocketClient('http://localhost:3001');
  });

  it('initializes in disconnected state', () => {
    expect(client.state).toBe('disconnected');
    expect(client.isConnected).toBe(false);
  });

  it('notifies state change listeners and allows unsubscribing', () => {
    const states: string[] = [];
    const unsubscribe = client.onConnectionStateChange((s) => states.push(s));

    // Access private setState for testing notification dispatch
    (client as any).setState('connecting');
    (client as any).setState('connected');

    expect(states).toEqual(['connecting', 'connected']);

    unsubscribe();
    (client as any).setState('disconnected');
    expect(states).toEqual(['connecting', 'connected']);
  });

  it('rejects action promises when socket is not connected', async () => {
    await expect(client.attack(0, 1)).rejects.toThrow('Not connected');
    await expect(client.endTurn()).rejects.toThrow('Not connected');
    await expect(client.surrender()).rejects.toThrow('Not connected');
    await expect(client.usePowerUp('reinforce', 0)).rejects.toThrow('Not connected');
    await expect(client.proposeAlliance(1)).rejects.toThrow('Not connected');
  });
});
