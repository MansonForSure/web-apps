import { TempoTracker } from './tempo-detector.js';

// This module is intended to be loaded with `new Worker(url, { type: 'module' })`.
// The guard permits Node to import it for syntax/module checks without creating
// worker-global side effects.
const workerScope = typeof self === 'undefined' ? null : self;

if (workerScope) {
  const tracker = new TempoTracker();

  workerScope.onmessage = (event) => {
    const message = event.data || {};
    if (message.type === 'reset') {
      tracker.reset();
      return;
    }
    if (message.type !== 'features' || !Array.isArray(message.frames)) return;

    const estimate = tracker.update(message.frames);
    if (estimate) workerScope.postMessage({ type: 'estimate', ...estimate });
  };
}
