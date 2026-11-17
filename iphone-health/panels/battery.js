import { h } from '../lib/dom.js';
import { assessBattery, batterySummary } from '../lib/battery.js';

function segmented(name, options, value, onChange) {
  const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': name });
  const buttons = options.map(([optionValue, label]) => {
    const el = h('button', { type: 'button', role: 'radio', class: 'segment', 'aria-checked': String(optionValue === value) }, label);
    el.addEventListener('click', () => {
      buttons.forEach((other) => other.setAttribute('aria-checked', String(other === el)));
      onChange(optionValue);
    });
    return el;
  });
  group.append(...buttons);
  return group;
}

export default function mountBattery(ctx) {
  const saved = (ctx.result && ctx.result.inputs) || {};
  const guess = ctx.device.model && ctx.device.model.era;
  const inputs = {
    capacity: saved.capacity ?? '',
    cycles: saved.cycles ?? '',
    era: saved.era || (guess === 'new' || guess === 'old' ? guess : null),
    warning: saved.warning ?? null,
  };

  const path = h('div', { class: 'path-card' });
  const capacity = h('input', { id: 'batteryCapacity', class: 'field-input', type: 'number', inputmode: 'numeric', min: '1', max: '100', placeholder: 'e.g. 87', value: inputs.capacity });
  const cycles = h('input', { id: 'batteryCycles', class: 'field-input', type: 'number', inputmode: 'numeric', min: '0', placeholder: 'Optional', value: inputs.cycles });
  const cyclesField = h('div', { class: 'field' }, h('label', { for: 'batteryCycles' }, 'Cycle Count'), h('div', { class: 'field-row' }, cycles));
  const gaugeFill = h('span', { class: 'gauge-fill' });
  const gauge = h('div', { class: 'gauge', 'aria-hidden': 'true' }, gaugeFill, h('span', { class: 'gauge-mark' }, h('span', {}, '80%')));
  const headline = h('p', { class: 'result-title' });
  const message = h('p', { class: 'result-text' });
  const cycleNote = h('p', { class: 'result-text muted' });
  const resultCard = h('div', { class: 'result-card battery-result' }, gauge, headline, message, cycleNote);

  const eraChoice = segmented('Which iPhone?', [['new', 'iPhone 15 or later'], ['old', 'iPhone 14 or earlier']], inputs.era, (value) => { inputs.era = value; renderPath(); update(); });
  const warningChoice = segmented('Battery message', [[false, 'No'], [true, 'Yes']], inputs.warning, (value) => { inputs.warning = value; update(); });

  ctx.body.append(
    h('p', { class: 'panel-lede' }, 'Web pages can’t read your battery, but your iPhone shows its health in Settings. Copy the numbers here to see what they mean.'),
    guess === 'new' || guess === 'old' ? null : h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Which iPhone do you have?'), eraChoice),
    path,
    h('div', { class: 'field' }, h('label', { for: 'batteryCapacity' }, 'Maximum Capacity'), h('div', { class: 'field-row' }, capacity, h('span', { class: 'field-suffix' }, '%'))),
    cyclesField,
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Does it show a “Service” or “Unknown Part” message?'), warningChoice),
    resultCard,
    h('p', { class: 'fine' }, 'Apple designs iPhone 15 and later batteries to keep 80% of their capacity at 1000 complete charge cycles, and iPhone 14 and earlier at 500 cycles, under ideal conditions.'),
  );

  function renderPath() {
    const steps = inputs.era === 'old'
      ? ['Settings', 'Battery', 'Battery Health & Charging']
      : ['Settings', 'Battery', 'Battery Health'];
    const crumbs = steps.flatMap((step, index) => (index ? [h('span', { class: 'crumb-sep' }, '›'), h('span', { class: 'crumb' }, step)] : [h('span', { class: 'crumb' }, step)]));
    const note = inputs.era === 'old'
      ? 'Shows Maximum Capacity and Peak Performance Capability. iPhone 14 and earlier don’t show a cycle count here.'
      : inputs.era === 'new'
        ? 'Shows Maximum Capacity and Cycle Count (iOS 17.4 or later).'
        : 'On iPhone 11 to 14, the last step is called Battery Health & Charging.';
    path.replaceChildren(h('p', { class: 'path-title' }, 'Where to look'), h('p', { class: 'crumbs' }, crumbs), h('p', { class: 'path-note' }, note));
    cyclesField.hidden = inputs.era === 'old';
  }

  function update() {
    inputs.capacity = capacity.value;
    inputs.cycles = cyclesField.hidden ? '' : cycles.value;
    const result = assessBattery({ capacity: inputs.capacity, cycles: inputs.cycles, era: inputs.era, warning: inputs.warning });
    resultCard.dataset.grade = result.grade;
    headline.textContent = result.headline;
    message.textContent = result.message;
    cycleNote.textContent = result.cycleNote || '';
    cycleNote.hidden = !result.cycleNote;
    const percent = result.percent || 0;
    gaugeFill.style.transform = `scaleX(${Math.max(0, Math.min(100, percent)) / 100})`;
    if (result.status) {
      ctx.setResult({ status: result.status, summary: batterySummary(result), inputs: { ...inputs } });
    } else if (result.grade === 'empty' && ctx.result) {
      ctx.setResult(null);
    }
  }

  let debounce = 0;
  const onInput = () => { clearTimeout(debounce); debounce = setTimeout(update, 250); };
  capacity.addEventListener('input', onInput);
  cycles.addEventListener('input', onInput);
  ctx.onCleanup(() => clearTimeout(debounce));
  renderPath();
  update();
}
