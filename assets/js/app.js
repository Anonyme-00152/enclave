/* ==========================================================================
   ENCLAVE® — Application
   Flux : avertissement → clé d'accès → coffre déchiffré en mémoire → app.
   Les données ne sont jamais écrites en clair : chaque modification
   re-scelle l'intégralité du coffre (AES-256-GCM, nouvel IV).
   ========================================================================== */
(function () {
  'use strict';

  const DEMO_CODE = '240617';
  const MAX_ATTEMPTS = 5;
  const REVEAL_MS = 20000;
  const LS = { theme: 'enclave.theme', fails: 'enclave.fails' };

  /* ------------------------------------------------------------------
     Outils
     ------------------------------------------------------------------ */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (name, cls) => `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* rien */ } },
  };

  const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const nf = new Intl.NumberFormat('fr-FR');
  const dShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const dLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
  const dtFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const dtSec = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

  function compactEUR(n) {
    if (n >= 1e6) return (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' M€';
    if (n >= 1e4) return Math.round(n / 1e3).toLocaleString('fr-FR') + ' k€';
    return eur.format(n);
  }
  function ago(ts) {
    const diff = (ts - Date.now()) / 1000;
    const a = Math.abs(diff);
    if (a < 60) return 'à l\'instant';
    if (a < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    if (a < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
    if (a < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), 'month');
    return rtf.format(Math.round(diff / (86400 * 365)), 'year');
  }
  const isoDate = (iso) => (iso ? new Date(iso + 'T12:00:00') : null);
  const fmtISO = (iso) => (iso ? dShort.format(isoDate(iso)) : '');
  const daysSince = (ts) => Math.floor((Date.now() - ts) / 86400000);
  const fullName = (c) => `${c.prenom} ${c.nom}`.trim();
  const initials = (c) => (((c.prenom || '')[0] || '') + ((c.nom || '')[0] || '')).toUpperCase();
  const lastContact = (c) => Math.max(c.createdAt || 0, ...(c.historique || []).map((h) => h.date));
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setPath = (o, p, v) => {
    const ks = p.split('.');
    let t = o;
    ks.slice(0, -1).forEach((k) => { if (!t[k] || typeof t[k] !== 'object') t[k] = {}; t = t[k]; });
    t[ks[ks.length - 1]] = v;
  };
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  /* ------------------------------------------------------------------
     État
     ------------------------------------------------------------------ */
  const S = {
    key: null, salt: null, data: null,
    session: null, view: 'dashboard', openId: null,
    lastActive: Date.now(), warned: false, tick: null,
    filters: { q: '', statut: 'Tous', niveau: 'Tous', sort: 'nom', dir: 1 },
    logFilter: { q: '', action: 'Toutes' },
    queue: Promise.resolve(),
    seedReady: Promise.resolve(),
    pin: '', busy: false, lockoutTimer: null,
    reveals: new Map(),
    prevAccess: null, pendingFails: 0,
    returnFocus: null,
  };

  function newSessionId() {
    const b = crypto.getRandomValues(new Uint8Array(4));
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    return h.slice(0, 4) + '-' + h.slice(4);
  }

  /* File d'attente : journal et scellement s'exécutent dans l'ordre. */
  function enqueue(fn) {
    const p = S.queue.then(fn);
    S.queue = p.catch((e) => console.error('[ENCLAVE]', e));
    return p;
  }

  function log(action, target, detail, opts) {
    const o = opts || {};
    return enqueue(async () => {
      if (!S.data) return;
      const L = S.data.log;
      const last = L[L.length - 1];
      const e = {
        id: last ? last.id + 1 : 1,
        user: o.user || 'E. Arti',
        prev: last ? last.hash : 'GENESIS',
        ts: o.ts || Date.now(),
        action,
        target: target || '',
        detail: detail || '',
        session: o.session || S.session,
      };
      e.hash = await Vault.sha256(EnclaveSeed.entryString(e));
      L.push(e);
      if (L.length > 1500) L.splice(0, L.length - 1500);
    });
  }

  function save() {
    return enqueue(async () => {
      if (S.key && S.data) await Vault.write(S.key, S.salt, S.data);
    });
  }

  async function verifyChain() {
    const L = S.data.log;
    if (!L.length) return { ok: true, n: 0, head: '—' };
    let prev = L[0].prev;
    for (const e of L) {
      if (e.prev !== prev) return { ok: false, at: e.id, n: L.length };
      const h = await Vault.sha256(EnclaveSeed.entryString(e));
      if (h !== e.hash) return { ok: false, at: e.id, n: L.length };
      prev = e.hash;
    }
    return { ok: true, n: L.length, head: prev };
  }

  /* ------------------------------------------------------------------
     Thème, filigrane, notifications
     ------------------------------------------------------------------ */
  function applyTheme(t) {
    const theme = t === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    store.set(LS.theme, theme);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#F4F2EC' : '#0B0A09';
    const btn = $('[data-action="theme"]');
    if (btn) btn.innerHTML = ic(theme === 'light' ? 'moon' : 'sun');
    if (S.data) S.data.settings.theme = theme;
    updateWatermark();
    if (S.view === 'dashboard' && S.data && document.body.dataset.screen === 'app') drawCharts();
  }

  function updateWatermark() {
    const wm = $('#watermark');
    if (!wm) return;
    const color = document.documentElement.dataset.theme === 'light' ? '#111111' : '#F4EFE6';
    const txt = `CONFIDENTIEL · E. ARTI · SESSION ${S.session} · ${dtFmt.format(new Date())}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="380"><text x="410" y="190" text-anchor="middle" transform="rotate(-24 410 190)" fill="${color}" font-family="ui-monospace, monospace" font-size="12" letter-spacing="2">${esc(txt)}</text></svg>`;
    wm.style.backgroundImage = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  }

  function toast(msg, kind, icon) {
    const k = kind || 'ok';
    const el = document.createElement('div');
    el.className = `toast toast--${k}`;
    el.setAttribute('role', 'status');
    el.innerHTML = ic(icon || { ok: 'check', warn: 'alert', danger: 'alert', info: 'shield' }[k]) + `<span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 320); }, 3400);
  }

  /* ------------------------------------------------------------------
     Écrans
     ------------------------------------------------------------------ */
  function showScreen(name) {
    document.body.dataset.screen = name;
    $('#screen-notice').hidden = name !== 'notice';
    $('#screen-lock').hidden = name !== 'lock';
    $('#screen-app').hidden = name !== 'app';
  }

  /* 1. Avertissement */
  function initNotice() {
    $('[data-session]').textContent = S.session;
    $('[data-now]').textContent = dtFmt.format(new Date());
    const cb = $('#notice-accept');
    const btn = $('#notice-continue');
    cb.addEventListener('change', () => { btn.disabled = !cb.checked; });
    btn.addEventListener('click', () => {
      if (!cb.checked) return;
      showLock();
    });
  }

  /* 2. Clé d'accès */
  function failState() {
    try {
      const f = JSON.parse(store.get(LS.fails));
      return f && typeof f.count === 'number' ? f : { count: 0, pending: [], until: 0 };
    } catch (e) {
      return { count: 0, pending: [], until: 0 };
    }
  }
  const setFailState = (f) => store.set(LS.fails, JSON.stringify(f));

  function registerFail() {
    const f = failState();
    f.count += 1;
    f.pending = (f.pending || []).concat(Date.now()).slice(-50);
    if (f.count % MAX_ATTEMPTS === 0) f.until = Date.now() + 30000 * Math.pow(2, f.count / MAX_ATTEMPTS - 1);
    setFailState(f);
    return f;
  }
  const lockedOut = () => failState().until > Date.now();

  function setStatus(msg, kind) {
    const el = $('#lock-status');
    el.textContent = msg || ' ';
    el.className = 'lock__status' + (kind ? ' is-' + kind : '');
  }

  function refreshVaultMeta() {
    const m = Vault.meta();
    $('[data-vault-size]').textContent = m ? (m.size / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Ko chiffrés' : 'Préparation…';
    $('[data-vault-date]').textContent = m ? dtFmt.format(new Date(m.sealedAt)) : '—';
  }

  function showLock(message) {
    showScreen('lock');
    S.pin = '';
    S.busy = false;
    renderPin();
    refreshVaultMeta();
    setStatus(message || '');
    checkLockout();
    toggleForgot();
  }

  function renderPin() {
    $$('#pin i').forEach((d, i) => d.classList.toggle('on', i < S.pin.length));
  }

  function checkLockout() {
    const keys = $$('#keypad button');
    clearTimeout(S.lockoutTimer);
    if (!lockedOut()) { keys.forEach((b) => { b.disabled = false; }); return; }
    keys.forEach((b) => { b.disabled = true; });
    const tick = () => {
      const s = Math.ceil((failState().until - Date.now()) / 1000);
      if (s <= 0) {
        keys.forEach((b) => { b.disabled = false; });
        setStatus('Vous pouvez réessayer.');
        return;
      }
      setStatus(`Trop de tentatives. Nouvel essai possible dans ${s} s.`, 'error');
      S.lockoutTimer = setTimeout(tick, 250);
    };
    tick();
  }

  function toggleForgot() {
    let el = $('#lock-forgot');
    const show = failState().count >= 3;
    if (!el) {
      el = document.createElement('p');
      el.id = 'lock-forgot';
      el.className = 'lock__sub';
      el.innerHTML = 'Code oublié ? Sans la clé, le coffre est illisible. <button type="button" class="link" id="demo-reset">Réinitialiser la démo</button>';
      $('.lock__box').appendChild(el);
      $('#demo-reset').addEventListener('click', resetDemo);
    }
    el.hidden = !show;
  }

  function press(k) {
    if (S.busy || lockedOut()) return;
    if (k === 'back') S.pin = S.pin.slice(0, -1);
    else if (k === 'clear') S.pin = '';
    else if (/^\d$/.test(k) && S.pin.length < 6) S.pin += k;
    const btn = $(`#keypad [data-key="${k}"]`);
    if (btn) { btn.classList.add('is-press'); setTimeout(() => btn.classList.remove('is-press'), 130); }
    renderPin();
    if (S.pin.length === 6) attempt();
  }

  async function attempt() {
    S.busy = true;
    const pin = $('#pin');
    const lockEl = $('#screen-lock');
    pin.classList.add('is-busy');
    setStatus('Dérivation de la clé et déchiffrement…');
    const t0 = performance.now();
    await S.seedReady;
    let res = null;
    try { res = await Vault.open(S.pin); } catch (e) { res = null; }
    await sleep(Math.max(0, 700 - (performance.now() - t0)));
    pin.classList.remove('is-busy');

    if (!res) {
      const f = registerFail();
      pin.classList.add('is-error');
      if (navigator.vibrate) navigator.vibrate(120);
      if (lockedOut()) checkLockout();
      else {
        const left = MAX_ATTEMPTS - (f.count % MAX_ATTEMPTS);
        setStatus(`Clé incorrecte. ${left} essai${left > 1 ? 's' : ''} avant blocage temporaire.`, 'error');
      }
      toggleForgot();
      await sleep(650);
      pin.classList.remove('is-error');
      S.pin = '';
      renderPin();
      S.busy = false;
      return;
    }

    pin.classList.add('is-ok');
    lockEl.classList.add('is-open');
    setStatus('Coffre déchiffré.', 'ok');
    S.key = res.key;
    S.salt = res.salt;
    S.data = res.data;
    S.pin = '';
    await sleep(520);
    pin.classList.remove('is-ok');
    lockEl.classList.remove('is-open');
    S.busy = false;
    enterApp();
  }

  async function fillDemo() {
    if (S.busy || lockedOut()) return;
    S.pin = '';
    renderPin();
    for (const d of DEMO_CODE) {
      await sleep(85);
      press(d);
    }
  }

  async function resetDemo() {
    const ok = await confirmDialog({
      title: 'Réinitialiser la démo ?',
      text: 'Toutes les données du coffre seront <strong>définitivement effacées</strong>, puis un nouveau coffre fictif sera créé avec le code <strong>240 617</strong>.',
      confirm: 'Tout effacer',
      danger: true,
    });
    if (!ok) return;
    Vault.destroy();
    store.del(LS.fails);
    location.reload();
  }

  /* 3. Entrée dans l'application */
  async function enterApp() {
    const f = failState();
    const pending = f.pending || [];
    setFailState({ count: 0, pending: [], until: 0 });
    S.prevAccess = S.data.lastAccess || Date.now();
    S.pendingFails = pending.length;
    S.data.lastAccess = Date.now();
    S.data.settings = Object.assign({ autoLock: 5, veil: true, autoMask: true }, S.data.settings);
    pending.forEach((ts) => log('Échec de connexion', 'Session', 'Clé incorrecte', { ts, session: '—', user: 'Inconnu' }));
    log('Connexion', 'Session', 'Clé valide');
    save();

    showScreen('app');
    const shell = $('#screen-app');
    shell.classList.add('is-entering');
    setTimeout(() => shell.classList.remove('is-entering'), 900);
    applyTheme(store.get(LS.theme) || S.data.settings.theme);
    $('[data-kbd]').textContent = isMac ? '⌘ K' : 'Ctrl K';
    S.lastActive = Date.now();
    S.warned = false;
    startSessionTimer();
    updateCounts();
    go(S.view || 'dashboard');
  }

  async function lock(reason) {
    if (!S.key) return;
    closePalette(true);
    closeModal(true);
    closeDrawer(true);
    await log('Verrouillage', 'Session', reason || 'Manuel');
    await save();
    wipe();
    showLock(reason === 'Inactivité' ? 'Session verrouillée après une période d\'inactivité.' : 'Coffre verrouillé. Les données ont été effacées de la mémoire.');
  }

  function wipe() {
    S.key = null;
    S.salt = null;
    S.data = null;
    S.openId = null;
    clearInterval(S.tick);
    S.reveals.forEach((r) => clearTimeout(r.timer));
    S.reveals.clear();
    $('#view').innerHTML = '';
    $('.drawer__panel').innerHTML = '';
    $('.modal__panel').innerHTML = '';
    $('#palette-list').innerHTML = '';
    $('#veil').hidden = true;
  }

  /* ------------------------------------------------------------------
     Sécurité de session : inactivité, voile
     ------------------------------------------------------------------ */
  function startSessionTimer() {
    clearInterval(S.tick);
    const tick = () => {
      if (!S.key) return;
      const limit = (Number(S.data.settings.autoLock) || 5) * 60000;
      const left = limit - (Date.now() - S.lastActive);
      if (left <= 0) { lock('Inactivité'); return; }
      const s = Math.ceil(left / 1000);
      $('[data-lock-timer]').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      const ring = $('.session__ring');
      $('.session__progress').style.strokeDashoffset = String(97.4 * (1 - left / limit));
      ring.classList.toggle('is-low', left < 30000);
      if (left < 30000 && !S.warned) {
        S.warned = true;
        toast('Verrouillage dans 30 secondes. Bougez la souris pour rester connecté.', 'warn', 'clock');
      }
    };
    tick();
    S.tick = setInterval(tick, 1000);
  }

  function activity() {
    S.lastActive = Date.now();
    S.warned = false;
  }

  function veil() {
    if (!S.key || !S.data.settings.veil) return;
    $('#veil').hidden = false;
  }

  /* ------------------------------------------------------------------
     Navigation
     ------------------------------------------------------------------ */
  const VIEWS = {
    dashboard: { title: 'Tableau de bord', render: renderDashboard },
    clients: { title: 'Clients', render: renderClients },
    journal: { title: 'Journal d\'accès', render: renderJournal },
    settings: { title: 'Paramètres', render: renderSettings },
  };

  function go(view) {
    if (!VIEWS[view] || !S.data) return;
    S.view = view;
    $$('[data-nav]').forEach((b) => {
      if (b.dataset.nav === view) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $('[data-title]').textContent = VIEWS[view].title;
    $('[data-crumb]').textContent = 'ENCLAVE / ' + VIEWS[view].title;
    VIEWS[view].render();
    $('#view').scrollTop = 0;
  }

  function refresh() {
    if (!S.data) return;
    updateCounts();
    const v = $('#view');
    const top = v.scrollTop;
    if (S.view === 'clients') renderClientRows();
    else VIEWS[S.view].render();
    v.scrollTop = top;
  }

  function updateCounts() {
    const el = $('[data-count-clients]');
    if (el && S.data) el.textContent = S.data.clients.length;
  }

  /* ------------------------------------------------------------------
     Composants
     ------------------------------------------------------------------ */
  function avatar(c, size) {
    return `<span class="avatar${size ? ' avatar--' + size : ''}" style="--h:${Number(c.hue) || 0}" aria-hidden="true">${esc(initials(c))}${c.niveau === 'Secret' ? `<span class="avatar__lock">${ic('lock')}</span>` : ''}</span>`;
  }
  const STATUT_CLASS = { 'Actif': 'actif', 'Prospect': 'prospect', 'En pause': 'pause', 'Archivé': 'archive' };
  const statutBadge = (s) => `<span class="badge badge--${STATUT_CLASS[s] || 'archive'}"><i></i>${esc(s)}</span>`;
  const niveauBadge = (n) => `<span class="badge badge--${(n || 'Standard').toLowerCase()}">${n === 'Standard' ? '' : ic('lock')}${esc(n)}</span>`;
  const NIVEAU_RANK = { Standard: 0, Restreint: 1, Secret: 2 };
  const ACT_ICON = {
    'Connexion': 'unlock', 'Consultation': 'file', 'Révélation': 'eye', 'Copie': 'copy', 'Modification': 'edit',
    'Création': 'plus', 'Suppression': 'trash', 'Interaction': 'message', 'Verrouillage': 'lock',
    'Échec de connexion': 'alert', 'Changement de clé': 'key',
  };
  const actIcon = (a) => `<span class="act act--${esc(a.split(' ')[0])}">${ic(ACT_ICON[a] || 'activity')}</span>`;
  const HISTO_ICON = { 'Appel': 'phone', 'Réunion': 'calendar', 'E-mail': 'mail', 'Contrat': 'file', 'Note': 'note' };
  const findClient = (id) => S.data && S.data.clients.find((c) => c.id === id);

  /* ------------------------------------------------------------------
     Tableau de bord
     ------------------------------------------------------------------ */
  function renderDashboard() {
    const C = S.data.clients;
    const now = Date.now();
    const actifs = C.filter((c) => c.statut === 'Actif');
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const nouveaux = C.filter((c) => c.createdAt >= monthStart.getTime()).length;
    const valeur = actifs.reduce((s, c) => s + (Number(c.valeur) || 0), 0);
    const secrets = C.filter((c) => c.niveau === 'Secret').length;
    const day = S.data.log.filter((e) => e.ts > now - 86400000);
    const views24 = day.filter((e) => e.action === 'Consultation').length;
    const reveals24 = day.filter((e) => e.action === 'Révélation' || e.action === 'Copie').length;
    const relance = C.filter((c) => c.statut !== 'Archivé' && daysSince(lastContact(c)) > 30)
      .sort((a, b) => lastContact(a) - lastContact(b)).slice(0, 5);
    const recent = S.data.log.slice(-8).reverse();
    const h = new Date().getHours();
    const greet = h >= 5 && h < 18 ? 'Bonjour' : 'Bonsoir';
    const pct = C.length ? Math.round((secrets / C.length) * 100) : 0;

    $('#view').innerHTML = `
      <div class="stack">
        <div class="hello">
          <div>
            <h2 class="hello__title">${greet}, <em>Ebubekir.</em></h2>
            <p class="hello__meta">${esc(capitalize(dLong.format(new Date())))} · dernier accès ${esc(ago(S.prevAccess))}</p>
          </div>
          <div class="hello__chips">
            <span class="chip mono">${ic('shield')}Session ${esc(S.session)}</span>
            <span class="chip mono">${ic('lock')}AES-256-GCM</span>
          </div>
        </div>

        ${S.pendingFails ? `<div class="alert alert--danger">${ic('alert')}<p><strong>${S.pendingFails} tentative${S.pendingFails > 1 ? 's' : ''} d'accès échouée${S.pendingFails > 1 ? 's' : ''}</strong> depuis votre dernière session. Elles ont été ajoutées au journal.</p><button type="button" class="btn btn--ghost btn--sm" data-nav="journal">Voir le journal</button></div>` : ''}

        <div class="grid grid--kpi">
          <div class="card kpi">
            <p class="kpi__label">${ic('users')}Clients actifs</p>
            <p class="kpi__value">${nf.format(actifs.length)}</p>
            <p class="kpi__delta">${nouveaux ? `<b>+${nouveaux}</b> nouveau${nouveaux > 1 ? 'x' : ''} ce mois-ci` : 'Aucun nouveau client ce mois-ci'}</p>
          </div>
          <div class="card kpi">
            <p class="kpi__label">${ic('card')}Valeur annuelle du portefeuille</p>
            <p class="kpi__value">${esc(compactEUR(valeur))}</p>
            <p class="kpi__delta">sur ${actifs.length} contrat${actifs.length > 1 ? 's' : ''} actif${actifs.length > 1 ? 's' : ''}</p>
          </div>
          <div class="card kpi">
            <p class="kpi__label">${ic('lock')}Fiches classées Secret</p>
            <p class="kpi__value">${secrets}</p>
            <p class="kpi__delta">${pct} % du coffre</p>
          </div>
          <div class="card kpi kpi--accent">
            <p class="kpi__label">${ic('eye')}Consultations sur 24 h</p>
            <p class="kpi__value">${views24}</p>
            <p class="kpi__delta"><b>${reveals24}</b> accès à des données sensibles</p>
          </div>
        </div>

        <div class="grid grid--dash">
          <section class="card">
            <div class="card__head"><div><h3 class="card__title">Nouveaux clients</h3><p class="card__sub">Fiches créées par mois, 12 derniers mois · mois en cours en surbrillance</p></div></div>
            <div class="chart" id="chart-acq"></div>
          </section>
          <section class="card">
            <div class="card__head"><div><h3 class="card__title">Niveaux de confidentialité</h3><p class="card__sub">Répartition des ${C.length} fiches du coffre</p></div></div>
            <div id="chart-levels"></div>
          </section>
        </div>

        <div class="grid grid--dash">
          <section class="card">
            <div class="card__head"><div><h3 class="card__title">Valeur annuelle par segment</h3><p class="card__sub">Clients actifs uniquement</p></div></div>
            <div class="chart" id="chart-seg"></div>
          </section>
          <section class="card">
            <div class="card__head"><div><h3 class="card__title">À relancer</h3><p class="card__sub">Sans contact depuis plus de 30 jours</p></div></div>
            ${relance.length ? `<div class="list">${relance.map((c) => `
              <button type="button" class="list__item" data-open="${esc(c.id)}">
                ${avatar(c)}
                <div class="list__main"><p>${esc(fullName(c))}</p><p>${esc(c.entreprise || 'Particulier')}</p></div>
                <span class="list__aside">${daysSince(lastContact(c))} j</span>
              </button>`).join('')}</div>` : `<div class="empty">${ic('check')}<p>Tout le monde est à jour</p></div>`}
          </section>
        </div>

        <section class="card">
          <div class="card__head">
            <div><h3 class="card__title">Activité récente</h3><p class="card__sub">Dernières entrées du journal d'accès</p></div>
            <button type="button" class="btn btn--ghost btn--sm" data-nav="journal">Tout le journal${ic('arrow-ur')}</button>
          </div>
          <div class="list">${recent.map((e) => `
            <div class="list__item">
              ${actIcon(e.action)}
              <div class="list__main"><p>${esc(e.action)}${e.detail ? ' · ' + esc(e.detail) : ''}</p><p>${esc(e.user)} · session ${esc(e.session)}</p></div>
              <span class="list__aside">${esc(ago(e.ts))}</span>
            </div>`).join('')}</div>
        </section>
      </div>`;
    drawCharts();
  }

  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function drawCharts() {
    if (!S.data || S.view !== 'dashboard') return;
    const C = S.data.clients;

    // Acquisition sur 12 mois
    const acq = $('#chart-acq');
    if (acq) {
      const now = new Date();
      const data = [];
      for (let i = 11; i >= 0; i--) {
        const a = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const b = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        data.push({
          label: MONTHS[a.getMonth()],
          full: capitalize(dMonth.format(a)),
          value: C.filter((c) => c.createdAt >= a.getTime() && c.createdAt < b.getTime()).length,
        });
      }
      columnChart(acq, data);
    }

    // Niveaux
    const lv = $('#chart-levels');
    if (lv) {
      const levels = ['Standard', 'Restreint', 'Secret'].map((n, i) => ({ n, v: C.filter((c) => c.niveau === n).length, color: `var(--seq-${i + 1})` }));
      const total = C.length || 1;
      lv.innerHTML = `
        <div class="stackbar" role="img" aria-label="${levels.map((l) => `${l.n} : ${l.v}`).join(', ')}">
          ${levels.filter((l) => l.v).map((l) => `<i style="flex:${l.v};background:${l.color}" title="${l.n} · ${l.v} fiche${l.v > 1 ? 's' : ''}"></i>`).join('')}
        </div>
        <ul class="legend">
          ${levels.map((l) => `<li><span class="sw" style="background:${l.color}"></span><span>${l.n}</span><span class="n">${l.v}</span><span class="p">${Math.round((l.v / total) * 100)} %</span></li>`).join('')}
        </ul>`;
    }

    // Valeur par segment
    const seg = $('#chart-seg');
    if (seg) {
      const rows = ['Grand compte', 'PME', 'Startup', 'Particulier'].map((s) => {
        const list = C.filter((c) => c.segment === s && c.statut === 'Actif');
        return { label: s, value: list.reduce((a, c) => a + (Number(c.valeur) || 0), 0), count: list.length };
      });
      hbarChart(seg, rows);
    }
  }

  function niceStep(max) {
    if (max <= 5) return 1;
    if (max <= 10) return 2;
    if (max <= 25) return 5;
    return Math.ceil(max / 50) * 10;
  }

  function attachTooltip(container, selector, content) {
    let tip = $('.tooltip', container);
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tooltip';
      tip.innerHTML = '<strong></strong><span></span>';
      container.appendChild(tip);
    }
    const show = (g) => {
      const { value, label, x, y } = content(g);
      tip.firstChild.textContent = value;
      tip.lastChild.textContent = label;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
      tip.classList.add('is-on');
      $$(selector, container).forEach((n) => n.classList.toggle('is-hover', n === g));
    };
    const hide = () => {
      tip.classList.remove('is-on');
      $$(selector, container).forEach((n) => n.classList.remove('is-hover'));
    };
    $$(selector, container).forEach((g) => {
      g.addEventListener('pointerenter', () => show(g));
      g.addEventListener('pointerleave', hide);
      g.addEventListener('focusin', () => show(g));
      g.addEventListener('focusout', hide);
    });
  }

  function columnChart(el, data) {
    const W = Math.max(280, el.clientWidth);
    const H = 230, pl = 30, pr = 6, pt = 24, pb = 28;
    const max = Math.max(1, ...data.map((d) => d.value));
    const step = niceStep(max);
    const top = Math.ceil(max / step) * step;
    const ih = H - pt - pb, iw = W - pl - pr;
    const band = iw / data.length;
    const bw = Math.min(24, band * 0.56);
    const y = (v) => pt + ih - (v / top) * ih;
    const base = pt + ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Nouveaux clients par mois sur 12 mois">`;
    for (let v = step; v <= top; v += step) {
      s += `<line class="grid-line" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/>`;
      s += `<text class="tick" x="${pl - 10}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    s += `<text class="tick" x="${pl - 10}" y="${base + 4}" text-anchor="end">0</text>`;
    const maxIdx = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
    data.forEach((d, i) => {
      const x = pl + i * band + (band - bw) / 2;
      const h = (d.value / top) * ih;
      const r = Math.min(4, h);
      const last = i === data.length - 1;
      const path = h > 0
        ? `M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + bw - r} Q${x + bw},${base - h} ${x + bw},${base - h + r} V${base} Z`
        : '';
      s += `<g class="col" data-i="${i}"><rect class="hit" x="${pl + i * band}" y="${pt}" width="${band}" height="${ih}" tabindex="0" aria-label="${esc(d.full)} : ${d.value} nouveau${d.value > 1 ? 'x' : ''} client${d.value > 1 ? 's' : ''}"/>`;
      if (path) s += `<path class="bar${last ? ' bar--accent' : ''}" d="${path}"/>`;
      s += '</g>';
      s += `<text x="${pl + i * band + band / 2}" y="${H - 8}" text-anchor="middle">${d.label}</text>`;
      if ((last || i === maxIdx) && d.value > 0) s += `<text class="val" x="${pl + i * band + band / 2}" y="${base - h - 8}" text-anchor="middle">${d.value}</text>`;
    });
    s += `<line class="baseline" x1="${pl}" x2="${W - pr}" y1="${base}" y2="${base}"/></svg>`;
    el.innerHTML = s;
    attachTooltip(el, '.col', (g) => {
      const i = Number(g.dataset.i);
      const d = data[i];
      return {
        value: `${d.value} nouveau${d.value > 1 ? 'x' : ''} client${d.value > 1 ? 's' : ''}`,
        label: d.full,
        x: pl + i * band + band / 2,
        y: y(d.value),
      };
    });
  }

  function hbarChart(el, rows) {
    const W = Math.max(280, el.clientWidth);
    const rowH = 44, labelW = 112, valW = 78;
    const H = rows.length * rowH;
    const max = Math.max(1, ...rows.map((r) => r.value));
    const iw = W - labelW - valW;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Valeur annuelle par segment">`;
    rows.forEach((r, i) => {
      const cy = i * rowH + rowH / 2;
      const w = r.value > 0 ? Math.max(6, (r.value / max) * iw) : 0;
      const x0 = labelW, t = 6, rr = Math.min(4, w);
      s += `<g class="row" data-i="${i}"><rect class="hit" x="0" y="${i * rowH}" width="${W}" height="${rowH}" tabindex="0" aria-label="${esc(r.label)} : ${esc(compactEUR(r.value))}"/>`;
      if (w) s += `<path class="bar" d="M${x0},${cy - t} H${x0 + w - rr} Q${x0 + w},${cy - t} ${x0 + w},${cy - t + rr} V${cy + t - rr} Q${x0 + w},${cy + t} ${x0 + w - rr},${cy + t} H${x0} Z"/>`;
      s += '</g>';
      s += `<text class="hbar-label" x="0" y="${cy + 4}">${esc(r.label)}</text>`;
      s += `<text class="hbar-val" x="${x0 + w + 10}" y="${cy + 4}">${esc(compactEUR(r.value))}</text>`;
    });
    s += `<line class="baseline" x1="${labelW}" x2="${labelW}" y1="4" y2="${H - 4}"/></svg>`;
    el.innerHTML = s;
    attachTooltip(el, '.row', (g) => {
      const i = Number(g.dataset.i);
      const r = rows[i];
      const w = r.value > 0 ? Math.max(6, (r.value / max) * iw) : 0;
      return { value: eur.format(r.value), label: `${r.label} · ${r.count} client${r.count > 1 ? 's' : ''} actif${r.count > 1 ? 's' : ''}`, x: labelW + w / 2 + 10, y: i * rowH + rowH / 2 - 8 };
    });
  }

  /* ------------------------------------------------------------------
     Clients
     ------------------------------------------------------------------ */
  const STATUTS = [['Tous', 'Tous'], ['Actif', 'Actifs'], ['Prospect', 'Prospects'], ['En pause', 'En pause'], ['Archivé', 'Archivés']];

  function renderClients() {
    const F = S.filters;
    const th = (key, label, cls) => `<th class="${cls || ''}" ${F.sort === key ? `aria-sort="${F.dir > 0 ? 'ascending' : 'descending'}"` : ''}><button type="button" data-sort="${key}">${label}${ic('sort')}</button></th>`;
    $('#view').innerHTML = `
      <div class="stack">
        <div class="toolbar">
          <label class="input-wrap">${ic('search')}<span class="sr-only">Rechercher</span>
            <input class="input" id="cq" type="search" placeholder="Nom, entreprise, e-mail, identifiant…" value="${esc(F.q)}" autocomplete="off">
          </label>
          <div class="segmented" role="group" aria-label="Filtrer par statut">
            ${STATUTS.map(([v, l]) => `<button type="button" data-statut="${v}" aria-pressed="${F.statut === v}">${l}</button>`).join('')}
          </div>
          <select class="select" id="cn" aria-label="Filtrer par niveau de confidentialité">
            ${['Tous', 'Standard', 'Restreint', 'Secret'].map((n) => `<option value="${n}"${F.niveau === n ? ' selected' : ''}>${n === 'Tous' ? 'Tous les niveaux' : 'Niveau ' + n}</option>`).join('')}
          </select>
          <span class="toolbar__count" id="ccount"></span>
        </div>
        <div class="card card--flush">
          <div class="table-wrap table-wrap--clients">
            <table class="table">
              <thead><tr>
                ${th('nom', 'Client')}${th('entreprise', 'Entreprise', 'c-ent')}${th('segment', 'Segment', 'c-seg')}<th>Statut</th>${th('niveau', 'Niveau')}${th('valeur', 'Valeur annuelle', 'num')}${th('contact', 'Dernier contact', 'c-contact')}
              </tr></thead>
              <tbody id="ctbody"></tbody>
            </table>
          </div>
          <div class="cards-list" id="ccards"></div>
          <div id="cempty"></div>
        </div>
      </div>`;

    $('#cq').addEventListener('input', (e) => { F.q = e.target.value; renderClientRows(); });
    $('#cn').addEventListener('change', (e) => { F.niveau = e.target.value; renderClientRows(); });
    $$('[data-statut]').forEach((b) => b.addEventListener('click', () => {
      F.statut = b.dataset.statut;
      $$('[data-statut]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderClientRows();
    }));
    $$('[data-sort]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.sort;
      if (F.sort === k) F.dir *= -1; else { F.sort = k; F.dir = k === 'valeur' || k === 'contact' || k === 'niveau' ? -1 : 1; }
      renderClients();
    }));
    renderClientRows();
  }

  function filteredClients() {
    const F = S.filters;
    const q = F.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const list = S.data.clients.filter((c) => {
      if (F.statut !== 'Tous' && c.statut !== F.statut) return false;
      if (F.niveau !== 'Tous' && c.niveau !== F.niveau) return false;
      if (!q) return true;
      return [c.prenom, c.nom, fullName(c), c.entreprise, c.email, c.id, c.adresse && c.adresse.ville, (c.tags || []).join(' ')].some((v) => norm(v).includes(q));
    });
    const key = {
      nom: (c) => norm(c.nom + ' ' + c.prenom),
      entreprise: (c) => norm(c.entreprise || '~'),
      segment: (c) => norm(c.segment),
      niveau: (c) => NIVEAU_RANK[c.niveau] || 0,
      valeur: (c) => Number(c.valeur) || 0,
      contact: (c) => lastContact(c),
    }[F.sort] || ((c) => c.nom);
    return list.sort((a, b) => {
      const x = key(a), y = key(b);
      return (x > y ? 1 : x < y ? -1 : 0) * F.dir;
    });
  }

  function renderClientRows() {
    const list = filteredClients();
    const tbody = $('#ctbody');
    if (!tbody) return;
    const sub = (c) => (c.niveau === 'Secret' ? '<span class="masked">Coordonnées protégées</span>' : esc(c.email));
    tbody.innerHTML = list.map((c) => `
      <tr tabindex="0" data-open="${esc(c.id)}" aria-label="Ouvrir la fiche de ${esc(fullName(c))}">
        <td><div class="who">${avatar(c)}<div><p>${esc(fullName(c))}</p><p>${sub(c)}</p></div></div></td>
        <td class="c-ent">${c.entreprise ? esc(c.entreprise) : '<span class="muted">Particulier</span>'}</td>
        <td class="c-seg">${esc(c.segment)}</td>
        <td>${statutBadge(c.statut)}</td>
        <td>${niveauBadge(c.niveau)}</td>
        <td class="num">${c.valeur ? esc(eur.format(c.valeur)) : '<span class="muted">—</span>'}</td>
        <td class="muted c-contact">${esc(ago(lastContact(c)))}</td>
      </tr>`).join('');
    $('#ccards').innerHTML = list.map((c) => `
      <button type="button" class="ccard" data-open="${esc(c.id)}">
        ${avatar(c)}
        <p>${esc(fullName(c))}</p>
        <span class="num">${c.valeur ? esc(compactEUR(c.valeur)) : '—'}</span>
        <p class="sub">${esc(c.entreprise || 'Particulier')} · ${esc(c.statut)}</p>
        ${niveauBadge(c.niveau)}
      </button>`).join('');
    $('#cempty').innerHTML = list.length ? '' : `<div class="empty">${ic('search')}<p>Aucune fiche ne correspond</p><p>Modifiez la recherche ou les filtres.</p></div>`;
    $('#ccount').textContent = `${list.length} / ${S.data.clients.length} fiches`;
  }

  /* ------------------------------------------------------------------
     Fiche client (tiroir)
     ------------------------------------------------------------------ */
  const SENSITIVE = {
    naissance: { label: 'Date de naissance', get: (c) => fmtISO(c.dateNaissance), mask: () => '•• ••• ••••' },
    lieu: { label: 'Lieu de naissance', get: (c) => c.lieuNaissance, mask: () => '••••••••' },
    iban: { label: 'IBAN', get: (c) => c.iban, mask: (v) => (v ? v.slice(0, 4) + ' •••• •••• •••• ' + v.replace(/\s/g, '').slice(-4) : '') },
    bic: { label: 'BIC', get: (c) => c.bic, mask: (v) => (v ? v.slice(0, 2) + '•••••••' + v.slice(-2) : '') },
    piece: { label: 'N° de pièce d\'identité', get: (c) => c.piece && c.piece.numero, mask: (v) => (v ? '••••••' + v.slice(-3) : '') },
    telephone: { label: 'Téléphone', get: (c) => c.telephone, mask: (v) => (v ? v.slice(0, 6) + ' •• •• ' + v.slice(-2) : '') },
    adresse: { label: 'Adresse', get: (c) => addressOf(c), mask: (v, c) => (v ? '•••• ' + ((c.adresse && c.adresse.ville) || '') : '') },
    email: { label: 'E-mail', get: (c) => c.email, mask: (v) => (v ? v[0] + '•••••@' + v.split('@')[1] : '') },
  };
  const PLAIN_COPY = { email: (c) => c.email, telephone: (c) => c.telephone };

  function addressOf(c) {
    const a = c.adresse || {};
    return [a.ligne, [a.cp, a.ville].filter(Boolean).join(' '), a.pays].filter(Boolean).join(', ');
  }

  function isSensitive(c, key) {
    if (['naissance', 'lieu', 'iban', 'bic', 'piece'].includes(key)) return true;
    return c.niveau === 'Secret' && ['telephone', 'adresse', 'email'].includes(key);
  }

  function field(label, value, opts) {
    const o = opts || {};
    const empty = value == null || value === '';
    return `<div class="${o.span ? 'span-2' : ''}"><dt>${esc(label)}</dt><dd><span class="v${o.mono ? ' mono' : ''}">${empty ? '<span class="empty-v">—</span>' : o.html ? value : esc(value)}</span>${o.copy && !empty ? `<span class="fieldbtns"><button type="button" class="iconbtn iconbtn--sm" data-copy="${o.copy}" aria-label="Copier ${esc(label)}">${ic('copy')}</button></span>` : ''}</dd></div>`;
  }

  function sfield(c, key, opts) {
    const o = opts || {};
    const def = SENSITIVE[key];
    if (!isSensitive(c, key)) {
      return field(def.label, def.get(c), { mono: o.mono, span: o.span, copy: PLAIN_COPY[key] ? key : null });
    }
    const v = def.get(c);
    if (!v) return field(def.label, '', o);
    const shown = S.reveals.has(key);
    return `<div class="${o.span ? 'span-2' : ''}"><dt>${ic('lock')}${esc(def.label)}</dt><dd>
      <span class="v ${shown ? '' : 'masked'}${o.mono ? ' mono' : ''}" data-sv="${key}">${esc(shown ? v : def.mask(v, c))}</span>
      <span class="fieldbtns">
        <button type="button" class="iconbtn iconbtn--sm" data-reveal="${key}" aria-pressed="${shown}" aria-label="${shown ? 'Masquer' : 'Afficher'} : ${esc(def.label)}">${ic(shown ? 'eye-off' : 'eye')}</button>
        <button type="button" class="iconbtn iconbtn--sm" data-copy="${key}" aria-label="Copier : ${esc(def.label)}">${ic('copy')}</button>
      </span></dd>${shown && S.data.settings.autoMask ? `<div class="reveal-timer" style="animation-duration:${Math.max(0, S.reveals.get(key).until - Date.now())}ms"></div>` : ''}</div>`;
  }

  function openClient(id) {
    const c = findClient(id);
    if (!c) return;
    if (S.openId !== id) {
      S.reveals.forEach((r) => clearTimeout(r.timer));
      S.reveals.clear();
      log('Consultation', c.id, fullName(c));
      save();
    }
    S.openId = id;
    const drawer = $('#drawer');
    const wasHidden = drawer.hidden;
    if (wasHidden) S.returnFocus = document.activeElement;
    drawer.classList.remove('is-closing');
    drawer.hidden = false;
    renderDrawer();
    if (wasHidden) $('.drawer__panel').focus();
  }

  function renderDrawer(keepScroll) {
    const c = findClient(S.openId);
    const panel = $('.drawer__panel');
    if (!c) { closeDrawer(true); return; }
    const body = $('.drawer__body', panel);
    const top = keepScroll && body ? body.scrollTop : 0;
    const pro = !!c.entreprise;
    const histo = (c.historique || []).slice().sort((a, b) => b.date - a.date);
    panel.setAttribute('aria-label', 'Fiche client : ' + fullName(c));
    panel.innerHTML = `
      <div class="drawer__bar">
        <button type="button" class="iconbtn" data-close-drawer aria-label="Fermer la fiche">${ic('x')}</button>
        <span class="cell-mono">${esc(c.id)} · créée le ${esc(dShort.format(new Date(c.createdAt)))}</span>
        <button type="button" class="btn btn--ghost btn--sm" data-act="edit">${ic('edit')}Modifier</button>
        <button type="button" class="iconbtn" data-act="delete" aria-label="Supprimer la fiche">${ic('trash')}</button>
      </div>
      <div class="drawer__body">
        <div class="profile">
          ${avatar(c, 'lg')}
          <div class="profile__main">
            <h2 class="profile__name">${esc(c.civilite ? c.civilite + ' ' : '')}${esc(fullName(c))}</h2>
            <p class="profile__role">${pro ? esc([c.poste, c.entreprise].filter(Boolean).join(' — ')) : 'Client particulier'}</p>
            <div class="profile__badges">${statutBadge(c.statut)}${niveauBadge(c.niveau)}<span class="badge">${esc(c.segment)}</span>${(c.tags || []).map((t) => `<span class="badge badge--tag">${ic('tag')}${esc(t)}</span>`).join('')}</div>
          </div>
        </div>

        ${c.niveau === 'Secret' ? `<div class="secret-banner">${ic('alert')}<p>Fiche classée <strong>Secret</strong> : toutes les coordonnées sont masquées et chaque révélation est inscrite au journal.</p></div>` : ''}

        <section class="sec">
          <div class="sec__head">${ic('user')}<h3>Identité</h3></div>
          <dl class="fields fields--3">
            ${field('Civilité', c.civilite)}${field('Prénom', c.prenom)}${field('Nom', c.nom)}
            ${sfield(c, 'naissance')}${sfield(c, 'lieu')}${field('Nationalité', c.nationalite)}
            ${field('Langue', c.langue)}
          </dl>
        </section>

        <section class="sec">
          <div class="sec__head">${ic('mail')}<h3>Coordonnées</h3>${c.niveau === 'Secret' ? '<span class="chip chip--danger mono">Protégées</span>' : ''}</div>
          <dl class="fields">
            ${sfield(c, 'email')}${sfield(c, 'telephone', { mono: true })}
            ${field('Téléphone fixe', c.telephone2, { mono: true })}${field('Canal préféré', c.canal)}
            ${sfield(c, 'adresse', { span: true })}
          </dl>
        </section>

        ${pro ? `<section class="sec">
          <div class="sec__head">${ic('building')}<h3>Entreprise</h3></div>
          <dl class="fields fields--3">
            ${field('Raison sociale', c.entreprise)}${field('Poste', c.poste)}${field('Secteur', c.secteur)}
            ${field('SIRET', c.siret, { mono: true })}${field('TVA intracommunautaire', c.tva, { mono: true })}${field('Site web', c.site)}
          </dl>
        </section>` : ''}

        <section class="sec">
          <div class="sec__head">${ic('tag')}<h3>Relation commerciale</h3></div>
          <dl class="fields fields--3">
            ${field('Segment', c.segment)}${field('Statut', c.statut)}${field('Valeur annuelle', c.valeur ? eur.format(c.valeur) : '')}
            ${field('Responsable', c.responsable)}${field('Source', c.source)}${field('Dernier contact', ago(lastContact(c)))}
          </dl>
        </section>

        <section class="sec">
          <div class="sec__head">${ic('card')}<h3>Informations financières</h3><span class="chip chip--danger mono">Sensible</span></div>
          <dl class="fields">
            ${sfield(c, 'iban', { mono: true, span: true })}
            ${sfield(c, 'bic', { mono: true })}${field('Mode de paiement', c.modePaiement)}
            ${field('Conditions de paiement', c.conditions)}
          </dl>
        </section>

        <section class="sec">
          <div class="sec__head">${ic('id')}<h3>Pièce d'identité</h3><span class="chip chip--danger mono">Sensible</span></div>
          <dl class="fields fields--3">
            ${field('Type', c.piece && c.piece.type)}${sfield(c, 'piece', { mono: true })}${field('Expiration', fmtISO(c.piece && c.piece.expiration))}
          </dl>
        </section>

        <section class="sec">
          <div class="sec__head">${ic('shield')}<h3>Consentement RGPD</h3></div>
          <dl class="fields">
            ${field('Traitement des données', c.rgpd && c.rgpd.consentement ? `<span class="badge badge--actif"><i></i>Recueilli le ${esc(fmtISO(c.rgpd.date))}</span>` : '<span class="badge badge--secret">Non recueilli</span>', { html: true })}
            ${field('Prospection commerciale', c.rgpd && c.rgpd.marketing ? 'Acceptée' : 'Refusée')}
          </dl>
        </section>

        <section class="sec">
          <div class="sec__head">${ic('note')}<h3>Notes internes</h3></div>
          ${c.notes ? `<p class="notes">${esc(c.notes)}</p>` : '<p class="notes">Aucune note.</p>'}
        </section>

        <section class="sec">
          <div class="sec__head">${ic('clock')}<h3>Historique des échanges</h3><span class="chip mono">${histo.length}</span></div>
          <form class="addnote" id="addnote">
            <select class="select" name="type" aria-label="Type d'échange">${Object.keys(HISTO_ICON).map((t) => `<option>${t}</option>`).join('')}</select>
            <input class="input" name="texte" placeholder="Ajouter un échange…" maxlength="240" autocomplete="off" aria-label="Description de l'échange">
            <button type="submit" class="btn btn--lime btn--sm">${ic('plus')}Ajouter</button>
          </form>
          <ol class="timeline">${histo.map((h) => `
            <li><span class="act">${ic(HISTO_ICON[h.type] || 'note')}</span>
              <div><p>${esc(h.texte)}</p><p>${esc(h.type)} · ${esc(dtFmt.format(new Date(h.date)))} · ${esc(h.auteur || 'E. Arti')}</p></div>
            </li>`).join('')}</ol>
        </section>
      </div>`;
    if (top) $('.drawer__body', panel).scrollTop = top;

    $('#addnote', panel).addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const texte = String(fd.get('texte') || '').trim();
      if (!texte) { e.target.texte.focus(); return; }
      const type = String(fd.get('type'));
      c.historique = c.historique || [];
      c.historique.unshift({ id: 'h' + Date.now(), date: Date.now(), type, texte, auteur: 'E. Arti' });
      c.updatedAt = Date.now();
      log('Interaction', c.id, `${fullName(c)} · ${type}`);
      await save();
      renderDrawer(true);
      refresh();
      toast('Échange ajouté à l\'historique.');
    });
  }

  function reveal(key) {
    const c = findClient(S.openId);
    if (!c) return;
    const def = SENSITIVE[key];
    if (S.reveals.has(key)) {
      clearTimeout(S.reveals.get(key).timer);
      S.reveals.delete(key);
    } else {
      const entry = { until: Date.now() + REVEAL_MS, timer: null };
      if (S.data.settings.autoMask) {
        entry.timer = setTimeout(() => {
          S.reveals.delete(key);
          if (S.openId === c.id && !$('#drawer').hidden) renderDrawer(true);
        }, REVEAL_MS);
      }
      S.reveals.set(key, entry);
      log('Révélation', c.id, `${fullName(c)} · ${def.label}`);
      save();
    }
    renderDrawer(true);
    const btn = $(`[data-reveal="${key}"]`);
    if (btn) btn.focus();
  }

  async function copyValue(key) {
    const c = findClient(S.openId);
    if (!c) return;
    const def = SENSITIVE[key];
    const value = def ? def.get(c) : PLAIN_COPY[key] && PLAIN_COPY[key](c);
    if (!value) return;
    let ok = false;
    try { await navigator.clipboard.writeText(value); ok = true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
    }
    if (!ok) { toast('Copie impossible dans ce navigateur.', 'danger'); return; }
    log('Copie', c.id, `${fullName(c)} · ${def ? def.label : key}`);
    save();
    toast('Copié. L\'action a été inscrite au journal.', 'info', 'copy');
  }

  function closeDrawer(instant) {
    const d = $('#drawer');
    if (d.hidden) return;
    S.reveals.forEach((r) => clearTimeout(r.timer));
    S.reveals.clear();
    S.openId = null;
    const done = () => {
      d.hidden = true;
      d.classList.remove('is-closing');
      $('.drawer__panel').innerHTML = '';
      if (S.returnFocus && document.contains(S.returnFocus)) S.returnFocus.focus();
    };
    if (instant) { done(); return; }
    d.classList.add('is-closing');
    setTimeout(done, 330);
  }

  /* ------------------------------------------------------------------
     Formulaire de fiche
     ------------------------------------------------------------------ */
  const FORM = [
    { t: 'Identité', i: 'user', f: [
      { k: 'civilite', l: 'Civilité', type: 'select', o: ['Mme', 'M.', 'Mx'] },
      { k: 'prenom', l: 'Prénom', req: true },
      { k: 'nom', l: 'Nom', req: true },
      { k: 'dateNaissance', l: 'Date de naissance', type: 'date' },
      { k: 'lieuNaissance', l: 'Lieu de naissance' },
      { k: 'nationalite', l: 'Nationalité' },
    ] },
    { t: 'Coordonnées', i: 'mail', f: [
      { k: 'email', l: 'E-mail', type: 'email', req: true },
      { k: 'telephone', l: 'Téléphone mobile', type: 'tel' },
      { k: 'telephone2', l: 'Téléphone fixe', type: 'tel' },
      { k: 'adresse.ligne', l: 'Adresse', w: 'w2' },
      { k: 'adresse.cp', l: 'Code postal' },
      { k: 'adresse.ville', l: 'Ville' },
      { k: 'adresse.pays', l: 'Pays' },
      { k: 'canal', l: 'Canal préféré', type: 'select', o: ['E-mail', 'Téléphone', 'Rendez-vous', 'Messagerie sécurisée'] },
      { k: 'langue', l: 'Langue' },
    ] },
    { t: 'Entreprise', i: 'building', note: 'Laisser vide pour un particulier', f: [
      { k: 'entreprise', l: 'Raison sociale' },
      { k: 'poste', l: 'Poste' },
      { k: 'secteur', l: 'Secteur' },
      { k: 'siret', l: 'SIRET', ph: '14 chiffres' },
      { k: 'tva', l: 'TVA intracommunautaire' },
      { k: 'site', l: 'Site web' },
    ] },
    { t: 'Relation commerciale', i: 'tag', f: [
      { k: 'segment', l: 'Segment', type: 'select', o: ['Grand compte', 'PME', 'Startup', 'Particulier'] },
      { k: 'statut', l: 'Statut', type: 'select', o: ['Prospect', 'Actif', 'En pause', 'Archivé'] },
      { k: 'niveau', l: 'Niveau de confidentialité', type: 'select', o: ['Standard', 'Restreint', 'Secret'] },
      { k: 'valeur', l: 'Valeur annuelle (€)', type: 'number' },
      { k: 'responsable', l: 'Responsable' },
      { k: 'source', l: 'Source', type: 'select', o: ['Recommandation', 'Salon professionnel', 'Site web', 'Réseau personnel', 'LinkedIn', 'Appel d\'offres'] },
      { k: 'tags', l: 'Étiquettes (séparées par des virgules)', w: 'w3' },
    ] },
    { t: 'Informations financières', i: 'card', note: 'Sensible · masqué par défaut', f: [
      { k: 'iban', l: 'IBAN', w: 'w2', ph: 'FR76 …' },
      { k: 'bic', l: 'BIC' },
      { k: 'modePaiement', l: 'Mode de paiement', type: 'select', o: ['Virement', 'Prélèvement SEPA', 'Carte', 'Chèque'] },
      { k: 'conditions', l: 'Conditions de paiement', type: 'select', o: ['À réception', '30 jours', '30 jours fin de mois', '45 jours', '60 jours'] },
    ] },
    { t: 'Pièce d\'identité', i: 'id', note: 'Sensible · masqué par défaut', f: [
      { k: 'piece.type', l: 'Type de pièce', type: 'select', o: ['Carte d\'identité', 'Passeport', 'Titre de séjour', 'Permis de conduire'] },
      { k: 'piece.numero', l: 'Numéro' },
      { k: 'piece.expiration', l: 'Date d\'expiration', type: 'date' },
    ] },
    { t: 'Consentement & notes', i: 'shield', f: [
      { k: 'rgpd.consentement', l: 'Le client a consenti au traitement de ses données personnelles (obligatoire).', type: 'check', w: 'w3' },
      { k: 'rgpd.marketing', l: 'Le client accepte la prospection commerciale.', type: 'check', w: 'w3' },
      { k: 'notes', l: 'Notes internes', type: 'textarea', w: 'w3' },
    ] },
  ];

  const blankClient = () => ({
    civilite: 'Mme', prenom: '', nom: '', dateNaissance: '', lieuNaissance: '', nationalite: 'Française', langue: 'Français',
    email: '', telephone: '', telephone2: '', adresse: { ligne: '', cp: '', ville: '', pays: 'France' }, canal: 'E-mail',
    entreprise: '', poste: '', secteur: '', siret: '', tva: '', site: '',
    segment: 'PME', statut: 'Prospect', niveau: 'Standard', valeur: 0, responsable: 'E. Arti', source: 'Recommandation', tags: [],
    iban: '', bic: '', modePaiement: 'Virement', conditions: '30 jours',
    piece: { type: 'Carte d\'identité', numero: '', expiration: '' },
    rgpd: { consentement: false, date: '', marketing: false }, notes: '', historique: [],
  });

  function openForm(id) {
    const existing = id ? findClient(id) : null;
    const c = existing ? JSON.parse(JSON.stringify(existing)) : blankClient();
    const fid = (k) => 'f-' + k.replace(/\./g, '-');
    const control = (f) => {
      const v = f.k === 'tags' ? (getPath(c, 'tags') || []).join(', ') : getPath(c, f.k);
      const req = f.req ? ' required aria-required="true"' : '';
      if (f.type === 'check') {
        return `<label class="check ${f.w || ''}"><input type="checkbox" id="${fid(f.k)}" data-k="${f.k}"${v ? ' checked' : ''}><span class="check__box">${ic('check')}</span><span>${esc(f.l)}</span></label>`;
      }
      let input;
      if (f.type === 'select') input = `<select class="select" id="${fid(f.k)}" data-k="${f.k}">${f.o.map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      else if (f.type === 'textarea') input = `<textarea class="textarea" id="${fid(f.k)}" data-k="${f.k}" maxlength="2000">${esc(v)}</textarea>`;
      else input = `<input class="input" id="${fid(f.k)}" data-k="${f.k}" type="${f.type || 'text'}" value="${esc(v == null ? '' : v)}"${f.ph ? ` placeholder="${esc(f.ph)}"` : ''}${f.type === 'number' ? ' min="0" step="500" inputmode="numeric"' : ''} autocomplete="off"${req}>`;
      return `<label class="field ${f.w || ''}" for="${fid(f.k)}"><span>${esc(f.l)}${f.req ? ' <b>*</b>' : ''}</span>${input}<span class="field__err" data-err="${f.k}"></span></label>`;
    };

    openModal(`
      <form id="client-form" novalidate>
        <div class="modal__head">
          <div><h2>${existing ? 'Modifier la fiche' : 'Nouveau client'}</h2><p>${existing ? esc(existing.id + ' · ' + fullName(existing)) : 'La fiche sera chiffrée dès l\'enregistrement.'}</p></div>
          <button type="button" class="iconbtn" data-close-modal aria-label="Fermer">${ic('x')}</button>
        </div>
        <div class="modal__body">
          ${FORM.map((s) => `
            <fieldset class="fset">
              <legend class="fset__title">${ic(s.i)}${esc(s.t)}${s.note ? `<em>${esc(s.note)}</em>` : ''}</legend>
              <div class="fgrid">${s.f.map(control).join('')}</div>
            </fieldset>`).join('')}
        </div>
        <div class="modal__foot">
          <span class="hint">${ic('lock')}Chiffrement AES-256-GCM à l'enregistrement</span>
          <button type="button" class="btn btn--ghost btn--sm" data-close-modal>Annuler</button>
          <button type="submit" class="btn btn--lime btn--sm">${ic('check')}${existing ? 'Enregistrer' : 'Créer la fiche'}</button>
        </div>
      </form>`);

    const form = $('#client-form');
    setTimeout(() => { const first = $('#f-prenom'); if (first) first.focus(); }, 60);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const next = JSON.parse(JSON.stringify(c));
      $$('[data-k]', form).forEach((el) => {
        const k = el.dataset.k;
        let v = el.type === 'checkbox' ? el.checked : el.value.trim();
        if (k === 'tags') v = String(v).split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8);
        if (k === 'valeur') v = Math.max(0, Math.round(Number(v) || 0));
        setPath(next, k, v);
      });
      // Normalisation
      if (next.iban) next.iban = next.iban.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
      if (next.bic) next.bic = next.bic.replace(/\s+/g, '').toUpperCase();
      if (next.siret) next.siret = next.siret.replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4');

      // Validation
      const errors = {};
      if (!next.prenom) errors.prenom = 'Prénom requis.';
      if (!next.nom) errors.nom = 'Nom requis.';
      if (!next.email) errors.email = 'E-mail requis.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(next.email)) errors.email = 'Adresse e-mail invalide.';
      if (next.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(next.iban.replace(/\s/g, ''))) errors.iban = 'Format IBAN invalide.';
      if (next.siret && next.siret.replace(/\D/g, '').length !== 14) errors.siret = 'Le SIRET contient 14 chiffres.';
      if (next.bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(next.bic)) errors.bic = 'BIC invalide (8 ou 11 caractères).';
      if (!next.rgpd.consentement) errors['rgpd.consentement'] = 'Le consentement est obligatoire pour enregistrer une fiche.';
      $$('[data-err]', form).forEach((el) => { el.textContent = errors[el.dataset.err] || ''; });
      $$('[data-k]', form).forEach((el) => {
        if (errors[el.dataset.k]) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
      });
      const consentErr = errors['rgpd.consentement'];
      const consent = $('#f-rgpd-consentement', form).closest('.check');
      let cErrEl = $('.field__err--consent', form);
      if (!cErrEl) { cErrEl = document.createElement('span'); cErrEl.className = 'field__err field__err--consent w3'; consent.after(cErrEl); }
      cErrEl.textContent = consentErr || '';
      const firstErr = Object.keys(errors)[0];
      if (firstErr) {
        const el = $(`[data-k="${firstErr}"]`, form);
        if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); }
        return;
      }

      if (next.segment === 'Particulier') { next.entreprise = next.entreprise || ''; }
      if (!existing || !c.rgpd.consentement) next.rgpd.date = new Date().toISOString().slice(0, 10);

      if (existing) {
        const changed = [];
        FORM.forEach((s) => {
          if (s.f.some((f) => JSON.stringify(getPath(existing, f.k)) !== JSON.stringify(getPath(next, f.k)))) changed.push(s.t);
        });
        Object.assign(existing, next, { updatedAt: Date.now() });
        log('Modification', existing.id, `${fullName(existing)} · ${changed.length ? changed.join(', ') : 'aucun changement'}`);
        await save();
        closeModal();
        if (S.openId === existing.id) renderDrawer(true);
        refresh();
        toast('Fiche mise à jour et re-chiffrée.');
      } else {
        const maxId = S.data.clients.reduce((m, x) => Math.max(m, parseInt(String(x.id).replace(/\D/g, ''), 10) || 0), 0);
        const now = Date.now();
        const created = Object.assign(next, {
          id: 'CL-' + String(maxId + 1).padStart(4, '0'),
          createdAt: now, updatedAt: now,
          hue: Math.floor(Math.random() * 360),
          historique: [{ id: 'h' + now, date: now, type: 'Note', texte: 'Création de la fiche', auteur: 'E. Arti' }],
        });
        S.data.clients.push(created);
        log('Création', created.id, fullName(created));
        await save();
        closeModal();
        refresh();
        toast(`Fiche ${created.id} créée et chiffrée.`);
        openClient(created.id);
      }
    });
  }

  async function deleteClient(id) {
    const c = findClient(id);
    if (!c) return;
    const ok = await confirmDialog({
      title: 'Supprimer cette fiche ?',
      text: `La fiche de <strong>${esc(fullName(c))}</strong> (${esc(c.id)}) sera définitivement supprimée du coffre. La suppression restera visible dans le journal.`,
      confirm: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    S.data.clients = S.data.clients.filter((x) => x.id !== id);
    log('Suppression', id, fullName(c));
    await save();
    closeDrawer();
    refresh();
    toast('Fiche supprimée.', 'danger', 'trash');
  }

  /* ------------------------------------------------------------------
     Fenêtres
     ------------------------------------------------------------------ */
  let modalResolve = null;

  function openModal(html, small) {
    const m = $('#modal');
    if (m.hidden) S.modalReturn = document.activeElement;
    m.classList.toggle('modal--sm', !!small);
    $('.modal__panel', m).innerHTML = html;
    m.hidden = false;
    $('.modal__panel', m).focus();
  }

  function closeModal(instant) {
    const m = $('#modal');
    if (m.hidden) return;
    m.hidden = true;
    $('.modal__panel', m).innerHTML = '';
    if (modalResolve) { modalResolve(false); modalResolve = null; }
    if (!instant && S.modalReturn && document.contains(S.modalReturn)) S.modalReturn.focus();
  }

  function confirmDialog(o) {
    return new Promise((resolve) => {
      if (modalResolve) modalResolve(false);
      openModal(`
        <div class="modal__head"><div><h2>${esc(o.title)}</h2></div><button type="button" class="iconbtn" data-close-modal aria-label="Fermer">${ic('x')}</button></div>
        <div class="modal__body"><p class="confirm-text">${o.text}</p></div>
        <div class="modal__foot">
          <button type="button" class="btn btn--ghost btn--sm" data-close-modal>Annuler</button>
          <button type="button" class="btn ${o.danger ? 'btn--danger' : 'btn--lime'} btn--sm" id="confirm-ok">${esc(o.confirm || 'Confirmer')}</button>
        </div>`, true);
      modalResolve = resolve;
      const ok = $('#confirm-ok');
      ok.focus();
      ok.addEventListener('click', () => {
        modalResolve = null;
        closeModal();
        resolve(true);
      });
    });
  }

  /* ------------------------------------------------------------------
     Journal d'accès
     ------------------------------------------------------------------ */
  const ACTIONS = ['Toutes', 'Connexion', 'Consultation', 'Révélation', 'Copie', 'Modification', 'Création', 'Suppression', 'Interaction', 'Verrouillage', 'Échec de connexion', 'Changement de clé'];

  function renderJournal() {
    const LF = S.logFilter;
    $('#view').innerHTML = `
      <div class="stack">
        <div class="card integrity" id="integrity">
          <span class="integrity__icon">${ic('chain')}</span>
          <div class="integrity__text"><p>Vérification de la chaîne…</p><p>Recalcul des empreintes SHA-256 de chaque entrée.</p></div>
        </div>
        <div class="toolbar">
          <label class="input-wrap">${ic('search')}<span class="sr-only">Rechercher dans le journal</span>
            <input class="input" id="lq" type="search" placeholder="Client, identifiant, session…" value="${esc(LF.q)}" autocomplete="off">
          </label>
          <select class="select" id="la" aria-label="Filtrer par action">${ACTIONS.map((a) => `<option${LF.action === a ? ' selected' : ''}>${a}</option>`).join('')}</select>
          <span class="toolbar__count" id="lcount"></span>
        </div>
        <div class="card card--flush">
          <div class="table-wrap">
            <table class="table table--log">
              <thead><tr><th>Horodatage</th><th>Action</th><th class="c-target">Cible</th><th>Détail</th><th class="c-session">Session</th><th class="c-hash">Empreinte</th></tr></thead>
              <tbody id="ltbody"></tbody>
            </table>
          </div>
          <div id="lempty"></div>
        </div>
      </div>`;
    $('#lq').addEventListener('input', (e) => { LF.q = e.target.value; renderLogRows(); });
    $('#la').addEventListener('change', (e) => { LF.action = e.target.value; renderLogRows(); });
    renderLogRows();
    runIntegrity();
  }

  function renderLogRows() {
    const LF = S.logFilter;
    const q = LF.q.trim().toLowerCase();
    const all = S.data.log;
    const list = all.filter((e) => (LF.action === 'Toutes' || e.action === LF.action)
      && (!q || [e.target, e.detail, e.session, e.user, e.action].some((v) => String(v).toLowerCase().includes(q))));
    const shown = list.slice(-250).reverse();
    $('#ltbody').innerHTML = shown.map((e) => `
      <tr>
        <td class="cell-mono">${esc(dtSec.format(new Date(e.ts)))}</td>
        <td><div class="who">${actIcon(e.action)}<p>${esc(e.action)}</p></div></td>
        <td class="cell-mono c-target">${esc(e.target)}</td>
        <td class="c-detail">${esc(e.detail)}</td>
        <td class="cell-mono c-session">${esc(e.session)}</td>
        <td class="hash c-hash" title="${esc(e.hash)}">${esc(String(e.hash).slice(0, 10))}…</td>
      </tr>`).join('');
    $('#lempty').innerHTML = list.length ? '' : `<div class="empty">${ic('search')}<p>Aucune entrée</p></div>`;
    $('#lcount').textContent = `${list.length} entrée${list.length > 1 ? 's' : ''}${list.length > 250 ? ' · 250 affichées' : ''}`;
  }

  async function runIntegrity() {
    await S.queue;
    if (!S.data) return;
    const res = await verifyChain();
    const box = $('#integrity');
    if (!box || S.view !== 'journal') return;
    box.innerHTML = res.ok
      ? `<span class="integrity__icon">${ic('shield')}</span>
         <div class="integrity__text"><p>Chaîne intègre · ${res.n} entrées vérifiées</p><p>Chaque entrée contient l'empreinte SHA-256 de la précédente : la moindre modification casserait la chaîne. Dernière empreinte <span class="hash">${esc(res.head.slice(0, 16))}…</span></p></div>
         <button type="button" class="btn btn--ghost btn--sm" data-action="verify">${ic('chain')}Revérifier</button>`
      : `<span class="integrity__icon is-bad">${ic('alert')}</span>
         <div class="integrity__text"><p>Altération détectée à l'entrée n°${res.at}</p><p>Le journal a été modifié en dehors de l'application.</p></div>`;
  }

  /* ------------------------------------------------------------------
     Paramètres
     ------------------------------------------------------------------ */
  function renderSettings() {
    const st = S.data.settings;
    const meta = Vault.meta() || {};
    const theme = document.documentElement.dataset.theme;
    $('#view').innerHTML = `
      <div class="grid grid--2">
        <section class="card">
          <div class="card__head"><div><h3 class="card__title">Sécurité de la session</h3><p class="card__sub">Ce qui se passe quand vous n'êtes pas devant l'écran.</p></div></div>
          <div class="setting">
            <div><p>Verrouillage automatique</p><p>Le coffre se referme et la mémoire est effacée après cette durée d'inactivité.</p></div>
            <select class="select" id="s-autolock" aria-label="Délai de verrouillage">${[1, 2, 5, 10, 15, 30].map((m) => `<option value="${m}"${Number(st.autoLock) === m ? ' selected' : ''}>${m} min</option>`).join('')}</select>
          </div>
          <div class="setting">
            <div><p>Voile de confidentialité</p><p>Masque l'écran dès que vous changez d'onglet ou de fenêtre.</p></div>
            <label class="switch"><input type="checkbox" id="s-veil"${st.veil ? ' checked' : ''} aria-label="Voile de confidentialité"><span></span></label>
          </div>
          <div class="setting">
            <div><p>Re-masquage automatique</p><p>Une donnée sensible affichée est masquée à nouveau après 20 secondes.</p></div>
            <label class="switch"><input type="checkbox" id="s-mask"${st.autoMask ? ' checked' : ''} aria-label="Re-masquage automatique"><span></span></label>
          </div>
          <div class="setting">
            <div><p>Apparence</p><p>Le thème est mémorisé sur cet appareil.</p></div>
            <div class="segmented" role="group" aria-label="Thème">
              <button type="button" data-theme-set="dark" aria-pressed="${theme === 'dark'}">${'Sombre'}</button>
              <button type="button" data-theme-set="light" aria-pressed="${theme === 'light'}">${'Clair'}</button>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card__head"><div><h3 class="card__title">Clé d'accès</h3><p class="card__sub">Le coffre entier est rechiffré avec une nouvelle clé dérivée du nouveau code.</p></div></div>
          <form id="rekey" class="stack" autocomplete="off">
            <div class="codefields">
              <label class="field"><span>Code actuel</span><input class="input mono" type="password" inputmode="numeric" maxlength="6" pattern="\\d{6}" name="old" autocomplete="current-password"></label>
              <label class="field"><span>Nouveau code</span><input class="input mono" type="password" inputmode="numeric" maxlength="6" pattern="\\d{6}" name="next" autocomplete="new-password"></label>
              <label class="field"><span>Confirmation</span><input class="input mono" type="password" inputmode="numeric" maxlength="6" pattern="\\d{6}" name="confirm" autocomplete="new-password"></label>
            </div>
            <p class="field__err" id="rekey-err" role="alert"></p>
            <div><button type="submit" class="btn btn--lime btn--sm">${ic('key')}Changer la clé</button></div>
            <p class="card__sub">Aucune récupération n'est possible sans le code : notez-le en lieu sûr.</p>
          </form>
        </section>

        <section class="card">
          <div class="card__head"><div><h3 class="card__title">Le coffre</h3><p class="card__sub">Ce qui est réellement stocké sur cet appareil.</p></div></div>
          <dl class="fields">
            ${field('Chiffrement', 'AES-256-GCM, IV aléatoire à chaque écriture')}
            ${field('Dérivation de clé', `PBKDF2-SHA-256 · ${nf.format(Vault.ITERATIONS)} itérations`)}
            ${field('Taille chiffrée', meta.size ? (meta.size / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Ko' : '—')}
            ${field('Dernier scellement', meta.sealedAt ? dtFmt.format(new Date(meta.sealedAt)) : '—')}
            ${field('Stockage', Vault.isPersistent() ? 'Local, sur cet appareil uniquement' : 'Mémoire seulement (session éphémère)')}
            ${field('Contenu', `${S.data.clients.length} fiches · ${S.data.log.length} entrées de journal`)}
          </dl>
        </section>

        <section class="card danger-zone">
          <div class="card__head"><div><h3 class="card__title">Réinitialiser la démonstration</h3><p class="card__sub">Efface définitivement le coffre de cet appareil et recrée les clients fictifs avec le code 240 617.</p></div></div>
          <button type="button" class="btn btn--danger btn--sm" data-action="reset">${ic('trash')}Effacer et recréer le coffre</button>
        </section>
      </div>`;

    $('#s-autolock').addEventListener('change', (e) => { st.autoLock = Number(e.target.value); activity(); save(); toast(`Verrouillage automatique : ${st.autoLock} min.`); });
    $('#s-veil').addEventListener('change', (e) => { st.veil = e.target.checked; save(); });
    $('#s-mask').addEventListener('change', (e) => { st.autoMask = e.target.checked; save(); });
    $$('[data-theme-set]').forEach((b) => b.addEventListener('click', () => {
      applyTheme(b.dataset.themeSet);
      save();
      $$('[data-theme-set]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    $('#rekey').addEventListener('submit', changeKey);
  }

  async function changeKey(e) {
    e.preventDefault();
    const form = e.target;
    const err = $('#rekey-err');
    const oldC = form.old.value, next = form.next.value, conf = form.confirm.value;
    err.textContent = '';
    if (!/^\d{6}$/.test(next)) { err.textContent = 'Le nouveau code doit contenir exactement 6 chiffres.'; form.next.focus(); return; }
    if (next !== conf) { err.textContent = 'La confirmation ne correspond pas.'; form.confirm.focus(); return; }
    if (next === oldC) { err.textContent = 'Le nouveau code doit être différent de l\'actuel.'; form.next.focus(); return; }
    const btn = $('button[type="submit"]', form);
    btn.disabled = true;
    btn.textContent = 'Vérification…';
    await S.queue;
    const check = await Vault.open(oldC);
    if (!check) {
      btn.disabled = false;
      btn.innerHTML = ic('key') + 'Changer la clé';
      err.textContent = 'Code actuel incorrect.';
      form.old.value = '';
      form.old.focus();
      return;
    }
    btn.textContent = 'Rechiffrement…';
    log('Changement de clé', 'Coffre', 'Nouvelle clé dérivée, coffre rechiffré');
    await enqueue(async () => {
      const k = await Vault.rekey(next, S.data);
      S.key = k.key;
      S.salt = k.salt;
    });
    form.reset();
    btn.disabled = false;
    btn.innerHTML = ic('key') + 'Changer la clé';
    toast('Clé changée. Le coffre a été entièrement rechiffré.', 'ok', 'key');
  }

  /* ------------------------------------------------------------------
     Palette de commandes
     ------------------------------------------------------------------ */
  let paletteItems = [];
  let paletteIndex = 0;

  function openPalette() {
    if (!S.key) return;
    const p = $('#palette');
    S.paletteReturn = document.activeElement;
    p.hidden = false;
    const input = $('#palette-input');
    input.value = '';
    renderPalette('');
    input.focus();
  }

  function closePalette(instant) {
    const p = $('#palette');
    if (p.hidden) return;
    p.hidden = true;
    $('#palette-list').innerHTML = '';
    if (!instant && S.paletteReturn && document.contains(S.paletteReturn)) S.paletteReturn.focus();
  }

  function renderPalette(q) {
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const nq = norm(q.trim());
    const actions = [
      { label: 'Nouveau client', sub: 'Créer une fiche chiffrée', icon: 'plus', run: () => openForm() },
      { label: 'Tableau de bord', sub: 'Aller à', icon: 'grid', run: () => go('dashboard') },
      { label: 'Clients', sub: 'Aller à', icon: 'users', run: () => go('clients') },
      { label: 'Journal d\'accès', sub: 'Aller à', icon: 'activity', run: () => go('journal') },
      { label: 'Paramètres', sub: 'Aller à', icon: 'sliders', run: () => go('settings') },
      { label: 'Changer de thème', sub: 'Sombre / clair', icon: 'sun', run: () => { applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); save(); } },
      { label: 'Verrouiller le coffre', sub: 'Efface les données de la mémoire', icon: 'lock', run: () => lock('Manuel') },
    ].filter((a) => !nq || norm(a.label).includes(nq));
    const clients = S.data.clients.filter((c) => !nq || [fullName(c), c.entreprise, c.id, c.email].some((v) => norm(v).includes(nq))).slice(0, nq ? 8 : 5);

    paletteItems = [];
    let html = '';
    if (clients.length) {
      html += '<li class="palette__group" role="presentation">Clients</li>';
      clients.forEach((c) => {
        paletteItems.push({ run: () => { if (S.view !== 'clients') go('clients'); openClient(c.id); } });
        html += `<li class="palette__item" role="option" id="po-${paletteItems.length - 1}" data-pi="${paletteItems.length - 1}">${avatar(c)}<div class="grow"><p>${esc(fullName(c))}</p><p>${esc(c.entreprise || 'Particulier')} · ${esc(c.id)}</p></div><kbd class="mono">↵</kbd></li>`;
      });
    }
    if (actions.length) {
      html += '<li class="palette__group" role="presentation">Actions</li>';
      actions.forEach((a) => {
        paletteItems.push({ run: a.run });
        html += `<li class="palette__item" role="option" id="po-${paletteItems.length - 1}" data-pi="${paletteItems.length - 1}"><span class="act">${ic(a.icon)}</span><div class="grow"><p>${esc(a.label)}</p><p>${esc(a.sub)}</p></div><kbd class="mono">↵</kbd></li>`;
      });
    }
    if (!paletteItems.length) html = `<li class="palette__none">Aucun résultat pour « ${esc(q)} »</li>`;
    $('#palette-list').innerHTML = html;
    paletteIndex = 0;
    highlightPalette();
  }

  function highlightPalette() {
    $$('.palette__item').forEach((el) => {
      const on = Number(el.dataset.pi) === paletteIndex;
      el.setAttribute('aria-selected', String(on));
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
    $('#palette-input').setAttribute('aria-activedescendant', paletteItems.length ? 'po-' + paletteIndex : '');
  }

  function runPalette(i) {
    const item = paletteItems[i];
    if (!item) return;
    closePalette(true);
    item.run();
  }

  /* ------------------------------------------------------------------
     Événements globaux
     ------------------------------------------------------------------ */
  function bind() {
    // Clavier numérique
    $('#keypad').addEventListener('click', (e) => {
      const b = e.target.closest('[data-key]');
      if (b) press(b.dataset.key);
    });
    $('#demo-fill').addEventListener('click', fillDemo);

    // Délégation : navigation, actions, ouverture de fiches
    document.addEventListener('click', (e) => {
      const t = e.target;
      const nav = t.closest('[data-nav]');
      if (nav && S.data) { closeDrawer(true); go(nav.dataset.nav); return; }
      const open = t.closest('[data-open]');
      if (open && S.data) { openClient(open.dataset.open); return; }
      if (t.closest('[data-close-drawer]')) { closeDrawer(); return; }
      if (t.closest('[data-close-modal]')) { closeModal(); return; }
      if (t.closest('[data-close-palette]')) { closePalette(); return; }
      const rv = t.closest('[data-reveal]');
      if (rv) { reveal(rv.dataset.reveal); return; }
      const cp = t.closest('[data-copy]');
      if (cp) { copyValue(cp.dataset.copy); return; }
      const act = t.closest('[data-act]');
      if (act && S.openId) {
        if (act.dataset.act === 'edit') openForm(S.openId);
        if (act.dataset.act === 'delete') deleteClient(S.openId);
        return;
      }
      const a = t.closest('[data-action]');
      if (!a) return;
      const name = a.dataset.action;
      if (name === 'lock') lock('Manuel');
      else if (name === 'new' && S.data) openForm();
      else if (name === 'palette') openPalette();
      else if (name === 'theme') { applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); if (S.data) save(); }
      else if (name === 'verify') runIntegrity();
      else if (name === 'reset') resetDemo();
    });

    // Lignes du tableau au clavier
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-open]')) {
        e.preventDefault();
        openClient(e.target.dataset.open);
      }
    });

    // Palette
    const pin = $('#palette-input');
    pin.addEventListener('input', () => renderPalette(pin.value));
    pin.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); paletteIndex = Math.min(paletteItems.length - 1, paletteIndex + 1); highlightPalette(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); paletteIndex = Math.max(0, paletteIndex - 1); highlightPalette(); }
      else if (e.key === 'Enter') { e.preventDefault(); runPalette(paletteIndex); }
    });
    $('#palette-list').addEventListener('click', (e) => {
      const it = e.target.closest('[data-pi]');
      if (it) runPalette(Number(it.dataset.pi));
    });
    $('#palette-list').addEventListener('pointermove', (e) => {
      const it = e.target.closest('[data-pi]');
      if (it && Number(it.dataset.pi) !== paletteIndex) { paletteIndex = Number(it.dataset.pi); highlightPalette(); }
    });

    // Raccourcis
    window.addEventListener('keydown', (e) => {
      const screen = document.body.dataset.screen;
      const typing = e.target.matches && e.target.matches('input, textarea, select');

      if (screen === 'lock' && $('#modal').hidden) {
        if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); return; }
        if (e.key === 'Backspace') { e.preventDefault(); press('back'); return; }
        if (e.key === 'Escape') { press('clear'); return; }
      }
      if (screen !== 'app') { if (e.key === 'Escape') closeModal(); return; }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if ($('#palette').hidden) openPalette(); else closePalette();
        return;
      }
      if (e.key === 'Escape') {
        if (!$('#veil').hidden) return;
        if (!$('#palette').hidden) { closePalette(); return; }
        if (!$('#modal').hidden) { closeModal(); return; }
        if (!$('#drawer').hidden) { closeDrawer(); return; }
        return;
      }
      const overlay = !$('#palette').hidden || !$('#modal').hidden;
      if (!typing && !overlay && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openForm();
      }
    });

    // Activité & voile
    ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach((ev) => window.addEventListener(ev, activity, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', () => { if (document.hidden) veil(); });
    window.addEventListener('blur', () => setTimeout(() => { if (!document.hasFocus()) veil(); }, 120));
    $('#veil-resume').addEventListener('click', () => { $('#veil').hidden = true; activity(); });

    // Redimensionnement des graphiques
    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { if (S.view === 'dashboard' && S.data) drawCharts(); }, 140);
    });
  }

  /* ------------------------------------------------------------------
     Démarrage
     ------------------------------------------------------------------ */
  function boot() {
    applyTheme(store.get(LS.theme) || 'dark');
    if (!window.Vault || !Vault.supported() || !window.EnclaveSeed) {
      document.body.innerHTML = '<div class="noscript">Ce navigateur ne permet pas le chiffrement local (Web Crypto). Ouvrez ENCLAVE en HTTPS dans un navigateur récent.</div>';
      return;
    }
    S.session = newSessionId();
    updateWatermark();
    initNotice();
    bind();
    // Premier lancement : création du coffre de démonstration, scellé avec le code démo.
    if (!Vault.exists()) {
      S.seedReady = (async () => {
        const data = await EnclaveSeed.createDemo(Vault.sha256);
        await Vault.create(DEMO_CODE, data);
        if (document.body.dataset.screen === 'lock') refreshVaultMeta();
      })().catch((e) => console.error('[ENCLAVE] création du coffre', e));
    }
    showScreen('notice');
  }

  boot();
})();
