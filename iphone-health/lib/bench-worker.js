// Runs a fixed integer and floating-point workload in timed rounds.
function chunk(seed) {
  let x = seed | 0;
  let total = 0;
  for (let i = 0; i < 20000; i += 1) {
    x = (Math.imul(x ^ (x >>> 15), 2246822507) + 0x9e3779b9) | 0;
    total += Math.sqrt(x >>> 12);
  }
  return total;
}

self.onmessage = (event) => {
  const { rounds = 5, ms = 700 } = event.data || {};
  const rates = [];
  let sink = 0;
  for (let round = 0; round < rounds; round += 1) {
    const start = performance.now();
    let count = 0;
    while (performance.now() - start < ms) {
      sink += chunk(count + round);
      count += 1;
    }
    const rate = (count / (performance.now() - start)) * 1000;
    rates.push(rate);
    self.postMessage({ type: 'round', round, rate });
  }
  self.postMessage({ type: 'done', rates, sink: sink % 7 });
};
