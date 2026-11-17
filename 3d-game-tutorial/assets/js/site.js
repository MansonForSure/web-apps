// site.js — tiny progressive enhancements for the course pages. Everything works without it.
(() => {
  const KEY = 'cubegame.progress.v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const save = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ } };
  const progress = load();

  // Click-to-run demos: the WebGL iframe is only created when you ask for it.
  for (const fig of document.querySelectorAll('figure.demo')) {
    const frame = fig.querySelector('.demo-frame');
    fig.querySelector('.demo-run')?.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.src = fig.dataset.src;
      iframe.title = 'Live demo';
      iframe.allow = 'fullscreen; autoplay';
      frame.innerHTML = '';
      frame.classList.add('running');
      frame.append(iframe);
      iframe.addEventListener('load', () => iframe.contentWindow?.focus());
    });
  }

  // Copy buttons on code blocks.
  for (const btn of document.querySelectorAll('figure.code .copy')) {
    btn.addEventListener('click', async () => {
      const code = btn.parentElement.querySelector('code').innerText;
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = 'Copied!';
      } catch {
        btn.textContent = 'Select & copy';
      }
      setTimeout(() => { btn.textContent = 'Copy'; }, 1400);
    });
  }

  // Progress: "mark complete" on lessons, check marks on the home page.
  const paint = () => {
    for (const el of document.querySelectorAll('[data-lesson]')) {
      el.classList.toggle('is-done', !!progress[el.dataset.lesson]);
    }
    const btn = document.querySelector('.mark-done');
    if (btn) btn.querySelector('.txt').textContent = progress[btn.dataset.lesson] ? 'Completed — nice work!' : 'Mark lesson complete';
    const note = document.getElementById('progress-note');
    const cards = [...document.querySelectorAll('.lesson-card')];
    if (note && cards.length) {
      const done = cards.filter((c) => progress[c.dataset.lesson]).length;
      const next = cards.find((c) => !progress[c.dataset.lesson]);
      if (done > 0) {
        note.hidden = false;
        note.textContent = `You've completed ${done} of ${cards.length} lessons.`;
        const start = document.getElementById('start-btn');
        if (start && next) {
          start.href = next.getAttribute('href');
          start.textContent = `Continue: lesson ${next.querySelector('.num').textContent} →`;
        }
      }
    }
  };
  document.querySelector('.mark-done')?.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.lesson;
    progress[id] = !progress[id];
    if (!progress[id]) delete progress[id];
    save(progress);
    paint();
  });
  paint();

  // Highlight the current section in the table of contents.
  const links = [...document.querySelectorAll('.toc a[href^="#"]')];
  if (links.length && 'IntersectionObserver' in window) {
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          links.forEach((a) => a.classList.remove('active'));
          map.get(e.target.id)?.classList.add('active');
        }
      }
    }, { rootMargin: '-15% 0px -75% 0px' });
    for (const id of map.keys()) {
      const h = document.getElementById(id);
      if (h) io.observe(h);
    }
  }
})();
