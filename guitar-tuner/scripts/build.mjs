import { build } from 'esbuild';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
for (const file of ['index.html', 'style.css', 'favicon.svg']) {
  await cp(path.join(root, 'site/guitar-tuner', file), path.join(root, file));
}
await build({
  entryPoints: [path.join(root, 'src/app.js')],
  outfile: path.join(root, 'app.js'),
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2020'],
  legalComments: 'none',
});
const licenses = [];
for (const dependency of ['pitchy', 'fft.js']) {
  let text;
  if (dependency === 'fft.js') {
    const readme = await readFile(path.join(root, 'node_modules', dependency, 'README.md'), 'utf8');
    const marker = '#### LICENSE';
    if (!readme.includes(marker)) throw new Error('FFT license section is missing');
    text = readme.slice(readme.indexOf(marker) + marker.length).trim();
  } else {
    text = await readFile(path.join(root, 'node_modules', dependency, 'LICENSE'), 'utf8');
  }
  const manifest = JSON.parse(await readFile(path.join(root, 'node_modules', dependency, 'package.json'), 'utf8'));
  licenses.push(`${dependency} ${manifest.version}\n${'='.repeat(40)}\n${text}`);
}
await writeFile(path.join(root, 'licenses.txt'), licenses.join('\n\n'));
console.log('Built the self-contained app in guitar-tuner/. No sibling app was changed.');
