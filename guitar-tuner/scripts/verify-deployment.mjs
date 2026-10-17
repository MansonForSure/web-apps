import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base = new URL(process.argv[2] || 'https://mansonforsure.github.io/web-apps/guitar-tuner/');
const attempts = Number(process.argv[3] || 18);
if (!base.pathname.endsWith('/')) throw new Error('The app URL must end in /');
if (!(attempts >= 1 && attempts <= 30)) throw new Error('Attempt count must be between 1 and 30');
if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) {
  throw new Error('The public app must use HTTPS');
}
const digest = (value) => createHash('sha256').update(value).digest('hex');
const files = ['index.html', 'app.js', 'style.css', 'favicon.svg', 'licenses.txt'];
const targets = await Promise.all(files.map(async (file) => ({
  label: file, url: new URL(file === 'index.html' ? './' : file, base),
  expected: digest(await readFile(path.join(root, file))),
})));
const sibling = path.join(root, '..', 'sight-reading', 'index.html');
const siblingRoot = path.dirname(sibling);
const siblingBase = new URL('../sight-reading/', base);
const siblingHtml = await readFile(sibling);
targets.push({ label: 'sight-reading/ (preserved)', url: siblingBase, expected: digest(siblingHtml) });
for (const match of siblingHtml.toString().matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
  const url = new URL(match[1], siblingBase);
  if (url.origin !== siblingBase.origin || !url.pathname.startsWith(siblingBase.pathname)) continue;
  const relative = decodeURIComponent(url.pathname.slice(siblingBase.pathname.length));
  const local = path.resolve(siblingRoot, relative);
  if (!local.startsWith(siblingRoot + path.sep)) continue;
  targets.push({ label: 'sight-reading/' + relative, url, expected: digest(await readFile(local)) });
}
const started = Date.now();
let lastProgress = started;
let previousPassing = 0;
let finished = false;
for (let attempt = 1; attempt <= attempts && Date.now() - started < 180000; attempt += 1) {
  const checks = await Promise.all(targets.map(async (target) => {
    const url = new URL(target.url);
    url.searchParams.set('build-check', String(Date.now()));
    try {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      const body = Buffer.from(await response.arrayBuffer());
      return { label: target.label, status: response.status, ok: response.status === 200 && digest(body) === target.expected };
    } catch (error) {
      return { label: target.label, status: error.name, ok: false };
    }
  }));
  const passing = checks.filter((check) => check.ok).length;
  if (passing > previousPassing) lastProgress = Date.now();
  previousPassing = passing;
  console.log(`Attempt ${attempt}: ${passing}/${checks.length} verified; elapsed ${Math.round((Date.now() - started) / 1000)}s; since progress ${Math.round((Date.now() - lastProgress) / 1000)}s`);
  for (const check of checks) console.log(`  ${check.label}: ${check.status}, ${check.ok ? 'matches local build' : 'not yet verified'}`);
  if (passing === checks.length) { finished = true; break; }
  if (attempt < attempts && Date.now() - started < 170000) await new Promise((resolve) => setTimeout(resolve, 10000));
}
if (!finished) { console.error('Deployment verification did not complete within the bounded check window.'); process.exitCode = 1; }
else console.log(`Verified ${base.href}; all tuner files and the unchanged sight-reading page returned HTTP 200.`);
