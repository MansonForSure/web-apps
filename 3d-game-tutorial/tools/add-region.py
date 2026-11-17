#!/usr/bin/env python3
"""add-region.py FILE NAME "unique start text" [--lines N]
Wrap the block that starts on the line containing the start text in
`// #region NAME` ... `// #endregion` comments. The block ends where its braces balance
(or after N lines with --lines). Idempotent: skips if the region already exists."""
import re, sys, pathlib

def add(path, name, start, nlines=None):
    p = pathlib.Path(path)
    lines = p.read_text().split('\n')
    if any(re.search(rf'#region {re.escape(name)}\b', l) for l in lines):
        print(f'skip {path}#{name} (exists)'); return
    hits = [i for i, l in enumerate(lines) if start in l]
    if len(hits) != 1:
        sys.exit(f'{path}: start text must match exactly one line, matched {len(hits)}: {start!r}')
    s = hits[0]
    if nlines:
        e = s + nlines - 1
    else:
        depth, seen, e = 0, False, None
        for i in range(s, len(lines)):
            code = re.sub(r'//.*$', '', lines[i])
            for ch in code:
                if ch in '{([': depth += 1; seen = True
                elif ch in '})]': depth -= 1
            if seen and depth == 0:
                e = i; break
        if e is None:
            sys.exit(f'{path}: no balanced end for {name}')
    indent = re.match(r'\s*', lines[s]).group(0)
    lines.insert(e + 1, f'{indent}// #endregion')
    lines.insert(s, f'{indent}// #region {name}')
    p.write_text('\n'.join(lines))
    print(f'{path}#{name}: {e - s + 1} lines')

if __name__ == '__main__':
    a = sys.argv[1:]
    n = None
    if '--lines' in a:
        k = a.index('--lines'); n = int(a[k + 1]); del a[k:k + 2]
    add(a[0], a[1], a[2], n)
