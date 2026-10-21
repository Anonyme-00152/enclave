/* ==========================================================================
   ENCLAVE® — Site vitrine : interactions & animations
   ========================================================================== */
(function () {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const G = window.gsap;
  const ST = window.ScrollTrigger;
  const animated = !!(G && ST) && !reduce;

  if (animated) {
    root.classList.add('js');
    G.registerPlugin(ST);
  }

  /* ------------------------------------------------------------------
     Découpage des textes en mots
     ------------------------------------------------------------------ */
  function splitWords(el, mask) {
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span');
            w.className = 'w';
            if (mask) {
              const inner = document.createElement('span');
              inner.className = 'w__in';
              inner.textContent = part;
              w.appendChild(inner);
            } else {
              w.textContent = part;
            }
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(el);
    return $$(mask ? '.w__in' : '.w', el);
  }

  /* ------------------------------------------------------------------
     Défilement fluide (Lenis)
     ------------------------------------------------------------------ */
  let lenis = null;
  if (window.Lenis && !reduce) {
    lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1 });
    if (animated) {
      lenis.on('scroll', ST.update);
      G.ticker.add((t) => lenis.raf(t * 1000));
      G.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
    lenis.stop();
  }

  function scrollToTarget(target) {
    if (lenis) lenis.scrollTo(target, { duration: 1.5, offset: 0 });
    else if (typeof target === 'number') window.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
    else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  }

  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id === '#' || id === '#top') { e.preventDefault(); closeMenu(); scrollToTarget(0); return; }
      const el = $(id);
      if (!el) return;
      e.preventDefault();
      closeMenu();
      scrollToTarget(el);
    });
  });

  /* ------------------------------------------------------------------
     Préchargement
     ------------------------------------------------------------------ */
  const loader = $('.loader');
  function runLoader() {
    if (!loader) { intro(); return; }
    loader.style.animation = 'none';
    let seen = false;
    try { seen = sessionStorage.getItem('enclave.seen') === '1'; sessionStorage.setItem('enclave.seen', '1'); } catch (e) { /* stockage indisponible */ }
    const duration = reduce ? 200 : seen ? 800 : 2000;
    const num = $('.loader__num', loader);
    const bar = $('.loader__bar i', loader);
    const logs = $$('.loader__log li', loader);
    const fontsReady = Promise.race([
      document.fonts ? document.fonts.ready : Promise.resolve(),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
    const start = performance.now();
    const ease = (x) => 1 - Math.pow(1 - x, 3);

    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const v = ease(p);
      num.textContent = String(Math.round(v * 100)).padStart(3, '0');
      bar.style.transform = `scaleX(${v})`;
      logs.forEach((li, i) => li.classList.toggle('on', v >= (i + 0.4) / logs.length));
      if (p < 1) requestAnimationFrame(tick);
      else fontsReady.then(finish);
    }
    requestAnimationFrame(tick);

    function finish() {
      if (reduce || !animated) {
        loader.classList.add('is-done');
        body.classList.remove('is-loading');
        intro();
        return;
      }
      G.timeline({
        onComplete: () => { loader.classList.add('is-done'); },
      })
        .to('.loader__center, .loader__foot, .loader__head', { opacity: 0, y: -20, duration: 0.5, ease: 'power2.in', stagger: 0.04 })
        .to(loader, { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'expo.inOut' }, '-=.1')
        .add(() => { body.classList.remove('is-loading'); intro(); }, '-=.75');
    }
  }

  function intro() {
    if (lenis) lenis.start();
    if (!animated) return;
    G.timeline()
      .to('.hero__title .line > span', { y: 0, duration: 1.5, ease: 'expo.out', stagger: 0.12 })
      .to('.hero [data-fade]', { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08 }, '-=1.15');
    ST.refresh();
  }

  /* ------------------------------------------------------------------
     Navigation
     ------------------------------------------------------------------ */
  const nav = $('[data-nav]');
  let lastY = 0;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      const down = y > lastY && y > 160;
      if (!body.classList.contains('menu-open')) nav.classList.toggle('is-hidden', down);
      lastY = y;
      ticking = false;
    });
  }, { passive: true });

  const navLinks = $$('.nav__links a');
  const sections = navLinks.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + entry.target.id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => io.observe(s));
  }

  const burger = $('[data-burger]');
  const menu = $('[data-menu]');
  function closeMenu() {
    if (!body.classList.contains('menu-open')) return;
    body.classList.remove('menu-open');
    burger.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-hidden', 'true');
    if (lenis) lenis.start();
  }
  burger.addEventListener('click', () => {
    const open = !body.classList.contains('menu-open');
    if (!open) { closeMenu(); return; }
    body.classList.add('menu-open');
    burger.setAttribute('aria-expanded', 'true');
    menu.setAttribute('aria-hidden', 'false');
    if (lenis) lenis.stop();
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  /* ------------------------------------------------------------------
     Curseur personnalisé & boutons magnétiques
     ------------------------------------------------------------------ */
  if (finePointer && !reduce) {
    body.classList.add('has-cursor');
    const cursor = $('.cursor');
    const dot = $('.cursor__dot');
    const ring = $('.cursor__ring');
    const label = $('.cursor__label');
    let x = window.innerWidth / 2, y = window.innerHeight / 2, rx = x, ry = y;
    window.addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; }, { passive: true });
    (function loop() {
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      requestAnimationFrame(loop);
    })();
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest('a, button, [data-cursor], [data-handle]');
      cursor.classList.toggle('is-hover', !!t);
      const text = t && t.getAttribute('data-cursor');
      cursor.classList.toggle('is-label', !!text);
      if (text) label.textContent = text;
    });
    document.addEventListener('pointerleave', () => cursor.classList.remove('is-hover', 'is-label'));

    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * 0.22}px, ${dy * 0.32}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ------------------------------------------------------------------
     Hero WebGL
     ------------------------------------------------------------------ */
  const canvas = $('[data-gl]');
  let glApi = null;
  try { glApi = canvas && window.EnclaveGL ? window.EnclaveGL.init(canvas) : null; } catch (e) { glApi = null; }
  if (!glApi) root.classList.add('no-gl');

  /* ------------------------------------------------------------------
     Animations au défilement
     ------------------------------------------------------------------ */
  if (animated) {
    const hero = $('[data-hero]');

    ST.create({
      trigger: hero, start: 'top top', end: 'bottom top', scrub: true,
      onUpdate: (self) => glApi && glApi.setScroll(self.progress),
    });
    G.to('.hero__inner', { yPercent: -14, opacity: 0.15, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });

    // Titres découpés en mots
    $$('[data-split]').forEach((el) => {
      const words = splitWords(el, true);
      G.set(words, { yPercent: 110 });
      G.to(words, {
        yPercent: 0, duration: 1.2, ease: 'expo.out', stagger: 0.05,
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      });
    });

    // Manifeste : les mots s'allument
    const manifesto = $('[data-words]');
    if (manifesto) {
      const words = splitWords(manifesto, false);
      G.to(words, {
        opacity: 1, ease: 'none', stagger: 0.05,
        scrollTrigger: { trigger: manifesto, start: 'top 78%', end: 'bottom 50%', scrub: true },
      });
    }

    // Titre de l'accès
    G.to('.cta__title .line > span', {
      y: 0, duration: 1.4, ease: 'expo.out', stagger: 0.12,
      scrollTrigger: { trigger: '.cta__title', start: 'top 85%', once: true },
    });

    // Apparitions génériques
    ST.batch('.pillars__lead, .glimpse__lead, .cta__text, .cta__code, .seal, .term, .stat, .manifesto__sign, .prow, .footer__col', {
      start: 'top 90%', once: true,
      onEnter: (els) => G.fromTo(els, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08, overwrite: true }),
    });

    // Plateforme : défilement horizontal sur grand écran
    const mm = G.matchMedia();
    mm.add('(min-width: 901px)', () => {
      const section = $('[data-pillars]');
      const track = $('[data-track]');
      const bar = $('[data-progress]');
      section.classList.add('is-pinned');
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
      G.to(track, {
        x: () => -distance(), ease: 'none',
        scrollTrigger: {
          trigger: section, start: 'top top', end: () => '+=' + distance(),
          pin: true, scrub: 0.8, invalidateOnRefresh: true, anticipatePin: 1,
          onUpdate: (self) => { if (bar) bar.style.transform = `scaleX(${self.progress})`; },
        },
      });
      return () => section.classList.remove('is-pinned');
    });
    mm.add('(max-width: 900px)', () => {
      ST.batch('.pcard', {
        start: 'top 88%', once: true,
        onEnter: (els) => G.fromTo(els, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.1 }),
      });
    });

    // Mot géant du pied de page
    G.fromTo('.footer__word', { yPercent: 35 }, {
      yPercent: 0, ease: 'none',
      scrollTrigger: { trigger: '[data-footer]', start: 'top bottom', end: 'bottom bottom', scrub: true },
    });

    window.addEventListener('load', () => ST.refresh());
  }

  /* ------------------------------------------------------------------
     Visuel « chiffré » (carte 02)
     ------------------------------------------------------------------ */
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const rand = (n) => Array.from({ length: n }, () => CHARS[(Math.random() * CHARS.length) | 0]).join('');
  const onVisible = (el, cb) => {
    if (!('IntersectionObserver' in window)) { cb(true); return; }
    new IntersectionObserver(([e]) => cb(e.isIntersecting)).observe(el);
  };

  const cipher = $('[data-cipher]');
  if (cipher) {
    let text = rand(900).split('');
    cipher.textContent = text.join('');
    let live = false;
    onVisible(cipher, (v) => { live = v; });
    if (!reduce) {
      setInterval(() => {
        if (!live) return;
        for (let i = 0; i < 26; i++) text[(Math.random() * text.length) | 0] = CHARS[(Math.random() * CHARS.length) | 0];
        cipher.textContent = text.join('');
      }, 110);
    }
  }

  /* ------------------------------------------------------------------
     Terminal du protocole
     ------------------------------------------------------------------ */
  const term = $('[data-term-body]');
  if (term) {
    const LINES = [
      ['$ enclave ouvrir --coffre principal', '<span class="muted">$</span> enclave ouvrir --coffre principal'],
      ['› Avertissement de confidentialité ..... accepté', '› Avertissement de confidentialité ..... <span class="ok">accepté</span>'],
      ['› Dérivation de la clé (PBKDF2) ........ ok', '› Dérivation de la clé (PBKDF2) ........ <span class="ok">ok</span>'],
      ['› Déchiffrement AES-256-GCM ............ ok', '› Déchiffrement AES-256-GCM ............ <span class="ok">ok</span>'],
      ['› Journal d\'accès ..................... +1 entrée', '› Journal d\'accès ..................... <span class="ok">+1 entrée</span>'],
      ['› Verrouillage automatique ............. 05:00', '› Verrouillage automatique ............. <span class="ok">05:00</span>'],
      ['✓ Session ouverte. Rien ne sort du coffre.', '<span class="ok">✓ Session ouverte.</span> Rien ne sort du coffre.'],
    ];
    let started = false;
    const finalHTML = LINES.map((l) => l[1]).join('\n');
    if (reduce) {
      term.innerHTML = finalHTML;
    } else {
      onVisible(term, (v) => {
        if (!v || started) return;
        started = true;
        let li = 0, ci = 0;
        const done = [];
        const step = () => {
          if (li >= LINES.length) { term.innerHTML = finalHTML + '\n<span class="caret"></span>'; return; }
          const [plain, html] = LINES[li];
          ci++;
          term.innerHTML = done.join('\n') + (done.length ? '\n' : '') + escapeHTML(plain.slice(0, ci)) + '<span class="caret"></span>';
          if (ci >= plain.length) {
            done.push(html);
            li++; ci = 0;
            setTimeout(step, li === 1 ? 420 : 260);
          } else {
            setTimeout(step, li === 0 ? 38 : 9);
          }
        };
        setTimeout(step, 300);
      });
    }
  }

  function escapeHTML(s) {
    return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  /* ------------------------------------------------------------------
     Compteurs
     ------------------------------------------------------------------ */
  const fmt = new Intl.NumberFormat('fr-FR');
  $$('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    const from = target === 0 ? 128 : 0;
    const render = (v) => { el.textContent = fmt.format(Math.round(v)); };
    if (reduce) { render(target); return; }
    render(from);
    let done = false;
    onVisible(el, (v) => {
      if (!v || done) return;
      done = true;
      const start = performance.now();
      const dur = 1900;
      const tick = (now) => {
        const p = Math.min((now - start) / dur, 1);
        const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
        render(from + (target - from) * e);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });

  /* ------------------------------------------------------------------
     Comparateur avec / sans la clé
     ------------------------------------------------------------------ */
  const compare = $('[data-compare]');
  if (compare) {
    const handle = $('[data-handle]', compare);
    let pos = 50;
    let dragging = false;
    let touched = false;
    const set = (v) => {
      pos = Math.max(0, Math.min(100, v));
      compare.style.setProperty('--pos', pos + '%');
      handle.setAttribute('aria-valuenow', String(Math.round(pos)));
    };
    const fromEvent = (e) => {
      const r = compare.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width) * 100);
    };
    compare.addEventListener('pointerdown', (e) => {
      dragging = true; touched = true;
      compare.classList.add('is-drag');
      compare.setPointerCapture(e.pointerId);
      fromEvent(e);
    });
    compare.addEventListener('pointermove', (e) => { if (dragging) fromEvent(e); });
    const stop = () => { dragging = false; compare.classList.remove('is-drag'); };
    compare.addEventListener('pointerup', stop);
    compare.addEventListener('pointercancel', stop);
    handle.addEventListener('keydown', (e) => {
      const map = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -5, ArrowUp: 5 };
      if (e.key in map) { e.preventDefault(); touched = true; set(pos + map[e.key]); }
      if (e.key === 'Home') { e.preventDefault(); set(0); }
      if (e.key === 'End') { e.preventDefault(); set(100); }
    });

    // Petite démonstration automatique à la première apparition
    if (animated) {
      const proxy = { v: 50 };
      ST.create({
        trigger: compare, start: 'top 70%', once: true,
        onEnter: () => {
          G.timeline({ onUpdate: () => { if (!touched) set(proxy.v); } })
            .to(proxy, { v: 76, duration: 1.1, ease: 'power3.inOut' })
            .to(proxy, { v: 26, duration: 1.4, ease: 'power3.inOut' })
            .to(proxy, { v: 50, duration: 1, ease: 'power3.inOut' });
        },
      });
    }

    // Texte chiffré vivant
    const scrambles = $$('[data-scramble-loop]', compare).map((el) => ({ el, base: el.textContent }));
    let live = false;
    onVisible(compare, (v) => { live = v; });
    if (!reduce) {
      setInterval(() => {
        if (!live) return;
        scrambles.forEach((s) => {
          if (Math.random() < 0.55) return;
          s.el.textContent = s.base.replace(/[^\s·,]/g, () => CHARS[(Math.random() * CHARS.length) | 0]);
        });
      }, 140);
    }
  }

  /* ------------------------------------------------------------------
     Horloge (Paris)
     ------------------------------------------------------------------ */
  const clock = $('[data-clock]');
  if (clock) {
    const f = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const tickClock = () => { clock.textContent = f.format(new Date()); };
    tickClock();
    setInterval(tickClock, 1000);
  }

  /* ------------------------------------------------------------------
     Mot géant du pied de page : occupe exactement la largeur
     ------------------------------------------------------------------ */
  const word = $('.footer__word');
  if (word) {
    const fit = () => {
      word.style.fontSize = '';
      const size = parseFloat(getComputedStyle(word).fontSize);
      const ratio = word.clientWidth / word.scrollWidth;
      word.style.fontSize = (size * Math.min(ratio, 3) * 0.99) + 'px';
    };
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(fit);
    window.addEventListener('resize', fit, { passive: true });
  }

  /* ------------------------------------------------------------------
     Démarrage
     ------------------------------------------------------------------ */
  runLoader();
})();
