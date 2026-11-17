// Results are kept only in this browser's localStorage.

const KEY = 'checkup:results:v1';

function defaultStorage() {
  try {
    const storage = globalThis.localStorage;
    const probe = '__checkup_probe__';
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function createStore(storage = defaultStorage(), key = KEY) {
  let data = {};
  try {
    const parsed = JSON.parse((storage && storage.getItem(key)) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
  } catch {
    data = {};
  }
  const save = () => {
    try {
      if (storage) storage.setItem(key, JSON.stringify(data));
    } catch {
      // Storage can be full or blocked; results then last for this visit only.
    }
  };
  return {
    persistent: Boolean(storage),
    get: (id) => data[id] || null,
    set(id, value) {
      if (value === null || value === undefined) delete data[id];
      else data[id] = value;
      save();
    },
    clear() {
      data = {};
      save();
    },
    all: () => ({ ...data }),
  };
}
