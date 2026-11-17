// Interprets numbers the user copies from Settings › Battery › Battery Health.
// Apple: iPhone 14 and earlier batteries are designed to keep 80% capacity at
// 500 complete cycles; iPhone 15 and later at 1000 cycles (ideal conditions).

export const DESIGN_CYCLES = { new: 1000, old: 500 };

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(number) ? number : null;
}

export function assessBattery({ capacity, cycles, era, warning } = {}) {
  const cap = toNumber(capacity);
  const cyc = toNumber(cycles);
  if (cap === null) {
    return { status: null, grade: 'empty', headline: 'Waiting for your numbers', message: 'Enter Maximum Capacity from Settings to see how your battery is doing.', cycleNote: '' };
  }
  if (cap < 1 || cap > 100) {
    return { status: null, grade: 'invalid', headline: 'Check that number', message: 'Maximum Capacity is a percentage between 1 and 100.', cycleNote: '' };
  }
  if (cyc !== null && (cyc < 0 || cyc > 10000 || !Number.isInteger(cyc))) {
    return { status: null, grade: 'invalid', headline: 'Check the cycle count', message: 'Cycle count is a whole number, usually between 0 and a few thousand.', cycleNote: '' };
  }

  const percent = Math.round(cap);
  let result;
  if (warning === true) {
    result = { status: 'fail', grade: 'service', headline: 'Needs attention', message: 'Your iPhone is showing a battery message. Apple shows these when service is recommended or a part can’t be verified.' };
  } else if (percent >= 90) {
    result = { status: 'pass', grade: 'excellent', headline: 'Excellent', message: `At ${percent}%, your battery holds nearly as much charge as when it was new.` };
  } else if (percent >= 80) {
    result = { status: 'pass', grade: 'good', headline: 'Normal wear', message: `At ${percent}%, your battery is above the 80% level Apple designs it to keep through its rated cycles.` };
  } else {
    result = { status: 'fail', grade: 'worn', headline: 'Worn', message: `At ${percent}%, your battery holds noticeably less charge. A battery replacement will restore full battery life.` };
  }

  const design = DESIGN_CYCLES[era] || null;
  let cycleNote = '';
  if (cyc !== null && design) {
    const share = Math.round((cyc / design) * 100);
    cycleNote = `${cyc} cycles is ${share}% of the ${design} cycles this model’s battery is designed to reach while keeping 80% capacity under ideal conditions.`;
    if (percent < 80 && cyc < design * 0.6) {
      cycleNote += ' That is earlier than expected, so it’s worth asking Apple if your iPhone is still under warranty.';
    }
  } else if (cyc !== null) {
    cycleNote = `${cyc} charge cycles so far.`;
  }

  return { ...result, percent, cycles: cyc, cycleNote };
}

export function batterySummary(assessment) {
  if (!assessment || !assessment.status) return '';
  const parts = [`${assessment.headline} · ${assessment.percent}% capacity`];
  if (assessment.cycles !== null && assessment.cycles !== undefined) parts.push(`${assessment.cycles} cycles`);
  return parts.join(' · ');
}
