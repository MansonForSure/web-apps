// Turns stored answers into statuses, the overall summary and a shareable report.

export const STATUS_LABELS = {
  none: 'Not run',
  partial: 'In progress',
  pass: 'Passed',
  fail: 'Issue',
  skip: 'Skipped',
};

const REPORT_MARKS = { pass: '✓', fail: '✗', skip: '–', partial: '…', none: '○' };

export function joinAnd(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

// answers: { itemId: 'yes' | 'no' | 'na' }
export function deriveStatus(items = [], answers = {}) {
  const values = items.map((item) => answers[item.id]).filter(Boolean);
  if (!values.length) return null;
  if (values.includes('no')) return 'fail';
  if (values.length < items.length) return 'partial';
  if (values.every((value) => value === 'na')) return 'skip';
  return 'pass';
}

export function itemSummary(items = [], answers = {}) {
  const status = deriveStatus(items, answers);
  if (!status) return '';
  if (status === 'fail') {
    const failed = items.filter((item) => answers[item.id] === 'no').map((item) => item.short || item.label);
    return `Issue: ${joinAnd(failed)}`;
  }
  if (status === 'partial') {
    const answered = items.filter((item) => answers[item.id]).length;
    return `${answered} of ${items.length} checked`;
  }
  if (status === 'skip') return 'Not applicable';
  return items.length > 1 ? 'All checks passed' : 'Working';
}

export function composeResult(test, previous = {}, changes = {}) {
  const next = { ...previous, ...changes };
  const items = next.items || {};
  let status = deriveStatus(test.items || [], items);
  if (!status && next.detail) status = 'partial';
  next.status = status;
  const base = itemSummary(test.items || [], items);
  next.summary = [base, next.detail].filter(Boolean).join(' · ');
  return next;
}

export function statusOf(result) {
  return (result && STATUS_LABELS[result.status] && result.status) || 'none';
}

export function summarize(tests, getResult) {
  const counts = { pass: 0, fail: 0, skip: 0, partial: 0, none: 0 };
  for (const test of tests) counts[statusOf(getResult(test.id))] += 1;
  const total = tests.length;
  const done = counts.pass + counts.fail + counts.skip;
  let tone = 'good';
  let headline;
  let message;
  if (counts.fail) {
    tone = 'bad';
    headline = `${counts.fail} ${counts.fail === 1 ? 'item needs' : 'items need'} attention`;
    message = done === total ? 'Everything else checked out.' : `${total - done} still to check.`;
  } else if (!done && !counts.partial) {
    tone = 'idle';
    headline = 'Ready when you are';
    message = 'Start with any test. Most take under a minute.';
  } else if (done === total) {
    headline = 'Your iPhone looks healthy';
    message = 'Everything you checked is working.';
  } else {
    headline = 'So far, so good';
    message = `${total - done} still to check.`;
  }
  return { ...counts, total, done, tone, headline, message };
}

export function nextTestId(tests, getResult, afterId = null) {
  const start = afterId ? tests.findIndex((test) => test.id === afterId) + 1 : 0;
  for (let offset = 0; offset < tests.length; offset += 1) {
    const test = tests[(start + offset) % tests.length];
    if (test.id === afterId) continue;
    const status = statusOf(getResult(test.id));
    if (status === 'none' || status === 'partial') return test.id;
  }
  return null;
}

function formatDate(date) {
  try {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function buildReport({ tests, groups, getResult, device, date = new Date(), url = '' }) {
  const summary = summarize(tests, getResult);
  const lines = ['iPhone health report — Checkup', formatDate(date), ''];
  if (device) {
    if (device.model) lines.push(`Device: ${device.model.label}${device.model.exact ? '' : ' (estimated)'}`);
    else lines.push(`Device: ${device.kindLabel}`);
    lines.push(`${device.osLabel} · ${device.browserLabel}`);
    lines.push('');
  }
  const counts = [`${summary.pass} passed`, `${summary.fail} ${summary.fail === 1 ? 'issue' : 'issues'}`];
  if (summary.skip) counts.push(`${summary.skip} skipped`);
  if (summary.total - summary.done) counts.push(`${summary.total - summary.done} not checked`);
  lines.push(`${summary.headline}. ${counts.join(' · ')}`);
  for (const [groupId, group] of Object.entries(groups)) {
    const groupTests = tests.filter((test) => test.group === groupId);
    if (!groupTests.length) continue;
    lines.push('', group.title);
    for (const test of groupTests) {
      const result = getResult(test.id);
      const status = statusOf(result);
      const note = (result && result.summary) || STATUS_LABELS[status];
      lines.push(`${REPORT_MARKS[status]} ${test.title} — ${note}`);
    }
  }
  if (url) lines.push('', `Made with Checkup: ${url}`);
  return lines.join('\n');
}
