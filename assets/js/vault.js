/* ==========================================================================
   ENCLAVE® — Coffre chiffré
   Le code d'accès n'est jamais enregistré : il sert uniquement à dériver une
   clé AES-256-GCM (PBKDF2-SHA-256). Seul le texte chiffré est stocké.
   ========================================================================== */
(function () {
  'use strict';

  const STORE = 'enclave.vault.v2';
  // Ancien format de démonstration : on le retire pour repartir de données propres.
  try { localStorage.removeItem('enclave.vault.v1'); } catch (e) { /* stockage indisponible */ }
  const ITERATIONS = 310000;
  const te = new TextEncoder();
  const td = new TextDecoder();

  let memoryFallback = null; // si le stockage local est indisponible
  let persistent = true;

  function toB64(buf) {
    const u = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function fromB64(str) {
    const s = atob(str);
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }

  function readRecord() {
    try {
      const raw = localStorage.getItem(STORE);
      return raw ? JSON.parse(raw) : memoryFallback;
    } catch (e) {
      persistent = false;
      return memoryFallback;
    }
  }

  function writeRecord(rec) {
    memoryFallback = rec;
    try {
      localStorage.setItem(STORE, JSON.stringify(rec));
      persistent = true;
    } catch (e) {
      persistent = false;
    }
  }

  async function deriveKey(code, salt) {
    const base = await crypto.subtle.importKey('raw', te.encode(code), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function seal(key, salt, data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(data)));
    writeRecord({
      v: 1,
      kdf: 'PBKDF2-SHA256',
      iter: ITERATIONS,
      cipher: 'AES-256-GCM',
      salt: toB64(salt),
      iv: toB64(iv),
      ct: toB64(ct),
      size: ct.byteLength,
      sealedAt: Date.now(),
    });
  }

  const Vault = {
    ITERATIONS,

    supported() {
      return !!(window.crypto && crypto.subtle && window.TextEncoder);
    },

    exists() {
      return !!readRecord();
    },

    meta() {
      const r = readRecord();
      return r ? { size: r.size, sealedAt: r.sealedAt, iter: r.iter, cipher: r.cipher, persistent } : null;
    },

    /** Crée un nouveau coffre scellé avec ce code. */
    async create(code, data) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey(code, salt);
      await seal(key, salt, data);
      return { key, salt };
    },

    /** Tente d'ouvrir le coffre. Renvoie null si la clé est mauvaise. */
    async open(code) {
      const r = readRecord();
      if (!r) return null;
      const salt = fromB64(r.salt);
      const key = await deriveKey(code, salt);
      try {
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(r.iv) }, key, fromB64(r.ct));
        return { key, salt, data: JSON.parse(td.decode(pt)) };
      } catch (e) {
        return null;
      }
    },

    /** Re-scelle les données (nouvel IV à chaque écriture). */
    async write(key, salt, data) {
      await seal(key, salt, data);
    },

    /** Change le code : nouveau sel, nouvelle clé, nouveau scellement. */
    async rekey(newCode, data) {
      return this.create(newCode, data);
    },

    async sha256(str) {
      const h = await crypto.subtle.digest('SHA-256', te.encode(str));
      return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
    },

    destroy() {
      memoryFallback = null;
      try { localStorage.removeItem(STORE); } catch (e) { /* rien */ }
    },

    isPersistent() {
      return persistent;
    },
  };

  window.Vault = Vault;
})();
