// Pluggable storage abstraction — replaces direct localStorage usage
// so shared code works in both browser and server environments.

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// Default: no-op (server-side, no localStorage)
let storage: StorageAdapter = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export function setStorageAdapter(adapter: StorageAdapter): void {
  storage = adapter;
}

export function getStorage(): StorageAdapter {
  return storage;
}
