#!/usr/bin/env python3
"""build.py — turn every lessons/NN-slug/lesson.md into lessons/NN-slug/index.html,
and rebuild the course home page (index.html) from the same data.

    python3 tools/build.py            # build everything
    python3 tools/build.py --check    # build, then fail if any snippet/link is broken

Lesson files are Markdown with a small front-matter header and three extra directives:

    ::demo                                   embed this lesson's live demo (demo.html)
    ::snippet lessons/03-input-and-motion/demo.html#update   "Optional caption"
    ::snippet game/src/player.js@40-62       "Line ranges work too"

Snippets are copied from the real source files at build time, so the code you read in a
lesson is always the code that runs in the demo. Regions are marked in source files with
`// #region name` and `// #endregion` comments.
"""
import argparse
import html
import pathlib
import re
import sys
import textwrap

import markdown
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "tools" / "templates"
REPO_BLOB = "https://github.com/MansonForSure/web-apps/blob/main/3d-game-tutorial/"
SITE_URL = "https://mansonforsure.github.io/web-apps/3d-game-tutorial/"

TIERS = {
    "1": ("Foundations", "Scenes, light, input and a camera that follows you."),
    "2": ("Gameplay", "Gravity, collisions, pickups, a real character and enemies."),
    "3": ("Polish & ship", "Game flow, juice, shaders, performance — then publish it."),
}

problems = []


# ----------------------------------------------------------------------------- parsing
def parse_lesson(path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        raise SystemExit(f"{path}: missing front matter")
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    meta["learn"] = [s.strip() for s in meta.get("learn", "").split(";") if s.strip()]
    meta["dir"] = path.parent.name
    meta["number"] = int(meta["dir"][:2])
    meta["body"] = text[m.end():]
    meta["has_demo"] = (path.parent / "demo.html").exists()
    return meta


# ----------------------------------------------------------------------------- code
FORMATTER = HtmlFormatter(cssclass="hl", nowrap=True)
LANGS = {"js": "javascript", "mjs": "javascript", "html": "html", "css": "css", "glsl": "glsl",
         "py": "python", "sh": "bash", "bash": "bash", "json": "json", "text": "text", "": "text"}


def code_block(code, lang, caption=None, href=None):
    lexer = get_lexer_by_name(LANGS.get(lang, lang) or "text")
    body = highlight(code.rstrip("\n") + "\n", lexer, FORMATTER)
    cap = ""
    if caption:
        link = f' <a class="src" href="{href}" target="_blank" rel="noopener">source ↗</a>' if href else ""
        cap = f'<figcaption><span class="file">{html.escape(caption)}</span>{link}</figcaption>'
    return (f'<figure class="code">{cap}<div class="code-wrap"><button class="copy" type="button" '
            f'aria-label="Copy code">Copy</button><pre class="hl"><code>{body}</code></pre></div></figure>')


def extract(spec, lesson_dir):
    """spec = path#region  or  path@start-end  (path relative to the course root)."""
    m = re.match(r"^([^#@]+)(?:#([\w-]+)|@(\d+)-(\d+))?$", spec)
    if not m:
        problems.append(f"{lesson_dir}: bad snippet spec {spec}")
        return "", "text", 1
    rel, region, a, b = m.groups()
    path = ROOT / rel
    if not path.exists():
        problems.append(f"{lesson_dir}: snippet file not found {rel}")
        return "", "text", 1
    lines = path.read_text(encoding="utf-8").splitlines()
    start = 1
    if region:
        out, inside, depth = [], False, 0
        for i, line in enumerate(lines):
            if re.search(rf"#region {re.escape(region)}\b", line) and not inside:
                inside, start = True, i + 2
                continue
            if inside:
                if "#region" in line:
                    depth += 1
                    continue
                if "#endregion" in line:
                    if depth == 0:
                        break
                    depth -= 1
                    continue
                out.append(line)
        if not inside:
            problems.append(f"{lesson_dir}: region '{region}' not found in {rel}")
        chosen = out
    elif a:
        start = int(a)
        chosen = lines[int(a) - 1:int(b)]
    else:
        chosen = lines
    code = textwrap.dedent("\n".join(chosen)).strip("\n")
    ext = path.suffix.lstrip(".")
    lang = "js" if ext in ("html", "mjs") and region else ext
    return code, lang, start


# ----------------------------------------------------------------------------- markdown
def render_body(meta):
    stash = []

    def keep(fragment):
        stash.append(fragment)
        return f"\n\n@@STASH{len(stash) - 1}@@\n\n"

    body = meta["body"]

    # Fenced code: ```js title="file.js"
    def fence(m):
        lang = m.group(1) or ""
        title = m.group(2)
        return keep(code_block(textwrap.dedent(m.group(3)), lang, title))

    body = re.sub(r'^```(\w*)(?:[ \t]+title="([^"]+)")?[ \t]*\n(.*?)^```[ \t]*$', fence, body, flags=re.S | re.M)

    # ::snippet path#region "caption"
    def snippet(m):
        spec, caption = m.group(1), m.group(2)
        code, lang, start = extract(spec, meta["dir"])
        rel = spec.split("#")[0].split("@")[0]
        anchor = f"#L{start}" if start > 1 else ""
        label = caption or rel
        return keep(code_block(code, lang, label, REPO_BLOB + rel + anchor))

    body = re.sub(r'^::snippet[ \t]+(\S+)(?:[ \t]+"([^"]+)")?[ \t]*$', snippet, body, flags=re.M)

    # ::demo
    def demo(m):
        caption = m.group(1) or "Live demo"
        if not meta["has_demo"]:
            problems.append(f"{meta['dir']}: ::demo used but no demo.html")
        poster = "poster.jpg" if (ROOT / "lessons" / meta["dir"] / "poster.jpg").exists() else ""
        style = f' style="background-image:url({poster})"' if poster else ""
        src = REPO_BLOB + f"lessons/{meta['dir']}/demo.html"
        return keep(
            f'<figure class="demo" data-src="demo.html"><div class="demo-frame"{style}>'
            f'<button class="demo-run" type="button"><span class="play">▶</span><span>Run the demo</span></button></div>'
            f'<figcaption><span>{html.escape(caption)}</span><span class="links"><a href="demo.html" target="_blank" rel="noopener">Full screen ↗</a>'
            f'<a href="{src}" target="_blank" rel="noopener">Source ↗</a></span></figcaption></figure>')

    body = re.sub(r'^::demo(?:[ \t]+"([^"]+)")?[ \t]*$', demo, body, flags=re.M)

    # A callout header line always becomes its own paragraph, so lists/code can follow it directly.
    body = re.sub(r"^(>[ \t]*\[!\w+\][^\n]*)\n(?=>)", r"\1\n>\n", body, flags=re.M)

    md = markdown.Markdown(extensions=["tables", "toc", "attr_list", "sane_lists", "smarty"],
                           extension_configs={"toc": {"permalink": False}})
    out = md.convert(body)

    # Callouts:  > [!TIP] Title
    def callout(m):
        kind, title, rest = m.group(1).lower(), (m.group(2) or "").strip(), m.group(3)
        labels = {"tip": "Tip", "note": "Note", "warning": "Watch out", "info": "Why?", "try": "Try it"}
        head = title or labels.get(kind, kind.title())
        return f'<aside class="callout {kind}"><p class="callout-title">{head}</p>{rest}</aside>'

    out = re.sub(r"<blockquote>\s*<p>\[!(\w+)\][ \t]*(.*?)</p>(.*?)</blockquote>", callout, out, flags=re.S)
    out = out.replace("<table>", '<div class="table-wrap"><table>').replace("</table>", "</table></div>")

    for i, frag in enumerate(stash):
        out = out.replace(f"<p>@@STASH{i}@@</p>", frag).replace(f"@@STASH{i}@@", frag)

    toc = [(t["id"], t["name"]) for t in md.toc_tokens if t["level"] == 2]
    return out, toc


# ----------------------------------------------------------------------------- pages
def fill(template, **values):
    def sub(m):
        key = m.group(1)
        if key not in values:
            problems.append(f"template key missing: {key}")
            return ""
        return str(values[key])
    return re.sub(r"\{\{(\w+)\}\}", sub, template)


def build_lesson(meta, lessons, template):
    body, toc = render_body(meta)
    idx = lessons.index(meta)
    prev_l = lessons[idx - 1] if idx > 0 else None
    next_l = lessons[idx + 1] if idx + 1 < len(lessons) else None
    tier_name = TIERS[meta["tier"]][0]

    def pager(l, label, cls):
        if not l:
            if cls == "next":
                return ('<a class="pager-card next" href="../../game/index.html"><span class="k">Finished!</span>'
                        '<b>Play Skyhop →</b></a>')
            return '<a class="pager-card prev" href="../../index.html"><span class="k">Course</span><b>← All lessons</b></a>'
        return (f'<a class="pager-card {cls}" href="../{l["dir"]}/index.html"><span class="k">{label} · Lesson {l["number"]}</span>'
                f'<b>{html.escape(l["title"])}</b></a>')

    toc_html = "".join(f'<li><a href="#{i}">{html.escape(n)}</a></li>' for i, n in toc)
    learn = "".join(f"<li>{html.escape(x)}</li>" for x in meta["learn"])
    dots = "".join(
        f'<a href="../{l["dir"]}/index.html" class="dot{" on" if l is meta else ""}" data-lesson="{l["dir"]}" '
        f'title="Lesson {l["number"]}: {html.escape(l["title"])}"></a>'
        for l in lessons)
    page = fill(
        template,
        title=html.escape(meta["title"]),
        summary=html.escape(meta["summary"]),
        number=f'{meta["number"]:02d}',
        total=len(lessons),
        tier=meta["tier"],
        tier_name=tier_name,
        minutes=meta.get("minutes", "20"),
        learn=learn,
        toc=toc_html,
        body=body,
        prev=pager(prev_l, "Previous", "prev"),
        next=pager(next_l, "Next", "next"),
        lesson_id=meta["dir"],
        dots=dots,
        canonical=SITE_URL + f'lessons/{meta["dir"]}/',
        toc_demo=('<a class="toc-demo" href="demo.html" target="_blank" rel="noopener">Open demo ↗</a>'
                  if meta["has_demo"] else ""),
    )
    (ROOT / "lessons" / meta["dir"] / "index.html").write_text(page, encoding="utf-8")


def build_home(lessons, template):
    tiers_html = []
    for key, (name, blurb) in TIERS.items():
        if not any(l["tier"] == key for l in lessons):
            continue
        cards = []
        for l in [l for l in lessons if l["tier"] == key]:
            poster = f'lessons/{l["dir"]}/poster.jpg'
            img = (f'<img src="{poster}" alt="" loading="lazy" width="480" height="300" />'
                   if (ROOT / poster).exists() else '<div class="noposter">Deploy</div>')
            cards.append(
                f'<a class="lesson-card" href="lessons/{l["dir"]}/index.html" data-lesson="{l["dir"]}">'
                f'<div class="thumb">{img}<span class="num">{l["number"]:02d}</span><span class="done" aria-label="completed">✓</span></div>'
                f'<div class="meta"><h3>{html.escape(l["title"])}</h3><p>{html.escape(l["summary"])}</p>'
                f'<span class="mins">{l.get("minutes", "20")} min</span></div></a>')
        first, last = [l for l in lessons if l["tier"] == key][0], [l for l in lessons if l["tier"] == key][-1]
        tiers_html.append(
            f'<section class="tier" id="tier-{key}"><header class="tier-head"><span class="tier-num">Tier {key}</span>'
            f'<h2>{name}</h2><p>{blurb} <span class="range">Lessons {first["number"]}–{last["number"]}</span></p></header>'
            f'<div class="lesson-grid">{"".join(cards)}</div></section>')
    total_min = sum(int(l.get("minutes", 20)) for l in lessons)
    page = fill(template, tiers="".join(tiers_html), count=len(lessons), hours=f"{total_min / 60:.0f}",
                first=f'lessons/{lessons[0]["dir"]}/index.html', canonical=SITE_URL)
    (ROOT / "index.html").write_text(page, encoding="utf-8")


def check_links(lessons, home=True):
    pages = [ROOT / "lessons" / l["dir"] / "index.html" for l in lessons]
    if (ROOT / "index.html").exists():
        pages.insert(0, ROOT / "index.html")
    for path in pages:
        text = path.read_text(encoding="utf-8")
        for href in re.findall(r'(?:href|src)="([^"#:]+)"', text):
            if href.startswith(("http", "mailto", "data:")) or href.startswith("//"):
                continue
            target = (path.parent / href).resolve()
            generated = target.name == "index.html" and (target.parent / "lesson.md").exists()
            if not target.exists() and not generated:
                problems.append(f"{path.relative_to(ROOT)}: broken link {href}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--only", help="build just this lesson folder (e.g. 07-collectibles-and-hud); skips the home page")
    args = ap.parse_args()
    lessons = [parse_lesson(p) for p in sorted((ROOT / "lessons").glob("[0-9][0-9]-*/lesson.md"))]
    lesson_t = (TEMPLATES / "lesson.html").read_text(encoding="utf-8")
    home_t = (TEMPLATES / "home.html").read_text(encoding="utf-8")
    if args.only:
        chosen = [m for m in lessons if m["dir"] == args.only]
        if not chosen:
            raise SystemExit(f"no lesson folder {args.only} with a lesson.md")
        build_lesson(chosen[0], lessons, lesson_t)
        check_links(chosen)
        problems[:] = [p for p in problems if not p.startswith("index.html")]
        print(f"built {args.only}")
    else:
        for meta in lessons:
            build_lesson(meta, lessons, lesson_t)
        build_home(lessons, home_t)
        check_links(lessons)
        print(f"built {len(lessons)} lessons + home")
    for p in problems:
        print("  PROBLEM:", p)
    if args.check and problems:
        sys.exit(1)


if __name__ == "__main__":
    main()
