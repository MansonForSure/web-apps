// Each open sheet or full-screen test adds a history entry, so Safari's
// swipe-back gesture closes the layer instead of leaving the page.

export function createLayers(win = globalThis.window) {
  const stack = [];

  win.addEventListener('popstate', () => {
    const layer = stack.pop();
    if (layer) layer.close();
  });

  function push(close) {
    const layer = { close, pushed: false, closing: false };
    try {
      win.history.pushState({ checkupLayer: stack.length + 1 }, '');
      layer.pushed = true;
    } catch {
      layer.pushed = false;
    }
    stack.push(layer);
    return layer;
  }

  function dismiss(layer) {
    const index = stack.indexOf(layer);
    if (index >= 0) stack.splice(index, 1);
    layer.close();
  }

  // Close the top layer (or a specific one if it is on top).
  function pop(layer) {
    const top = stack[stack.length - 1];
    if (!top) return;
    if (layer && top !== layer) {
      dismiss(layer);
      return;
    }
    if (top.closing) return;
    top.closing = true;
    if (top.pushed) {
      win.history.back();
    } else {
      stack.pop();
      top.close();
    }
  }

  return {
    push,
    pop,
    dismiss,
    get depth() {
      return stack.length;
    },
  };
}
