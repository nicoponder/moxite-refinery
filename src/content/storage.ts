// Minimal typing for the `chrome.storage` extension API, which Chrome and
// Firefox (MV3, where `chrome.*` calls return promises) both provide to
// content scripts.
interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

declare const chrome: {
  storage: {
    local: StorageArea;
    onChanged: {
      addListener(callback: (changes: Record<string, StorageChange>, areaName: string) => void): void;
    };
  };
};

/** Reads `key` from extension storage, undefined if it's unset. */
export async function readStorage(key: string): Promise<unknown> {
  return (await chrome.storage.local.get(key))[key];
}

export function writeStorage(key: string, value: unknown): Promise<void> {
  return chrome.storage.local.set({ [key]: value });
}

/** Calls `callback` with `key`'s new value whenever it changes, from any tab. */
export function onStorageChange(key: string, callback: (value: unknown) => void): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && key in changes) callback(changes[key].newValue);
  });
}
