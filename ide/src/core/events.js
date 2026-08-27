/**
 * A tiny event bus. Core modules and extensions both subscribe through it, so
 * an extension listening for 'documentSaved' gets the same signal the status
 * bar does -- no separate extension event pipeline to keep in sync.
 */
const listeners = new Map();

export const emitter = {
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return { dispose: () => listeners.get(event)?.delete(fn) };
  },
  emit(event, payload) {
    for (const fn of listeners.get(event) || []) {
      try {
        fn(payload);
      } catch (err) {
        // An extension throwing in a handler must not take down the core.
        console.error(`[minicode] listener for "${event}" threw:`, err);
      }
    }
  },
};
