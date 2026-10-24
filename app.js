import { CONFIG } from './config.js?v=2.0';
import {
  computeModel, weekStartOf, nextWeekStart, prevWeekStart, monthKey, blockedUntil,
  DAY, HOUR, VOTE_WINDOW, EDIT_WINDOW,
} from './scoring.js?v=2.0';

/* =====================================================================
   Versie + "Wat is nieuw"
   ===================================================================== */
const APP_VERSION = '2.0';
const CHANGELOG = [
  {
    version: '2.0', date: '2026-10-24', title: 'De grote update 🚀',
    items: [
      '🕵️ <b>Most Wanted</b>: stem bij elke melding wie het was. Na 24 uur de uitspraak: goed gegokt = ½ punt',
      '🦹 Elke vrijdag om 17:00 de <b>Dader van de week</b>',
      '💬 <b>Reacties</b>: emoji\'s en korte comments onder meldingen',
      '🔥 <b>Hot op de pot</b>: de melding met de meeste reacties staat bovenaan',
      '🏆 Stem op de <b>Melding van de maand</b>',
      '✏️ Je eigen melding <b>wijzigen</b> tot 24 uur na plaatsen',
      '🧹 Nieuw om te melden: vieze wc-borstel, niet doorgetrokken, stankbom en prullenbak vol',
      '📍 6e verdieping · Heren staat standaard ingevuld',
      '🔔 <b>Pushmeldingen</b> (zet ze aan in je profiel)',
      '🔊 Geluidjes bij melden en als je de leiding pakt',
      '⏰ De week loopt nu tot <b>vrijdag 17:00</b>',
      '🚩 Valse meldingen worden gemarkeerd. 2× vals in een week = 1 week niet melden',
    ],
  },
  {
    version: '1.0', date: '2026-10-20', title: 'Lancering 🚽',
    items: ['Meldingen met foto', 'Scorebord per categorie', 'De Gouden Borstel', 'Badges'],
  },
];

/* =====================================================================
   Helpers
   ===================================================================== */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CATS = CONFIG.CATEGORIES;
const CAT_BY_ID = Object.fromEntries(CATS.map((c) => [c.id, c]));
const getCat = (id) => CAT_BY_ID[id] || { id, emoji: '❓', label: id, title: 'Spotter', color: '#888', points: 1 };
const LOCS = CONFIG.LOCATIONS || [];
const TYPES = CONFIG.WC_TYPES || [];
const REACTIONS = CONFIG.REACTIONS || ['🤢', '😂', '🫡', '🕵️', '🧽'];
const ts = (iso) => (iso ? new Date(iso).getTime() : 0);

const fmtPts = (n) => {
  const neg = n < 0, a = Math.abs(n), w = Math.floor(a), h = Math.round((a - w) * 10) >= 5;
  const s = h ? (w ? `${w}½` : '½') : String(w);
  return (neg ? '−' : '') + s;
};
const ptsWord = (n) => (n === 1 ? 'punt' : 'punten');

const rtf = new Intl.RelativeTimeFormat('nl', { numeric: 'auto' });
function ago(iso) {
  const s = (ts(iso) - Date.now()) / 1000;
  for (const [u, sec] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(s) >= sec) return rtf.format(Math.round(s / sec), u);
  }
  return 'zojuist';
}
const TZO = { timeZone: 'Europe/Amsterdam' };
const shortMonth = (t) => new Date(t).toLocaleDateString('nl-NL', { ...TZO, month: 'short' }).replace('.', '');
const dayMonth = (t) => `${new Date(t).toLocaleDateString('nl-NL', { ...TZO, day: 'numeric' })} ${shortMonth(t)}`;
const weekdayDate = (t) => `${new Date(t).toLocaleDateString('nl-NL', { ...TZO, weekday: 'long' })} ${dayMonth(t)}`;
const monthName = (key) => { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' }); };
function left(ms) {
  if (ms <= 0) return 'nu';
  const total = Math.ceil(ms / 60000);
  const d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60;
  if (d) return `${d}d ${h}u`;
  if (h) return `${h}u ${m}m`;
  return `${m} min`;
}
const splitLoc = (s) => { const [a, b] = String(s || '').split(' · '); return [a || '', b || '']; };

function hue(str) { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) % 360; return h; }
function initials(name) { return String(name).trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'; }
const avatar = (name, size = '') => `<span class="avatar ${size}" style="--h:${hue(name)}" aria-hidden="true">${esc(initials(name))}</span>`;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 3000);
}
function confetti() {
  const box = document.createElement('div');
  box.className = 'confetti';
  const bits = ['🧻', '✨', '🏆', '🧽', '⭐', '🧼'];
  for (let i = 0; i < 22; i++) {
    const s = document.createElement('span');
    s.textContent = bits[i % bits.length];
    s.style.left = Math.random() * 100 + '%';
    s.style.animationDelay = Math.random() * 0.4 + 's';
    s.style.fontSize = 16 + Math.random() * 18 + 'px';
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2600);
}

function niceError(e) {
  const m = String(e?.message || e || '');
  if (/Invalid login credentials/i.test(m)) return 'E-mail of wachtwoord klopt niet.';
  if (/already registered|already been registered/i.test(m)) return 'Dit e-mailadres heeft al een account. Log in.';
  if (/Password should be at least/i.test(m)) return 'Wachtwoord moet minstens 6 tekens zijn.';
  if (/Email not confirmed/i.test(m)) return 'Bevestig eerst je e-mail (check je inbox).';
  if (/Database error saving new user/i.test(m)) return 'Account aanmaken lukte niet. Gebruik je werk-e-mailadres.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Geen verbinding. Probeer het zo nog eens.';
  if (/rate limit/i.test(m)) return 'Even te vaak geprobeerd. Wacht een minuutje.';
  if (/row-level security/i.test(m)) return 'Dat mag (nu) niet. Ververs de app en probeer opnieuw.';
  if (/minstens 1 admin/i.test(m)) return 'Er moet minstens 1 admin blijven.';
  if (/Alleen voor admins/i.test(m)) return 'Alleen admins kunnen dit.';
  return m || 'Er ging iets mis.';
}

async function compressImage(file, maxSize = 1280, quality = 0.75) {
  let src;
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    src = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('Deze foto kan ik niet openen. Probeer een andere.'));
      img.src = URL.createObjectURL(file);
    });
  }
  const scale = Math.min(1, maxSize / Math.max(src.width, src.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(src.width * scale);
  canvas.height = Math.round(src.height * scale);
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
}
const blobToDataUrl = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
function pickFile() {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*';
    i.onchange = () => res(i.files?.[0] || null);
    i.click();
  });
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* geen opslag */ } },
};

/* =====================================================================
   Geluid (zelf opgewekt, geen bestanden nodig)
   ===================================================================== */
let actx = null;
const soundOn = () => store.get('wc-sound', true);
function audio() {
  if (!soundOn()) return null;
  try {
    if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; actx = new AC(); }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  } catch { return null; }
}
document.addEventListener('pointerdown', () => audio(), { passive: true });
function playFlush() {
  const a = audio(); if (!a) return;
  const t = a.currentTime, dur = 1.7;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
  f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(220, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination); src.start(t); src.stop(t + dur);
  // "bloop" aan het eind
  const o = a.createOscillator(), og = a.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(260, t + 1.25); o.frequency.exponentialRampToValueAtTime(70, t + 1.6);
  og.gain.setValueAtTime(0.0001, t + 1.25); og.gain.exponentialRampToValueAtTime(0.35, t + 1.3); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.65);
  o.connect(og).connect(a.destination); o.start(t + 1.25); o.stop(t + 1.7);
}
function playFanfare() {
  const a = audio(); if (!a) return;
  const t0 = a.currentTime + 0.05;
  [[523.25, 0, 0.14], [659.25, 0.15, 0.14], [783.99, 0.3, 0.14], [1046.5, 0.45, 0.6], [783.99, 0.62, 0.12], [1046.5, 0.76, 0.7]].forEach(([fr, at, len]) => {
    const o = a.createOscillator(), g = a.createGain(), lp = a.createBiquadFilter();
    o.type = 'square'; o.frequency.value = fr; lp.type = 'lowpass'; lp.frequency.value = 2400;
    g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(0.18, t0 + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
    o.connect(lp).connect(g).connect(a.destination); o.start(t0 + at); o.stop(t0 + at + len + 0.05);
  });
}
function playPop() {
  const a = audio(); if (!a) return;
  const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(600, t); o.frequency.exponentialRampToValueAtTime(1100, t + 0.08);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.13);
}

/* =====================================================================
   Backend 1: Supabase (live)
   ===================================================================== */
async function createSupabaseBackend() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const toUser = (s) => (s?.user ? { id: s.user.id, email: s.user.email } : null);
  const ok = ({ error, data }) => { if (error) throw error; return data; };
  async function fetchAll(build) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const data = ok(await build().range(from, from + 999));
      out.push(...data);
      if (data.length < 1000) return out;
    }
  }
  const newPath = (prefix) => `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

  return {
    mode: 'live',
    async getUser() { return toUser(ok(await sb.auth.getSession()).session); },
    onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => cb(toUser(s))); },
    async signUp(name, email, password) {
      const data = ok(await sb.auth.signUp({
        email, password,
        options: { data: { display_name: name }, emailRedirectTo: location.href.split('#')[0] },
      }));
      return { needsConfirm: !data.session };
    },
    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async signOut() { await sb.auth.signOut(); },
    async loadAll() {
      const profiles = await fetchAll(() => sb.from('profiles')
        .select('id, display_name, created_at, is_admin, blocked_until, unblocked_at, seen_version, push_prefs').order('id'));
      const [posts, confirmations, suspects, votes, reactions, comments, adjustments, ann, motm] = await Promise.all([
        fetchAll(() => sb.from('posts').select('*').order('created_at', { ascending: false }).order('id')),
        fetchAll(() => sb.from('confirmations').select('post_id, user_id').order('post_id').order('user_id')),
        fetchAll(() => sb.from('suspects').select('*').order('id')),
        fetchAll(() => sb.from('suspect_votes').select('post_id, user_id, suspect_id, created_at').order('post_id').order('user_id')),
        fetchAll(() => sb.from('reactions').select('post_id, user_id, emoji').order('post_id').order('user_id').order('emoji')),
        fetchAll(() => sb.from('comments').select('*').order('id')),
        fetchAll(() => sb.from('point_adjustments').select('*').order('id')),
        sb.from('announcements').select('*').eq('active', true).order('id', { ascending: false }).limit(1),
        fetchAll(() => sb.from('motm_votes').select('month, user_id, post_id').order('month').order('user_id')),
      ]);
      return { profiles, posts, confirmations, suspects, votes, reactions, comments, adjustments, announcement: ok(ann)[0] || null, motm };
    },
    async createPost({ userId, category, description, location, photo }) {
      let photo_path = null;
      if (photo) {
        photo_path = newPath(userId);
        ok(await sb.storage.from('photos').upload(photo_path, photo, { contentType: 'image/jpeg' }));
      }
      const res = await sb.from('posts').insert({ category, description, location, photo_path });
      if (res.error) {
        if (photo_path) await sb.storage.from('photos').remove([photo_path]);
        throw res.error;
      }
    },
    async updatePost(post, { userId, category, description, location, photo }) {
      let photo_path = post.photo_path;
      if (photo) {
        photo_path = newPath(userId);
        ok(await sb.storage.from('photos').upload(photo_path, photo, { contentType: 'image/jpeg' }));
      }
      const res = await sb.from('posts').update({ category, description, location, photo_path }).eq('id', post.id).select('id');
      if (res.error || !res.data?.length) {
        if (photo) await sb.storage.from('photos').remove([photo_path]);
        throw res.error || new Error('Wijzigen kan alleen tot 24 uur na plaatsen.');
      }
      if (photo && post.photo_path) await sb.storage.from('photos').remove([post.photo_path]);
    },
    async deletePost(post) {
      ok(await sb.from('posts').delete().eq('id', post.id));
      if (post.photo_path) await sb.storage.from('photos').remove([post.photo_path]);
    },
    async setConfirm(postId, userId, on) {
      ok(on
        ? await sb.from('confirmations').insert({ post_id: postId })
        : await sb.from('confirmations').delete().eq('post_id', postId).eq('user_id', userId));
    },
    async vote(postId, userId, suspectId) {
      ok(suspectId
        ? await sb.from('suspect_votes').upsert({ post_id: postId, user_id: userId, suspect_id: suspectId }, { onConflict: 'post_id,user_id' })
        : await sb.from('suspect_votes').delete().eq('post_id', postId).eq('user_id', userId));
    },
    async react(postId, userId, emoji, on) {
      ok(on
        ? await sb.from('reactions').insert({ post_id: postId, emoji })
        : await sb.from('reactions').delete().eq('post_id', postId).eq('user_id', userId).eq('emoji', emoji));
    },
    async addComment(postId, body) { ok(await sb.from('comments').insert({ post_id: postId, body })); },
    async deleteComment(id) { ok(await sb.from('comments').delete().eq('id', id)); },
    async motmVote(month, userId, postId) {
      ok(postId
        ? await sb.from('motm_votes').upsert({ month, user_id: userId, post_id: postId }, { onConflict: 'month,user_id' })
        : await sb.from('motm_votes').delete().eq('month', month).eq('user_id', userId));
    },
    async updateProfile(userId, fields) { ok(await sb.from('profiles').update(fields).eq('id', userId)); },
    photoUrl(post) { return post.photo_path ? sb.storage.from('photos').getPublicUrl(post.photo_path).data.publicUrl : null; },
    suspectUrl(s) {
      if (!s?.image_path) return null;
      if (s.image_path.startsWith('static/')) return './' + s.image_path.slice(7);
      return sb.storage.from('suspects').getPublicUrl(s.image_path).data.publicUrl;
    },
    // --- admin ---
    async listUsers() { return ok(await sb.rpc('admin_list_users')); },
    async setAdmin(uid, v) { ok(await sb.rpc('admin_set_admin', { uid, make_admin: v })); },
    async renameUser(uid, name) { ok(await sb.rpc('admin_rename', { uid, new_name: name })); },
    async setBlock(uid, days) { ok(await sb.rpc('admin_set_block', { uid, days })); },
    async flagPost(id, v) { ok(await sb.rpc('admin_flag_post', { pid: id, is_fake: v })); },
    async hidePost(id, v, reason) { ok(await sb.rpc('admin_hide_post', { pid: id, hide: v, reason: reason || null })); },
    async addSuspect(name, blob) {
      let image_path = null;
      if (blob) { image_path = newPath('admin'); ok(await sb.storage.from('suspects').upload(image_path, blob, { contentType: 'image/jpeg' })); }
      ok(await sb.from('suspects').insert({ name, image_path }));
    },
    async updateSuspect(s, { name, blob, active }) {
      const fields = {};
      if (name !== undefined) fields.name = name;
      if (active !== undefined) fields.active = active;
      if (blob) {
        fields.image_path = newPath('admin');
        ok(await sb.storage.from('suspects').upload(fields.image_path, blob, { contentType: 'image/jpeg' }));
      }
      ok(await sb.from('suspects').update(fields).eq('id', s.id));
      if (blob && s.image_path && !s.image_path.startsWith('static/')) await sb.storage.from('suspects').remove([s.image_path]);
    },
    async addAdjustment(uid, points, reason) { ok(await sb.from('point_adjustments').insert({ user_id: uid, points, reason })); },
    async deleteAdjustment(id) { ok(await sb.from('point_adjustments').delete().eq('id', id)); },
    async setAnnouncement(text) {
      ok(await sb.from('announcements').update({ active: false }).eq('active', true));
      if (text) ok(await sb.from('announcements').insert({ body: text }));
    },
    // --- push ---
    async savePushSub(userId, s) { ok(await sb.from('push_subscriptions').upsert({ ...s, user_id: userId }, { onConflict: 'endpoint' })); },
    async removePushSub(endpoint) { ok(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)); },
  };
}

/* =====================================================================
   Backend 2: Demo (alleen op dit toestel)
   ===================================================================== */
function demoPhoto(emoji, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><pattern id="t" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="#f4f8f9"/><path d="M50 0H0V50" fill="none" stroke="#d5e3e6" stroke-width="3"/></pattern></defs><rect width="400" height="300" fill="url(#t)"/><circle cx="200" cy="150" r="90" fill="${color}" opacity=".18"/><text x="200" y="185" font-size="110" text-anchor="middle">${emoji}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function seedDemo() {
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const profiles = [
    { id: 'd1', display_name: 'Sanne de Vries', created_at: iso(30 * DAY) },
    { id: 'd2', display_name: 'Pieter Bakker', created_at: iso(30 * DAY) },
    { id: 'd3', display_name: 'Fatima El Amrani', created_at: iso(30 * DAY) },
    { id: 'd4', display_name: 'Joost Jansen', created_at: iso(30 * DAY) },
  ];
  const names = ['Ruitjes-Ruud', 'Baardige Bertus', 'Krullen-Kees', 'Meneer de Directeur', 'Gladde Gerrit', 'Denim Dina'];
  const suspects = names.map((name, i) => ({ id: i + 1, name, image_path: `static/suspects/${i + 1}.jpg`, active: true, created_at: iso(30 * DAY) }));
  // [user, cat, desc, hoursAgo, loc, votes:[[user,suspect]]]
  const rows = [
    ['d1', 'remsporen', 'Klassieker. Iemand heeft de borstel niet gevonden.', 2, '6e verdieping · Heren', [['d2', 2], ['d3', 2]]],
    ['d3', 'plas', 'Plasje naast de pot, ik ben er bijna in uitgegleden 🫠', 7, '6e verdieping · Heren', [['d1', 5]]],
    ['d2', 'stank', 'Gasmasker nodig. Niet naar binnen gaan.', 20, '5e verdieping · Heren', []],
    ['d4', 'wasbak', 'Tandpasta + baardharen in de wasbak.', 30, '6e verdieping · Heren', [['d1', 2], ['d2', 2], ['d4', 2], ['d3', 4]]],
    ['d1', 'bril', 'Bril met verdachte druppels.', 52, '6e verdieping · Dames', [['d2', 6], ['d3', 6], ['d4', 1]]],
    ['d4', 'haar', 'Krulletje op de bril. Geen commentaar.', 75, 'Ander gebouw · Heren', [['d1', 3], ['d2', 3]]],
    ['d1', 'doortrekken', 'Niet doorgetrokken. Ik zeg verder niks.', 100, '6e verdieping · Heren', [['d3', 2], ['d4', 2], ['d2', 5]]],
    ['d4', 'remsporen', 'Dit is nep, gewoon chocola', 120, '6e verdieping · Heren', []],
    ['d2', 'remsporen', 'Na de vrijdagmiddagborrel...', 8 * 24, '6e verdieping · Heren', [['d1', 2], ['d3', 2], ['d4', 5]]],
    ['d2', 'plas', 'Mikken blijft lastig blijkbaar.', 9 * 24, '5e verdieping · Heren', [['d1', 2], ['d4', 2]]],
    ['d3', 'prullenbak', 'Prullenbak puilt uit.', 10 * 24, '6e verdieping · Dames', [['d1', 6], ['d2', 6]]],
    ['d2', 'borstel', 'Deze borstel heeft dingen gezien.', 11 * 24, '6e verdieping · Invalide', []],
  ];
  const posts = [], votes = [];
  rows.forEach(([user_id, category, description, h, location, vs], i) => {
    const c = getCat(category);
    const id = 100 + rows.length - i;
    posts.push({
      id, user_id, category, description, location, photo_path: demoPhoto(c.emoji, c.color), created_at: iso(h * HOUR),
      updated_at: null, is_false: false, flagged_at: null, hidden: false, hidden_reason: null,
    });
    for (const [u, s] of vs) votes.push({ post_id: id, user_id: u, suspect_id: s });
  });
  const fake = posts.find((p) => p.description.startsWith('Dit is nep'));
  fake.is_false = true; fake.flagged_at = iso(110 * HOUR);
  const pid = (i) => posts[i].id;
  return {
    profiles, suspects, posts, votes,
    confirmations: [{ post_id: pid(0), user_id: 'd2' }, { post_id: pid(0), user_id: 'd3' }, { post_id: pid(1), user_id: 'd1' }],
    reactions: [
      ...['d2', 'd3', 'd4'].map((u) => ({ post_id: pid(0), user_id: u, emoji: '🤢' })),
      { post_id: pid(0), user_id: 'd4', emoji: '😂' }, { post_id: pid(2), user_id: 'd1', emoji: '😂' }, { post_id: pid(1), user_id: 'd2', emoji: '🫡' },
    ],
    comments: [
      { id: 1, post_id: pid(0), user_id: 'd2', body: 'Dit is een misdaad tegen de mensheid', created_at: iso(1.5 * HOUR) },
      { id: 2, post_id: pid(0), user_id: 'd3', body: 'Ik weet genoeg 🕵️', created_at: iso(1 * HOUR) },
    ],
    adjustments: [{ id: 1, user_id: 'd3', points: 2, reason: 'Wc ontstopt 🦸', created_at: iso(26 * HOUR) }],
    announcement: { id: 1, body: 'Deze week extra opletten op de 6e 👀', active: true, created_at: iso(3 * HOUR) },
    motm: [{ month: monthKey(now), user_id: 'd2', post_id: pid(0) }, { month: monthKey(now), user_id: 'd4', post_id: pid(0) }, { month: monthKey(now), user_id: 'd1', post_id: pid(2) }],
    session: null, nextId: 1000,
  };
}

function createDemoBackend() {
  const KEY = 'howwasthewc-demo-v2';
  let db = store.get(KEY, null);
  if (!db) db = seedDemo();
  const save = () => store.set(KEY, db);
  let authCb = () => {};
  const userFromEmail = (email) => 'me-' + hue(email.toLowerCase()) + '-' + email.length;
  const nextId = () => db.nextId++;
  const findPost = (id) => db.posts.find((p) => p.id === id);
  const ensureProfile = (id, name, email) => {
    let p = db.profiles.find((x) => x.id === id);
    if (!p) { p = { id, display_name: name, created_at: new Date().toISOString(), email }; db.profiles.push(p); }
    p.is_admin = true; // in de demo ben je admin
    return p;
  };

  return {
    mode: 'demo',
    async getUser() { return db.session; },
    onAuth(cb) { authCb = cb; },
    async signUp(name, email, password) {
      if (password.length < 6) throw new Error('Password should be at least 6 characters');
      const id = userFromEmail(email);
      ensureProfile(id, name, email).display_name = name;
      db.session = { id, email };
      save(); authCb(db.session);
      return { needsConfirm: false };
    },
    async signIn(email) {
      const id = userFromEmail(email);
      ensureProfile(id, email.split('@')[0], email);
      db.session = { id, email };
      save(); authCb(db.session);
    },
    async signOut() { db.session = null; save(); authCb(null); },
    async loadAll() {
      const { session, nextId: _n, ...rest } = db;
      const data = structuredClone(rest);
      const me = db.session?.id;
      if (!db.profiles.find((p) => p.id === me)?.is_admin) data.posts = data.posts.filter((p) => !p.hidden || p.user_id === me);
      if (!data.announcement?.active) data.announcement = null;
      return data;
    },
    async createPost({ userId, category, description, location, photo }) {
      if (blockedUntil(userId, db)) throw new Error('new row violates row-level security policy');
      const photo_path = photo ? await blobToDataUrl(await compressImage(photo, 700, 0.6)) : null;
      db.posts.unshift({ id: nextId(), user_id: userId, category, description, location, photo_path, created_at: new Date().toISOString(), updated_at: null, is_false: false, flagged_at: null, hidden: false, hidden_reason: null });
      save();
    },
    async updatePost(post, { category, description, location, photo }) {
      const p = findPost(post.id); if (!p) return;
      Object.assign(p, { category, description, location, updated_at: new Date().toISOString() });
      if (photo) p.photo_path = await blobToDataUrl(await compressImage(photo, 700, 0.6));
      save();
    },
    async deletePost(post) {
      db.posts = db.posts.filter((p) => p.id !== post.id);
      for (const k of ['confirmations', 'votes', 'reactions', 'comments', 'motm']) db[k] = db[k].filter((x) => x.post_id !== post.id);
      save();
    },
    async setConfirm(postId, userId, on) {
      db.confirmations = db.confirmations.filter((c) => !(c.post_id === postId && c.user_id === userId));
      if (on) db.confirmations.push({ post_id: postId, user_id: userId });
      save();
    },
    async vote(postId, userId, suspectId) {
      db.votes = db.votes.filter((v) => !(v.post_id === postId && v.user_id === userId));
      if (suspectId) db.votes.push({ post_id: postId, user_id: userId, suspect_id: suspectId });
      save();
    },
    async react(postId, userId, emoji, on) {
      db.reactions = db.reactions.filter((r) => !(r.post_id === postId && r.user_id === userId && r.emoji === emoji));
      if (on) db.reactions.push({ post_id: postId, user_id: userId, emoji });
      save();
    },
    async addComment(postId, body) {
      db.comments.push({ id: nextId(), post_id: postId, user_id: db.session.id, body, created_at: new Date().toISOString() });
      save();
    },
    async deleteComment(id) { db.comments = db.comments.filter((c) => c.id !== id); save(); },
    async motmVote(month, userId, postId) {
      db.motm = db.motm.filter((v) => !(v.month === month && v.user_id === userId));
      if (postId) db.motm.push({ month, user_id: userId, post_id: postId });
      save();
    },
    async updateProfile(userId, fields) { Object.assign(db.profiles.find((p) => p.id === userId) || {}, fields); save(); },
    photoUrl(post) { return post.photo_path; },
    suspectUrl(s) {
      if (!s?.image_path) return null;
      return s.image_path.startsWith('static/') ? './' + s.image_path.slice(7) : s.image_path;
    },
    async listUsers() {
      return db.profiles.map((p) => ({
        id: p.id, display_name: p.display_name, email: p.email || p.display_name.split(' ')[0].toLowerCase() + '@demo.nl',
        created_at: p.created_at, last_sign_in_at: null, is_admin: !!p.is_admin,
        blocked_until: blockedUntil(p.id, db) ? new Date(blockedUntil(p.id, db)).toISOString() : null,
      })).sort((a, b) => a.display_name.localeCompare(b.display_name));
    },
    async setAdmin(uid, v) {
      if (!v && db.profiles.filter((p) => p.is_admin).length <= 1) throw new Error('Er moet minstens 1 admin blijven');
      db.profiles.find((p) => p.id === uid).is_admin = v; save();
    },
    async renameUser(uid, name) { db.profiles.find((p) => p.id === uid).display_name = name; save(); },
    async setBlock(uid, days) {
      const p = db.profiles.find((x) => x.id === uid);
      if (days == null) { p.blocked_until = null; p.unblocked_at = new Date().toISOString(); }
      else p.blocked_until = new Date(Date.now() + days * DAY).toISOString();
      save();
    },
    async flagPost(id, v) { const p = findPost(id); p.is_false = v; p.flagged_at = v ? new Date().toISOString() : null; save(); },
    async hidePost(id, v, reason) { const p = findPost(id); p.hidden = v; p.hidden_reason = v ? reason || null : null; save(); },
    async addSuspect(name, blob) {
      db.suspects.push({ id: nextId(), name, image_path: blob ? await blobToDataUrl(blob) : null, active: true, created_at: new Date().toISOString() });
      save();
    },
    async updateSuspect(s, { name, blob, active }) {
      const x = db.suspects.find((y) => y.id === s.id);
      if (name !== undefined) x.name = name;
      if (active !== undefined) x.active = active;
      if (blob) x.image_path = await blobToDataUrl(blob);
      save();
    },
    async addAdjustment(uid, points, reason) { db.adjustments.push({ id: nextId(), user_id: uid, points, reason, created_at: new Date().toISOString() }); save(); },
    async deleteAdjustment(id) { db.adjustments = db.adjustments.filter((a) => a.id !== id); save(); },
    async setAnnouncement(text) { db.announcement = text ? { id: nextId(), body: text, active: true, created_at: new Date().toISOString() } : null; save(); },
    async savePushSub() { throw new Error('Pushmeldingen werken alleen in de live app.'); },
    async removePushSub() {},
    reset() { try { localStorage.removeItem(KEY); } catch { /* */ } location.reload(); },
  };
}

/* =====================================================================
   State + afgeleide gegevens
   ===================================================================== */
const EMPTY = { profiles: [], posts: [], confirmations: [], suspects: [], votes: [], reactions: [], comments: [], adjustments: [], announcement: null, motm: [] };
const ROUTES = ['feed', 'scores', 'wanted', 'me', 'admin'];
const routeFromHash = () => { const h = location.hash.slice(1); return ROUTES.includes(h) ? h : 'feed'; };
const state = {
  backend: null,
  user: null,
  data: EMPTY,
  loaded: false,
  loadError: null,
  view: routeFromHash(),
  filter: 'all',
  feedLimit: 25,
  period: 'week',
  boardCat: 'all',
  authTab: 'login',
  sheet: null,          // { kind, ... }
  openComments: new Set(),
  adminTab: 'users',
  adminUsers: null,
  installEvt: null,
  push: { supported: false, on: false, busy: false },
};

let _derived = null;
function derive() {
  if (_derived && _derived.data === state.data && _derived.minute === Math.floor(Date.now() / 60000)) return _derived.d;
  const data = state.data;
  const names = new Map(data.profiles.map((p) => [p.id, p.display_name]));
  const nameOf = (id) => names.get(id) || 'Onbekende spotter';
  const me = data.profiles.find((p) => p.id === state.user?.id) || {};
  const m = computeModel(data, CONFIG);

  const confByPost = new Map(), confGiven = new Map();
  for (const c of data.confirmations) {
    if (!confByPost.has(c.post_id)) confByPost.set(c.post_id, new Set());
    confByPost.get(c.post_id).add(c.user_id);
    confGiven.set(c.user_id, (confGiven.get(c.user_id) || 0) + 1);
  }
  const rxByPost = new Map();
  for (const r of data.reactions) {
    if (!rxByPost.has(r.post_id)) rxByPost.set(r.post_id, new Map());
    const mm = rxByPost.get(r.post_id);
    if (!mm.has(r.emoji)) mm.set(r.emoji, new Set());
    mm.get(r.emoji).add(r.user_id);
  }
  const commentsByPost = new Map();
  for (const c of data.comments) {
    if (!commentsByPost.has(c.post_id)) commentsByPost.set(c.post_id, []);
    commentsByPost.get(c.post_id).push(c);
  }
  const suspectById = new Map(data.suspects.map((s) => [s.id, s]));
  const activeSuspects = data.suspects.filter((s) => s.active !== false);
  const myMotm = data.motm.find((v) => v.month === m.curMonth && v.user_id === state.user?.id)?.post_id;

  // Hot op de pot: meeste reacties + comments deze week (minstens 3)
  let hot = null, hotScore = 2;
  for (const p of data.posts) {
    if (p.is_false || p.hidden || ts(p.created_at) < m.curWs) continue;
    let n = (commentsByPost.get(p.id) || []).length;
    for (const s of (rxByPost.get(p.id) || new Map()).values()) n += s.size;
    if (n > hotScore) { hot = p.id; hotScore = n; }
  }

  const d = {
    ...m, me, isAdmin: !!me.is_admin, nameOf, confByPost, confGiven, rxByPost, commentsByPost,
    suspectById, activeSuspects, myMotm, hot,
    myBlock: state.user ? blockedUntil(state.user.id, data) : 0,
  };
  _derived = { data, minute: Math.floor(Date.now() / 60000), d };
  return d;
}
const invalidate = () => { _derived = null; };

function badgesFor(userId, d) {
  const mine = state.data.posts.filter((p) => p.user_id === userId && !p.is_false && !p.hidden);
  const cats = new Set(mine.map((p) => p.category));
  const hours = mine.map((p) => new Date(p.created_at).getHours());
  const w = d.wins.get(userId) || 0;
  let correct = 0;
  for (const vd of d.verdicts.values()) if (vd.correct.has(userId)) correct++;
  const comments = state.data.comments.filter((c) => c.user_id === userId).length;
  return [
    { emoji: '🐣', name: 'Eerste spot', hint: 'Plaats je eerste melding', got: mine.length >= 1 },
    { emoji: '🔟', name: 'Vaste klant', hint: '10 meldingen', got: mine.length >= 10 },
    { emoji: '🦸', name: 'WC-legende', hint: '50 meldingen', got: mine.length >= 50 },
    { emoji: '🌈', name: 'Alleskunner', hint: 'Elke categorie minstens 1×', got: CATS.every((c) => cats.has(c.id)) },
    { emoji: '🏆', name: w > 1 ? `Gouden Borstel ×${w}` : 'Gouden Borstel', hint: 'Win een week', got: w > 0 },
    { emoji: '🕵️', name: 'Speurneus', hint: '5× de dader goed geraden', got: correct >= 5 },
    { emoji: '👀', name: 'Getuige', hint: '10× "Ik zag het ook"', got: (d.confGiven.get(userId) || 0) >= 10 },
    { emoji: '💬', name: 'Commentator', hint: '25 comments', got: comments >= 25 },
    { emoji: '🌅', name: 'Vroege vogel', hint: 'Melding vóór 8:00', got: hours.some((h) => h < 8) },
    { emoji: '🌙', name: 'Overwerker', hint: 'Melding na 18:00', got: hours.some((h) => h >= 18) },
  ];
}

/* =====================================================================
   Views
   ===================================================================== */
const LOGO = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><rect x="16" y="6" width="32" height="16" rx="4" fill="currentColor" opacity=".9"/><path d="M8 26h48v4c0 11-9 20-20 20h-8C17 50 8 41 8 30z" fill="currentColor"/><path d="M22 50h20l-3 8H25z" fill="currentColor" opacity=".9"/><ellipse cx="32" cy="27" rx="18" ry="3.2" fill="var(--paper)" opacity=".55"/></svg>`;

function suspectImg(s, cls = '') {
  const url = state.backend.suspectUrl(s);
  return url
    ? `<img class="sus-img ${cls}" src="${esc(url)}" alt="${esc(s.name)}" loading="lazy">`
    : `<span class="sus-img sus-none ${cls}" aria-hidden="true">🕵️</span>`;
}

function viewAuth() {
  const demo = state.backend.mode === 'demo';
  const signup = state.authTab === 'signup';
  return `
  <main class="auth">
    <div class="auth-hero">
      <div class="logo-badge">${LOGO}</div>
      <h1>How was the WC?</h1>
      <p>Zie je iets smerigs op de wc? Maak een foto, meld het en scoor punten. Wie wordt deze week de <b>Gouden Borstel</b>? 🏆</p>
    </div>
    ${demo ? `<div class="notice">🧪 <b>Demomodus.</b> Alles blijft op dit toestel. Elk e-mailadres werkt.</div>` : ''}
    <div class="seg" role="tablist">
      <button role="tab" aria-selected="${!signup}" class="${!signup ? 'on' : ''}" data-action="authtab" data-id="login">Inloggen</button>
      <button role="tab" aria-selected="${signup}" class="${signup ? 'on' : ''}" data-action="authtab" data-id="signup">Account maken</button>
    </div>
    <form id="auth-form" class="card form" novalidate>
      ${signup ? `<label>Je naam <input name="name" required maxlength="40" autocomplete="name" placeholder="Zoals collega's je kennen"></label>` : ''}
      <label>E-mail <input name="email" type="email" required autocomplete="email" inputmode="email" placeholder="naam@bedrijf.nl"></label>
      <label>Wachtwoord <input name="password" type="password" required minlength="6" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="Minstens 6 tekens"></label>
      <p class="form-error" id="auth-error" role="alert"></p>
      <button class="btn primary big" type="submit">${signup ? 'Doe mee 🚽' : 'Inloggen'}</button>
    </form>
  </main>`;
}

function announcementBar() {
  const a = state.data.announcement;
  if (!a || store.get('wc-ann-hidden', 0) === a.id) return '';
  return `<div class="announce"><span>📢 ${esc(a.body)}</span><button class="icon-btn small" data-action="hide-ann" data-id="${a.id}" aria-label="Verbergen">✕</button></div>`;
}

function viewFeed(d) {
  const all = [{ id: 'all', emoji: '🧻', label: 'Alles' }, ...CATS];
  const chips = all.map((c) => `<button class="chip ${state.filter === c.id ? 'on' : ''}" data-action="filter" data-id="${esc(c.id)}">${c.emoji} ${esc(c.label)}</button>`).join('');
  let list = state.data.posts.filter((p) => state.filter === 'all' || p.category === state.filter);
  const hotPost = state.filter === 'all' && d.hot ? list.find((p) => p.id === d.hot) : null;
  if (hotPost) list = list.filter((p) => p !== hotPost);
  const shown = list.slice(0, state.feedLimit);
  const weekPosts = state.data.posts.filter((p) => !p.is_false && !p.hidden && ts(p.created_at) >= d.curWs).length;
  return `
    ${announcementBar()}
    <section class="stat-strip">
      <div><b>${weekPosts}</b><span>meldingen deze week</span></div>
      <div><b class="small-b">${left(d.curWe - Date.now())}</b><span>tot de uitslag (vr 17:00)</span></div>
    </section>
    <div class="chips">${chips}</div>
    ${hotPost ? postCard(hotPost, d, true) : ''}
    ${shown.length || hotPost ? shown.map((p) => postCard(p, d)).join('') : `
      <div class="empty"><div class="empty-emoji">✨</div><p>Nog niks gemeld${state.filter !== 'all' ? ' in deze categorie' : ''}.<br>Brandschoon… of heeft nog niemand goed gekeken?</p></div>`}
    ${list.length > shown.length ? `<button class="btn ghost wide" data-action="more">Meer laden</button>` : ''}`;
}

function suspectBlock(p, d) {
  if (p.is_false || p.hidden || !state.data.suspects.length) return '';
  const vd = d.verdicts.get(p.id);
  const me = state.user.id;
  const myVote = vd.votes.find((v) => v.user_id === me)?.suspect_id;
  if (!vd.closed) {
    const list = d.activeSuspects;
    if (!list.length) return '';
    return `
    <div class="sus-vote">
      <div class="sus-head"><b>🕵️ Wie was het?</b><span>uitspraak over ${left(vd.closesAt - Date.now())}${vd.total ? ` · ${vd.total} ${vd.total === 1 ? 'stem' : 'stemmen'}` : ''}</span></div>
      <div class="sus-row">
        ${list.map((s) => `
          <button class="sus-pick ${myVote === s.id ? 'on' : ''}" data-action="vote" data-post="${p.id}" data-id="${s.id}" aria-pressed="${myVote === s.id}" title="${esc(s.name)}">
            ${suspectImg(s)}
            ${myVote && vd.counts.get(s.id) ? `<span class="sus-n">${vd.counts.get(s.id)}</span>` : ''}
            <small>${esc(s.name.split(/[\s-]/)[0])}</small>
          </button>`).join('')}
      </div>
    </div>`;
  }
  if (!vd.total) return '';
  if (!vd.winners.length) {
    return `<div class="sus-verdict muted-v">⚖️ Te weinig stemmen voor een uitspraak (${vd.total}/${CONFIG.SUSPECT_MIN_VOTES ?? 2})</div>`;
  }
  const ws = vd.winners.map((id) => d.suspectById.get(id)).filter(Boolean);
  return `
    <div class="sus-verdict">
      <div class="sv-imgs">${ws.map((s) => suspectImg(s)).join('')}</div>
      <div><small>⚖️ Uitspraak</small><b>${ws.map((s) => esc(s.name)).join(' & ')}</b><span>${vd.counts.get(vd.winners[0])} van ${vd.total} stemmen</span></div>
      ${vd.correct.has(me) ? `<span class="pts">+½ voor jou</span>` : myVote ? `<span class="wrong">mis 🙈</span>` : ''}
    </div>`;
}

function commentsBlock(p, d) {
  const list = d.commentsByPost.get(p.id) || [];
  const open = state.openComments.has(p.id);
  if (!open) {
    if (!list.length) return '';
    const last = list.slice(-2);
    return `<div class="comments">${last.map((c) => commentRow(c, d)).join('')}
      ${list.length > 2 ? `<button class="link" data-action="comments" data-id="${p.id}">Bekijk alle ${list.length} comments</button>` : ''}</div>`;
  }
  return `
  <div class="comments open">
    ${list.map((c) => commentRow(c, d)).join('')}
    <form class="comment-form" data-post="${p.id}">
      <input id="c-in-${p.id}" name="body" maxlength="200" placeholder="Schrijf een comment…" autocomplete="off" enterkeyhint="send">
      <button class="btn primary small" type="submit">Plaats</button>
    </form>
  </div>`;
}
function commentRow(c, d) {
  const name = d.nameOf(c.user_id);
  const canDel = c.user_id === state.user.id || d.isAdmin;
  return `<div class="comment">${avatar(name, 'xs')}<p><b>${esc(name)}</b> ${esc(c.body)} <span class="c-ago">${esc(ago(c.created_at))}</span></p>
    ${canDel ? `<button class="c-del" data-action="del-comment" data-id="${c.id}" aria-label="Comment verwijderen">✕</button>` : ''}</div>`;
}

function postCard(p, d, isHot = false) {
  const c = getCat(p.category);
  const url = state.backend.photoUrl(p);
  const conf = d.confByPost.get(p.id) || new Set();
  const me = state.user.id;
  const mine = p.user_id === me;
  const iConf = conf.has(me);
  const name = d.nameOf(p.user_id);
  const rx = d.rxByPost.get(p.id) || new Map();
  const nComments = (d.commentsByPost.get(p.id) || []).length;
  const canMenu = mine || d.isAdmin;
  const motmOk = !mine && !p.is_false && !p.hidden && monthKey(ts(p.created_at)) === d.curMonth;
  const iMotm = d.myMotm === p.id;
  const [loc, type] = splitLoc(p.location);
  return `
  <article class="card post ${p.is_false ? 'is-false' : ''} ${p.hidden ? 'is-hidden' : ''} ${isHot ? 'hot' : ''}" style="--c:${esc(c.color)}" id="post-${p.id}">
    ${isHot ? `<div class="hot-ribbon">🔥 Hot op de pot</div>` : ''}
    ${p.hidden ? `<div class="hidden-note">🙈 Verborgen door admin${p.hidden_reason ? `: ${esc(p.hidden_reason)}` : ''}. Alleen jij${mine ? '' : ' (admin)'} ziet dit.</div>` : ''}
    <header class="post-head">
      <span class="cat-badge">${c.emoji} ${esc(c.label)}</span>
      ${p.is_false ? `<span class="false-tag">🚩 Vals · 0 pt</span>` : `<span class="pts">+${fmtPts(c.points ?? 1)}</span>`}
    </header>
    ${url ? `<button class="photo" data-action="zoom" data-src="${esc(url)}" aria-label="Foto groot bekijken"><img src="${esc(url)}" loading="lazy" alt="Foto bij melding: ${esc(c.label)}">${p.is_false ? '<span class="stamp">VALS</span>' : ''}</button>` : ''}
    ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
    <div class="meta">${avatar(name, 'sm')}<b>${esc(name)}</b><span>· ${esc(ago(p.created_at))}</span>${loc ? `<span>· 📍 ${esc(loc)}${type ? ' · ' + esc(type) : ''}</span>` : ''}${p.updated_at ? '<span>· (bewerkt)</span>' : ''}</div>
    <div class="rx-row">
      ${REACTIONS.map((e) => { const s = rx.get(e); const on = s?.has(me); return `<button class="rx ${on ? 'on' : ''}" data-action="react" data-post="${p.id}" data-id="${esc(e)}" aria-pressed="${!!on}">${e}${s?.size ? `<span>${s.size}</span>` : ''}</button>`; }).join('')}
      <button class="rx" data-action="comments" data-id="${p.id}" aria-label="Comments">💬${nComments ? `<span>${nComments}</span>` : ''}</button>
    </div>
    ${commentsBlock(p, d)}
    ${suspectBlock(p, d)}
    <div class="actions">
      <button class="btn ghost small ${iConf ? 'on' : ''}" data-action="confirm" data-id="${p.id}" ${mine || p.is_false ? 'disabled' : ''} aria-pressed="${iConf}">👀 Ik zag het ook${conf.size ? ` · ${conf.size}` : ''}</button>
      ${motmOk ? `<button class="btn ghost small ${iMotm ? 'on gold-on' : ''}" data-action="motm" data-id="${p.id}" aria-pressed="${iMotm}">🏆 ${iMotm ? 'Jouw maandstem' : 'Maandstem'}</button>` : ''}
      ${canMenu ? `<button class="btn ghost small more" data-action="post-menu" data-id="${p.id}" aria-label="Meer opties">⋯</button>` : ''}
    </div>
  </article>`;
}

function viewScores(d) {
  const weekRank = d.scores('week');
  const leaders = weekRank.filter((r) => r.rank === 1);
  const last = d.history.find((h) => h.week === prevWeekStart(d.curWs));

  const gold = `
  <section class="card gold">
    <div class="gold-top">
      <div class="trophy" aria-hidden="true">🏆</div>
      <div>
        <h2>De Gouden Borstel</h2>
        <p class="muted">Weekprijs · uitslag vrijdag 17:00 · nog ${left(d.curWe - Date.now())}</p>
      </div>
    </div>
    ${leaders.length
      ? `<div class="gold-leader">${leaders.map((l) => `${avatar(d.nameOf(l.userId))}<span><b>${esc(d.nameOf(l.userId))}</b><small>${fmtPts(l.points)} ${ptsWord(l.points)} deze week</small></span>`).join('')}</div>`
      : `<p class="gold-empty">Nog niemand gescoord deze week. Jouw kans! 🧻</p>`}
    ${last && last.winners.length ? `<p class="gold-last">Vorige week: <b>${last.winners.map((u) => esc(d.nameOf(u))).join(' & ')}</b> (${fmtPts(last.points)} pt)</p>` : ''}
  </section>`;

  const ranked = d.scores(state.period, state.boardCat);
  const cat = state.boardCat === 'all' ? null : getCat(state.boardCat);
  const title = cat ? cat.title : 'WC-Kampioen';
  const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `<span class="rank-n">${r}</span>`);
  const chips = [{ id: 'all', emoji: '⭐', label: 'Totaal' }, ...CATS].map((c) => `<button class="chip ${state.boardCat === c.id ? 'on' : ''}" data-action="boardcat" data-id="${esc(c.id)}">${c.emoji} ${esc(c.label)}</button>`).join('');

  const board = `
  <section class="board">
    <div class="board-head">
      <h2>${cat ? cat.emoji + ' ' : ''}Scorebord</h2>
      <div class="seg small" role="tablist">
        <button class="${state.period === 'week' ? 'on' : ''}" data-action="period" data-id="week">Deze week</button>
        <button class="${state.period === 'all' ? 'on' : ''}" data-action="period" data-id="all">Altijd</button>
      </div>
    </div>
    <div class="chips">${chips}</div>
    <div class="card list">
      ${ranked.length ? ranked.map((r) => `
        <div class="row ${r.userId === state.user.id ? 'me' : ''}">
          <span class="medal">${medal(r.rank)}</span>
          ${avatar(d.nameOf(r.userId), 'sm')}
          <span class="row-name"><b>${esc(d.nameOf(r.userId))}</b>${r.rank === 1 ? `<small>👑 ${esc(title)}</small>` : `<small>${r.count} ${r.count === 1 ? 'melding' : 'meldingen'}</small>`}</span>
          <span class="row-pts">${fmtPts(r.points)}</span>
        </div>`).join('') : `<p class="list-empty">Nog geen punten${state.period === 'week' ? ' deze week' : ''}${cat ? ' in ' + esc(cat.label) : ''}.</p>`}
    </div>
    ${!cat ? `<p class="hint center">Melding = punt · goed gegokte dader = ½ punt · plus bonus/straf van de admin</p>` : ''}
  </section>`;

  // Melding van de maand
  const cur = d.motmLeader(d.curMonth);
  const curPost = cur && state.data.posts.find((p) => p.id === cur.postId);
  const prev = d.motmHistory[0];
  const prevPost = prev && state.data.posts.find((p) => p.id === prev.postId);
  const motmCard = (p, label, votes) => {
    const c = getCat(p.category), url = state.backend.photoUrl(p);
    return `<button class="motm-item" data-action="goto-post" data-id="${p.id}">
      ${url ? `<img src="${esc(url)}" alt="">` : `<span class="motm-emoji">${c.emoji}</span>`}
      <span><small>${esc(label)}</small><b>${c.emoji} ${esc(p.description || c.label)}</b><span>${esc(d.nameOf(p.user_id))} · ${votes} ${votes === 1 ? 'stem' : 'stemmen'}</span></span>
    </button>`;
  };
  const motm = `
  <section class="board">
    <h2>🏆 Melding van de maand</h2>
    <div class="card motm">
      ${curPost ? motmCard(curPost, `Leider ${monthName(d.curMonth)}`, cur.votes) : `<p class="list-empty">Nog geen stemmen deze maand. Tik op <b>🏆 Maandstem</b> bij je favoriete melding.</p>`}
      ${prevPost ? motmCard(prevPost, `Winnaar ${monthName(prev.month)}`, prev.votes) : ''}
    </div>
  </section>`;

  const fame = d.history.length ? `
  <section class="board">
    <h2>Hall of Fame</h2>
    <div class="card list">
      ${d.history.slice(0, 12).map((h) => {
        const dad = h.dader.suspects.map((id) => d.suspectById.get(id)?.name).filter(Boolean);
        return `
        <div class="row">
          <span class="medal">🏆</span>
          <span class="row-name"><b>${h.winners.length ? h.winners.map((u) => esc(d.nameOf(u))).join(' & ') : '—'}</b><small>week t/m vr ${dayMonth(h.weekEnd)}${dad.length ? ` · 🦹 ${esc(dad.join(' & '))}` : ''}</small></span>
          <span class="row-pts">${h.points ? fmtPts(h.points) : ''}</span>
        </div>`;
      }).join('')}
    </div>
  </section>` : '';

  return announcementBar() + gold + board + motm + fame;
}

function viewWanted(d) {
  const sus = d.activeSuspects;
  const cur = d.daderThisWeek;
  const last = d.history.find((h) => h.week === prevWeekStart(d.curWs));
  const daderCard = `
  <section class="card dader">
    <div class="dader-top"><span class="dader-icon">🦹</span><div><h2>Dader van de week</h2><p class="muted">Meeste veroordelingen · bekend vrijdag 17:00 · nog ${left(d.curWe - Date.now())}</p></div></div>
    ${cur.suspects.length ? `
      <div class="dader-leader">${cur.suspects.map((id) => d.suspectById.get(id)).filter(Boolean).map((s) => `
        <button class="dl" data-action="rap" data-id="${s.id}">${suspectImg(s)}<span><b>${esc(s.name)}</b><small>${cur.count} ${cur.count === 1 ? 'veroordeling' : 'veroordelingen'} deze week</small></span></button>`).join('')}
      </div>` : `<p class="gold-empty">Nog geen veroordelingen deze week.</p>`}
    ${last?.dader.suspects.length ? `<p class="gold-last">Vorige week: <b>${last.dader.suspects.map((id) => esc(d.suspectById.get(id)?.name || '?')).join(' & ')}</b> (${last.dader.count}×)</p>` : ''}
  </section>`;
  const how = `<p class="hint wanted-how">🕵️ Stem bij elke melding wie het was. Na 24 uur volgt de uitspraak: de verdachte met de meeste stemmen is veroordeeld. Goed gegokt? <b>+½ punt</b>.</p>`;
  const grid = sus.length ? `
  <div class="wanted-grid">
    ${sus.map((s) => { const r = d.rap.get(s.id) || {}; return `
      <button class="poster" data-action="rap" data-id="${s.id}">
        <span class="poster-head">GEZOCHT</span>
        ${suspectImg(s)}
        <b>${esc(s.name)}</b>
        <small>${r.convictions || 0}× veroordeeld${r.dadersVanDeWeek ? ` · 🦹 ${r.dadersVanDeWeek}×` : ''}</small>
      </button>`; }).join('')}
  </div>` : `<div class="empty"><div class="empty-emoji">🕵️</div><p>Nog geen verdachten in het register.</p></div>`;
  return announcementBar() + daderCard + how + grid +
    (d.isAdmin ? `<button class="btn ghost wide" data-action="add-suspect">＋ Verdachte toevoegen</button>` : '');
}

function pushCard(d) {
  const P = state.push;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let body;
  if (state.backend.mode === 'demo') body = `<p>Werkt alleen in de live app.</p>`;
  else if (!CONFIG.VAPID_PUBLIC_KEY) body = `<p>Nog niet ingesteld door de beheerder.</p>`;
  else if (isIOS && !standalone) body = `<p>Zet eerst de app op je beginscherm (Safari → Deel ⬆️ → <b>Zet op beginscherm</b>) en open hem van daaruit.</p>`;
  else if (!P.supported) body = `<p>Je telefoon of browser ondersteunt geen pushmeldingen.</p>`;
  else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') body = `<p>Meldingen zijn geblokkeerd. Zet ze aan bij je telefooninstellingen → meldingen.</p>`;
  else if (!P.on) body = `<button class="btn primary" data-action="push-on" ${P.busy ? 'disabled' : ''}>🔔 Meldingen aanzetten</button>`;
  else {
    const prefs = { new_post: true, scoreboard: true, comments: true, suspects: true, weekly: true, announcements: true, quiet: true, ...(d.me.push_prefs || {}) };
    const opt = (k, label) => `<label class="toggle"><input type="checkbox" data-pref="${k}" ${prefs[k] ? 'checked' : ''}><span>${label}</span></label>`;
    body = `
      ${opt('new_post', '🚨 Nieuwe meldingen')}
      ${opt('scoreboard', '😱 Iemand haalt je in')}
      ${opt('comments', '💬 Comments op jouw meldingen')}
      ${opt('weekly', '🏆 Winnaars op vrijdag + herinnering donderdag')}
      ${opt('suspects', '🕵️ Nieuwe verdachten')}
      ${opt('announcements', '📢 Mededelingen')}
      ${opt('quiet', '🌙 Stille uren (\'s avonds en weekend)')}
      <button class="link" data-action="push-off">Meldingen op dit toestel uitzetten</button>`;
  }
  return `<section class="card install"><h3>🔔 Pushmeldingen</h3>${body}</section>`;
}

function viewProfile(d) {
  const me = state.user.id;
  const name = d.nameOf(me);
  const total = d.scores('all').find((r) => r.userId === me)?.points || 0;
  const week = d.scores('week').find((r) => r.userId === me)?.points || 0;
  const held = CATS.filter((c) => (d.titles.get(c.id) || []).includes(me));
  const badges = badgesFor(me, d);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `
  <section class="card profile">
    ${avatar(name, 'lg')}
    <div>
      <h2>${esc(name)}${d.isAdmin ? ' <span class="admin-tag">🛡️ admin</span>' : ''}</h2>
      <p class="muted">${esc(state.user.email || '')}</p>
      <button class="link" data-action="rename">Naam wijzigen</button>
    </div>
  </section>

  ${d.myBlock ? `<div class="notice danger-notice">Je kunt tot ${weekdayDate(d.myBlock)} niet melden 🚫</div>` : ''}

  ${d.isAdmin ? `<a class="btn admin-btn wide" href="#admin">🛡️ Admin</a>` : ''}

  <section class="stat-strip three">
    <div><b>${fmtPts(total)}</b><span>punten totaal</span></div>
    <div><b>${fmtPts(week)}</b><span>deze week</span></div>
    <div><b>${d.wins.get(me) || 0}</b><span>× Gouden Borstel</span></div>
  </section>

  ${held.length ? `
  <section class="card titles">
    <h3>Jouw titels</h3>
    ${held.map((c) => `<div class="title-pill" style="--c:${esc(c.color)}">${c.emoji} ${esc(c.title)}</div>`).join('')}
  </section>` : ''}

  <section>
    <h3 class="sec-title">Badges</h3>
    <div class="badges">
      ${badges.map((b) => `<div class="badge ${b.got ? 'got' : ''}"><span class="b-emoji">${b.emoji}</span><b>${esc(b.name)}</b><small>${esc(b.hint)}</small></div>`).join('')}
    </div>
  </section>

  ${pushCard(d)}

  <section class="card settings">
    <label class="toggle"><input type="checkbox" data-setting="sound" ${soundOn() ? 'checked' : ''}><span>🔊 Geluidjes</span></label>
    <button class="link" data-action="changelog">🎉 Wat is nieuw (logboek)</button>
  </section>

  ${!standalone ? `
  <section class="card install">
    <h3>📲 Zet de app op je beginscherm</h3>
    ${state.installEvt ? `<button class="btn primary" data-action="install">Installeren</button>` :
      isIOS ? `<p>Tik in Safari op <b>Deel</b> <span aria-hidden="true">⬆️</span> en dan <b>Zet op beginscherm</b>.</p>` :
      `<p>Open het browsermenu <b>⋮</b> en kies <b>App installeren</b> of <b>Toevoegen aan startscherm</b>.</p>`}
  </section>` : ''}

  <div class="profile-actions">
    ${state.backend.mode === 'demo' ? `<button class="btn ghost wide" data-action="reset-demo">Demo opnieuw beginnen</button>` : ''}
    <button class="btn ghost wide" data-action="logout">Uitloggen</button>
  </div>
  <p class="hint center">How was the WC? · versie ${APP_VERSION}</p>`;
}

/* ---------- Admin ---------- */
function viewAdmin(d) {
  if (!d.isAdmin) return `<div class="empty"><div class="empty-emoji">🛡️</div><p>Alleen voor admins.</p></div>`;
  const tabs = [['users', '👥 Gebruikers'], ['posts', '🚩 Meldingen'], ['suspects', '🕵️ Verdachten'], ['points', '⭐ Punten'], ['announce', '📢 Mededeling'], ['stats', '📊 Statistieken']];
  const t = state.adminTab;
  const body = t === 'posts' ? adminPosts(d) : t === 'suspects' ? adminSuspects(d) : t === 'points' ? adminPoints(d)
    : t === 'announce' ? adminAnnounce() : t === 'stats' ? adminStats(d) : adminUsers(d);
  return `
  <div class="admin-head"><a href="#me" class="link">← Profiel</a><h2>🛡️ Admin</h2></div>
  <div class="chips">${tabs.map(([id, l]) => `<button class="chip ${t === id ? 'on' : ''}" data-action="admintab" data-id="${id}">${l}</button>`).join('')}</div>
  ${body}`;
}

function adminUsers(d) {
  const users = state.adminUsers;
  if (!users) return `<div class="loading">Gebruikers laden…</div>`;
  const totals = new Map(d.scores('all').map((r) => [r.userId, r]));
  const counts = new Map();
  for (const p of state.data.posts) counts.set(p.user_id, (counts.get(p.user_id) || 0) + 1);
  return `
  <p class="hint">${users.length} gebruikers · tik op iemand voor acties</p>
  <div class="card list">
    ${users.map((u) => {
      const blocked = u.blocked_until && ts(u.blocked_until) > Date.now();
      return `
      <button class="row user-row" data-action="user-menu" data-id="${esc(u.id)}">
        ${avatar(u.display_name, 'sm')}
        <span class="row-name"><b>${esc(u.display_name)}${u.is_admin ? ' 🛡️' : ''}${blocked ? ' 🚫' : ''}</b>
          <small>${esc(u.email || '')}</small>
          <small>${counts.get(u.id) || 0} ${(counts.get(u.id) || 0) === 1 ? 'melding' : 'meldingen'} · lid sinds ${dayMonth(ts(u.created_at))}${blocked ? ` · geblokkeerd t/m ${dayMonth(ts(u.blocked_until))}` : ''}</small></span>
        <span class="row-pts">${fmtPts(totals.get(u.id)?.points || 0)}</span>
      </button>`;
    }).join('')}
  </div>`;
}

function adminPosts(d) {
  const flagged = state.data.posts.filter((p) => p.is_false || p.hidden);
  return `
  <p class="hint">Tik in de feed op <b>⋯</b> bij een melding om hem als <b>vals</b> te markeren of te <b>verbergen</b>. 2× vals binnen 7 dagen = automatisch 1 week niet melden.</p>
  <div class="card list">
    ${flagged.length ? flagged.map((p) => {
      const c = getCat(p.category);
      return `
      <div class="row">
        <span class="medal">${p.is_false ? '🚩' : '🙈'}</span>
        <span class="row-name"><b>${c.emoji} ${esc(p.description || c.label)}</b><small>${esc(d.nameOf(p.user_id))} · ${esc(ago(p.created_at))}${p.hidden_reason ? ' · ' + esc(p.hidden_reason) : ''}</small></span>
        ${p.is_false ? `<button class="btn ghost small" data-action="flag" data-id="${p.id}" data-v="0">Niet vals</button>` : ''}
        ${p.hidden ? `<button class="btn ghost small" data-action="hide" data-id="${p.id}" data-v="0">Tonen</button>` : ''}
      </div>`;
    }).join('') : `<p class="list-empty">Geen valse of verborgen meldingen. 👌</p>`}
  </div>`;
}

function adminSuspects(d) {
  return `
  <button class="btn primary wide" data-action="add-suspect">＋ Verdachte toevoegen</button>
  <div class="card list">
    ${state.data.suspects.map((s) => {
      const r = d.rap.get(s.id) || {};
      return `
      <div class="row ${s.active === false ? 'inactive' : ''}">
        ${suspectImg(s, 'sus-row-img')}
        <span class="row-name"><b>${esc(s.name)}</b><small>${s.active === false ? 'uit het register · ' : ''}${r.convictions || 0}× veroordeeld · ${r.accused || 0} stemmen</small></span>
        <button class="btn ghost small" data-action="sus-menu" data-id="${s.id}">Wijzig</button>
      </div>`;
    }).join('') || `<p class="list-empty">Nog geen verdachten.</p>`}
  </div>`;
}

function adminPoints(d) {
  const users = [...state.data.profiles].sort((a, b) => a.display_name.localeCompare(b.display_name));
  const opts = [-5, -3, -2, -1, -0.5, 0.5, 1, 2, 3, 5];
  return `
  <form class="card form" id="adj-form">
    <h3>Bonus- of strafpunten</h3>
    <label>Wie? <select name="user" required>${users.map((u) => `<option value="${esc(u.id)}" ${u.id === state._adjUser ? 'selected' : ''}>${esc(u.display_name)}</option>`).join('')}</select></label>
    <label>Punten <select name="points">${opts.map((n) => `<option value="${n}" ${n === 1 ? 'selected' : ''}>${n > 0 ? '+' : ''}${fmtPts(n)}</option>`).join('')}</select></label>
    <label>Reden <input name="reason" maxlength="100" placeholder="Bijv. heldendaad: wc ontstopt 🦸" required></label>
    <p class="form-error" id="adj-error" role="alert"></p>
    <button class="btn primary" type="submit">Toekennen</button>
  </form>
  <div class="card list">
    ${[...state.data.adjustments].reverse().map((a) => `
      <div class="row">
        <span class="medal">${Number(a.points) > 0 ? '🎁' : '⚠️'}</span>
        <span class="row-name"><b>${esc(d.nameOf(a.user_id))}: ${Number(a.points) > 0 ? '+' : ''}${fmtPts(Number(a.points))}</b><small>${esc(a.reason)} · ${esc(ago(a.created_at))}</small></span>
        <button class="btn ghost small danger" data-action="del-adj" data-id="${a.id}">Intrekken</button>
      </div>`).join('') || `<p class="list-empty">Nog geen bonus- of strafpunten.</p>`}
  </div>`;
}

function adminAnnounce() {
  const a = state.data.announcement;
  return `
  <form class="card form" id="ann-form">
    <h3>Mededeling bovenin de app</h3>
    <textarea name="body" maxlength="200" rows="3" placeholder="Bijv. Deze week dubbel opletten op de 5e! 👀" required></textarea>
    <button class="btn primary" type="submit">Plaatsen${a ? ' (vervangt de huidige)' : ''}</button>
  </form>
  ${a ? `<div class="card form"><p><b>Huidige mededeling:</b><br>📢 ${esc(a.body)}</p><button class="btn ghost danger" data-action="clear-ann">Verwijderen</button></div>` : ''}`;
}

function adminStats(d) {
  const posts = state.data.posts.filter((p) => !p.is_false && !p.hidden);
  const bars = (title, entries) => {
    const max = Math.max(1, ...entries.map((e) => e[1]));
    return `<section class="card stats"><h3>${title}</h3>${entries.length ? entries.map(([l, n]) => `
      <div class="bar-row"><span class="bar-l">${l}</span><span class="bar"><span style="width:${(n / max) * 100}%"></span></span><span class="bar-n">${n}</span></div>`).join('') : '<p class="list-empty">Nog geen data.</p>'}</section>`;
  };
  const count = (fn) => { const m = new Map(); for (const p of posts) { const k = fn(p); m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const byWc = count((p) => esc(p.location || 'Onbekend'));
  const byCat = count((p) => `${getCat(p.category).emoji} ${esc(getCat(p.category).label)}`);
  const weeks = [];
  let ws = d.curWs;
  for (let i = 0; i < 8; i++) { const we = nextWeekStart(ws); weeks.push([`t/m ${dayMonth(we)}`, posts.filter((p) => ts(p.created_at) >= ws && ts(p.created_at) < we).length]); ws = prevWeekStart(ws); }
  const hours = [['🌅 vóór 9:00', 0, 9], ['☕ 9–12', 9, 12], ['🥪 12–14', 12, 14], ['💼 14–17', 14, 17], ['🌙 na 17:00', 17, 24]]
    .map(([l, a, b]) => [l, posts.filter((p) => { const h = new Date(p.created_at).getHours(); return h >= a && h < b; }).length]);
  return `
  <section class="stat-strip three">
    <div><b>${state.data.profiles.length}</b><span>gebruikers</span></div>
    <div><b>${posts.length}</b><span>meldingen</span></div>
    <div><b>${state.data.votes.length}</b><span>verdachten-stemmen</span></div>
  </section>
  ${bars('Smerigste wc', byWc)}
  ${bars('Per categorie', byCat)}
  ${bars('Per week (vr–vr)', weeks)}
  ${bars('Drukste tijdstip', hours)}`;
}

function viewShell() {
  const d = derive();
  const v = state.view;
  const content = state.loadError ? viewLoadError()
    : !state.loaded ? `<div class="loading">Even de pot checken…</div>`
    : v === 'scores' ? viewScores(d) : v === 'wanted' ? viewWanted(d) : v === 'me' ? viewProfile(d) : v === 'admin' ? viewAdmin(d) : viewFeed(d);
  const tab = (id, emoji, label) => `<a href="#${id}" class="${v === id || (id === 'me' && v === 'admin') ? 'on' : ''}" ${v === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${emoji}</span>${label}</a>`;
  return `
  <header class="topbar">
    <div class="brand">${LOGO}<span>How was the WC?</span></div>
    <button class="icon-btn" data-action="refresh" aria-label="Vernieuwen">↻</button>
  </header>
  ${state.backend.mode === 'demo' ? `<div class="demo-bar">🧪 Demomodus — alleen op dit toestel</div>` : ''}
  <main class="content">${content}</main>
  ${v !== 'admin' ? `<button class="fab" data-action="new" aria-label="Nieuwe melding"><span aria-hidden="true">＋</span> Melden</button>` : ''}
  <nav class="tabbar">
    ${tab('feed', '🧻', 'Meldingen')}
    ${tab('scores', '🏆', 'Scorebord')}
    ${tab('wanted', '🕵️', 'Most Wanted')}
    ${tab('me', '🙂', 'Profiel')}
  </nav>`;
}

function viewLoadError() {
  const e = state.loadError;
  if (e === 'migration') {
    return `<div class="card form"><h3>🛠️ Database-update nodig</h3><p>De app is vernieuwd, maar de database nog niet. De beheerder moet in Supabase het bestand <b>A-update-database.sql</b> uitvoeren.</p><button class="btn primary" data-action="refresh">Opnieuw proberen</button></div>`;
  }
  return `<div class="card form"><p class="form-error">${esc(e)}</p><button class="btn primary" data-action="refresh">Opnieuw proberen</button></div>`;
}

function render() {
  const app = $('#app');
  // getypte tekst in een comment-veld bewaren
  const act = document.activeElement;
  const keep = act && act.id && act.closest('#app') ? { id: act.id, value: act.value, start: act.selectionStart } : null;
  const scrollY = window.scrollY;
  app.innerHTML = state.user ? viewShell() : viewAuth();
  window.scrollTo(0, scrollY);
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) { el.value = keep.value; el.focus(); try { el.setSelectionRange(keep.start, keep.start); } catch { /* */ } }
  }
  renderSheet();
}

/* =====================================================================
   Sheets (onderin uitschuivende vensters)
   ===================================================================== */
function openSheet(s) { state.sheet = s; document.body.classList.add('no-scroll'); renderSheet(); }
function closeSheet() {
  if (state.sheet?.busy) return;
  if (state.sheet?.previewUrl) URL.revokeObjectURL(state.sheet.previewUrl);
  const wasWhatsNew = state.sheet?.kind === 'whatsnew';
  state.sheet = null;
  $('#sheet').innerHTML = '';
  document.body.classList.remove('no-scroll');
  if (wasWhatsNew) markSeen();
}
function sheetFrame(title, inner, id = '') {
  return `
  <div class="sheet-backdrop" data-action="close-sheet"></div>
  <div class="sheet" ${id ? `id="${id}"` : ''} role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-grip" aria-hidden="true"></div>
    <div class="sheet-head"><h2>${title}</h2><button type="button" class="icon-btn" data-action="close-sheet" aria-label="Sluiten">✕</button></div>
    ${inner}
  </div>`;
}

function renderSheet() {
  const s = state.sheet;
  const box = $('#sheet');
  if (!s) { box.innerHTML = ''; return; }
  if (s.kind === 'post') return renderPostSheet();
  const d = derive();
  if (s.kind === 'post-menu') {
    const p = state.data.posts.find((x) => x.id === s.id);
    if (!p) return closeSheet();
    const mine = p.user_id === state.user.id;
    const editable = (mine && Date.now() - ts(p.created_at) < EDIT_WINDOW) || d.isAdmin;
    const hoursLeft = Math.max(0, Math.ceil((ts(p.created_at) + EDIT_WINDOW - Date.now()) / HOUR));
    box.innerHTML = sheetFrame('Melding', `
      <div class="menu">
        ${editable ? `<button class="menu-btn" data-action="edit-post" data-id="${p.id}">✏️ Wijzigen${mine && !d.isAdmin ? `<small>nog ${hoursLeft} uur</small>` : ''}</button>` : mine ? `<p class="hint">Wijzigen kan alleen tot 24 uur na plaatsen.</p>` : ''}
        ${d.isAdmin ? `
          <button class="menu-btn" data-action="flag" data-id="${p.id}" data-v="${p.is_false ? 0 : 1}">${p.is_false ? '✅ Toch niet vals' : '🚩 Markeer als vals'}<small>${p.is_false ? 'punten komen terug' : `punten vervallen · ${esc(d.nameOf(p.user_id))}`}</small></button>
          <button class="menu-btn" data-action="hide" data-id="${p.id}" data-v="${p.hidden ? 0 : 1}">${p.hidden ? '👁️ Weer tonen' : '🙈 Verbergen'}<small>${p.hidden ? '' : 'bijv. persoon op de foto'}</small></button>` : ''}
        <button class="menu-btn danger" data-action="delete" data-id="${p.id}">🗑️ Verwijderen</button>
      </div>`);
    return;
  }
  if (s.kind === 'rap') {
    const su = d.suspectById.get(s.id);
    if (!su) return closeSheet();
    const r = d.rap.get(su.id) || {};
    const fc = r.favCat ? getCat(r.favCat) : null;
    box.innerHTML = sheetFrame('Strafblad', `
      <div class="rap">
        <div class="rap-img">${suspectImg(su)}<span class="poster-head">GEZOCHT</span></div>
        <h3>${esc(su.name)}</h3>
        <div class="rap-grid">
          <div><b>${r.convictions || 0}</b><span>veroordelingen</span></div>
          <div><b>${r.accused || 0}</b><span>keer beschuldigd</span></div>
          <div><b>${r.dadersVanDeWeek || 0}</b><span>× Dader van de week</span></div>
        </div>
        <dl class="rap-dl">
          <dt>Modus operandi</dt><dd>${fc ? `${fc.emoji} ${esc(fc.label)}` : 'Onbekend'}</dd>
          <dt>Favoriete wc</dt><dd>${r.favWc ? `📍 ${esc(r.favWc)}` : 'Onbekend'}</dd>
          <dt>Laatst gesignaleerd</dt><dd>${r.lastAt ? esc(ago(new Date(r.lastAt).toISOString())) : 'Nog nooit veroordeeld'}</dd>
        </dl>
        ${d.isAdmin ? `<div class="menu">
          <button class="menu-btn" data-action="sus-rename" data-id="${su.id}">✏️ Naam wijzigen</button>
          <button class="menu-btn" data-action="sus-photo" data-id="${su.id}">🖼️ Afbeelding wijzigen</button>
          <button class="menu-btn danger" data-action="sus-active" data-id="${su.id}" data-v="0">🗂️ Uit het register halen</button>
        </div>` : ''}
      </div>`);
    return;
  }
  if (s.kind === 'sus-menu') {
    const su = d.suspectById.get(s.id);
    if (!su) return closeSheet();
    box.innerHTML = sheetFrame(esc(su.name), `
      <div class="menu">
        <button class="menu-btn" data-action="sus-rename" data-id="${su.id}">✏️ Naam wijzigen</button>
        <button class="menu-btn" data-action="sus-photo" data-id="${su.id}">🖼️ Afbeelding wijzigen</button>
        ${su.active === false
          ? `<button class="menu-btn" data-action="sus-active" data-id="${su.id}" data-v="1">↩️ Terugzetten in het register</button>`
          : `<button class="menu-btn danger" data-action="sus-active" data-id="${su.id}" data-v="0">🗂️ Uit het register halen<small>stemmen en punten blijven bewaard</small></button>`}
      </div>`);
    return;
  }
  if (s.kind === 'add-suspect') {
    box.innerHTML = sheetFrame('Nieuwe verdachte', `
      <form id="sus-form" class="form-plain">
        <label class="photo-pick ${s.previewUrl ? 'has' : ''} sus-pick-img">
          ${s.previewUrl ? `<img src="${s.previewUrl}" alt="">` : `<span class="pp-icon">🖼️</span><span>Kies een afbeelding</span>`}
          <input type="file" accept="image/*" id="sus-file" hidden>
        </label>
        <label class="field">Fictieve naam <input name="name" maxlength="40" required placeholder="Bijv. Baron von Bril"></label>
        <p class="form-error" id="sus-error" role="alert"></p>
        <button class="btn primary big wide" type="submit" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Opslaan…' : 'Toevoegen aan het register'}</button>
      </form>`);
    return;
  }
  if (s.kind === 'user-menu') {
    const u = state.adminUsers?.find((x) => x.id === s.id);
    if (!u) return closeSheet();
    const blocked = u.blocked_until && ts(u.blocked_until) > Date.now();
    box.innerHTML = sheetFrame(esc(u.display_name), `
      <p class="muted">${esc(u.email || '')}</p>
      <div class="menu">
        <button class="menu-btn" data-action="admin-rename" data-id="${esc(u.id)}">✏️ Naam wijzigen</button>
        <button class="menu-btn" data-action="set-admin" data-id="${esc(u.id)}" data-v="${u.is_admin ? 0 : 1}">${u.is_admin ? '🛡️ Admin-rechten afnemen' : '🛡️ Admin maken'}</button>
        ${blocked
          ? `<button class="menu-btn" data-action="block" data-id="${esc(u.id)}" data-v="0">✅ Blokkade opheffen<small>nu geblokkeerd t/m ${dayMonth(ts(u.blocked_until))}</small></button>`
          : `<button class="menu-btn danger" data-action="block" data-id="${esc(u.id)}" data-v="7">🚫 1 week blokkeren<small>kan dan niet melden, wel stemmen en reageren</small></button>`}
        <button class="menu-btn" data-action="user-points" data-id="${esc(u.id)}">⭐ Bonus- of strafpunten</button>
      </div>`);
    return;
  }
  if (s.kind === 'whatsnew' || s.kind === 'changelog') {
    const entries = s.kind === 'whatsnew' ? CHANGELOG.slice(0, 1) : CHANGELOG;
    const canPush = s.kind === 'whatsnew' && state.push.supported && !state.push.on && state.backend.mode === 'live' && typeof Notification !== 'undefined' && Notification.permission !== 'denied';
    box.innerHTML = sheetFrame(s.kind === 'whatsnew' ? '🎉 Wat is nieuw' : '🎉 Logboek', `
      <div class="changelog">
        ${entries.map((e) => `
          <section><h3>${esc(e.title)} <small>versie ${esc(e.version)} · ${dayMonth(Date.parse(e.date))}</small></h3>
          <ul>${e.items.map((i) => `<li>${i}</li>`).join('')}</ul></section>`).join('')}
      </div>
      ${canPush ? `<button class="btn ghost wide" data-action="push-on">🔔 Pushmeldingen aanzetten</button>` : ''}
      <button class="btn primary big wide" data-action="close-sheet">Top! 🚽</button>`);
    return;
  }
  if (s.kind === 'blocked') {
    box.innerHTML = sheetFrame('Melden', `
      <div class="blocked">
        <div class="empty-emoji">🚫</div>
        <p class="blocked-msg">Je kunt tot ${weekdayDate(d.myBlock)} niet melden 🚫</p>
        <p class="muted">Er zijn meldingen van je als vals gemarkeerd. Stemmen, reageren en "Ik zag het ook" kan wel gewoon.</p>
        <button class="btn primary wide" data-action="close-sheet">Oké</button>
      </div>`);
  }
}

/* ---------- Nieuwe melding / wijzigen ---------- */
function openPostSheet(post = null) {
  const d = derive();
  if (!post && d.myBlock) return openSheet({ kind: 'blocked' });
  const [loc, type] = post ? splitLoc(post.location) : [CONFIG.DEFAULT_LOCATION || LOCS[0], CONFIG.DEFAULT_WC_TYPE || TYPES[0]];
  openSheet({
    kind: 'post', postId: post?.id ?? null,
    category: post?.category ?? (state.filter !== 'all' ? state.filter : null),
    loc, type, description: post?.description || '',
    photo: null, previewUrl: null, existingUrl: post ? state.backend.photoUrl(post) : null, busy: false,
  });
}
function renderPostSheet() {
  const dr = state.sheet;
  // waarden uit het formulier vasthouden bij opnieuw tekenen
  const f = $('#post-form');
  if (f) {
    dr.description = f.description.value;
    if (f.location) dr.loc = f.location.value;
    if (f.wctype) dr.type = f.wctype.value;
  }
  const editing = dr.postId != null;
  const img = dr.previewUrl || dr.existingUrl;
  const optList = (arr, cur) => arr.map((l) => `<option ${l === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
  $('#sheet').innerHTML = `
  <div class="sheet-backdrop" data-action="close-sheet"></div>
  <form class="sheet" id="post-form" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
    <div class="sheet-grip" aria-hidden="true"></div>
    <div class="sheet-head">
      <h2 id="sheet-title">${editing ? 'Melding wijzigen' : 'Nieuwe melding'}</h2>
      <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Sluiten">✕</button>
    </div>
    <fieldset>
      <legend>Wat zag je?</legend>
      <div class="cat-grid">
        ${CATS.map((c) => `
          <button type="button" class="cat-opt ${dr.category === c.id ? 'on' : ''}" style="--c:${esc(c.color)}" data-action="pick-cat" data-id="${esc(c.id)}" aria-pressed="${dr.category === c.id}">
            <span class="ce">${c.emoji}</span><span>${esc(c.label)}</span>
          </button>`).join('')}
      </div>
    </fieldset>
    <fieldset>
      <legend>Foto${CONFIG.PHOTO_REQUIRED && !editing ? '' : editing ? ' (tik om te vervangen)' : ' (optioneel)'}</legend>
      <label class="photo-pick ${img ? 'has' : ''}">
        ${img ? `<img src="${esc(img)}" alt="Gekozen foto">` : `<span class="pp-icon">📸</span><span>Tik om een foto te maken</span>`}
        <input type="file" accept="image/*" capture="environment" id="photo-input" hidden>
      </label>
      <p class="hint">Alleen de pot of wasbak, nooit personen 🙈</p>
    </fieldset>
    <div class="field-row">
      ${LOCS.length ? `<label class="field">Waar?<select name="location">${optList(LOCS, dr.loc)}</select></label>` : ''}
      ${TYPES.length ? `<label class="field">Welke wc?<select name="wctype">${optList(TYPES, dr.type)}</select></label>` : ''}
    </div>
    <label class="field">Beschrijving
      <textarea name="description" maxlength="500" rows="2" placeholder="Vertel het verhaal…">${esc(dr.description)}</textarea>
    </label>
    <p class="form-error" id="post-error" role="alert"></p>
    <button class="btn primary big wide" type="submit" ${dr.busy ? 'disabled' : ''}>
      ${dr.busy ? 'Bezig…' : editing ? 'Opslaan' : dr.category ? `Melden en +${fmtPts(getCat(dr.category).points ?? 1)} punt scoren` : 'Melden'}
    </button>
  </form>`;
}

function openLightbox(src) {
  $('#lightbox').innerHTML = `<div class="lightbox" data-action="close-lightbox" role="dialog" aria-label="Foto"><img src="${esc(src)}" alt=""><button class="icon-btn" aria-label="Sluiten">✕</button></div>`;
}

/* =====================================================================
   Gegevens laden + "Wat is nieuw"
   ===================================================================== */
async function refresh(quiet = true) {
  if (!state.user) return;
  try {
    state.data = await state.backend.loadAll();
    state.loaded = true;
    state.loadError = null;
    invalidate();
    if (state.view === 'admin' && state.adminTab === 'users') loadAdminUsers();
    render();
    maybeWhatsNew();
    if (!quiet) toast('Bijgewerkt ✨');
  } catch (e) {
    state.loaded = true;
    if (/does not exist|could not find|schema cache/i.test(String(e?.message))) state.loadError = 'migration';
    else if (!state.data.posts.length) state.loadError = niceError(e);
    render();
    if (!state.loadError) toast(niceError(e));
  }
}
async function loadAdminUsers() {
  try { state.adminUsers = await state.backend.listUsers(); render(); } catch (e) { toast(niceError(e)); }
}
function maybeWhatsNew() {
  if (state.sheet || state._whatsNewShown) return;
  const me = derive().me;
  if (!me.id || me.seen_version === APP_VERSION) return;
  state._whatsNewShown = true;
  // nieuwe gebruikers hoeven niet te zien wat er "nieuw" is
  if (Date.now() - ts(me.created_at) < 30 * 60000 && !me.seen_version) { markSeen(); return; }
  openSheet({ kind: 'whatsnew' });
}
async function markSeen() {
  const me = derive().me;
  if (!me.id || me.seen_version === APP_VERSION) return;
  me.seen_version = APP_VERSION;
  try { await state.backend.updateProfile(state.user.id, { seen_version: APP_VERSION }); } catch { /* volgende keer */ }
}

/* =====================================================================
   Pushmeldingen (client)
   ===================================================================== */
function b64ToU8(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
async function initPush() {
  state.push.supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!CONFIG.VAPID_PUBLIC_KEY && location.protocol === 'https:';
  if (!state.push.supported || state.backend.mode !== 'live' || !state.user) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    state.push.on = !!sub && Notification.permission === 'granted';
    if (state.push.on) { const j = sub.toJSON(); await state.backend.savePushSub(state.user.id, { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }); }
    if (state.view === 'me') render();
  } catch { /* geen push */ }
}
async function enablePush() {
  if (!state.push.supported) return toast('Pushmeldingen werken niet op dit toestel.');
  const perm = await Notification.requestPermission(); // moet direct na de tik
  if (perm !== 'granted') { toast('Geen toestemming voor meldingen.'); render(); return; }
  state.push.busy = true; render();
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CONFIG.VAPID_PUBLIC_KEY) });
    const j = sub.toJSON();
    await state.backend.savePushSub(state.user.id, { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
    state.push.on = true;
    toast('🔔 Meldingen staan aan!');
  } catch (e) { toast(niceError(e)); }
  state.push.busy = false;
  if (state.sheet?.kind === 'whatsnew') closeSheet();
  render();
}
async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await state.backend.removePushSub(sub.endpoint).catch(() => {}); await sub.unsubscribe(); }
  } catch { /* */ }
  state.push.on = false; toast('Meldingen uitgezet'); render();
}

/* =====================================================================
   Acties
   ===================================================================== */
const findPost = (id) => state.data.posts.find((p) => String(p.id) === String(id));
async function act(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); } catch (e) { toast(niceError(e)); }
  await refresh();
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const id = el.dataset.id;
  const d = () => derive();
  const me = state.user?.id;

  switch (a) {
    case 'authtab': state.authTab = id; render(); break;
    case 'filter': state.filter = id; state.feedLimit = 25; render(); break;
    case 'more': state.feedLimit += 25; render(); break;
    case 'boardcat': state.boardCat = id; render(); break;
    case 'period': state.period = id; render(); break;
    case 'refresh': el.classList.add('spin'); await refresh(false); break;
    case 'new': openPostSheet(); break;
    case 'close-sheet': closeSheet(); break;
    case 'pick-cat': state.sheet.category = id; renderPostSheet(); break;
    case 'zoom': openLightbox(el.dataset.src); break;
    case 'close-lightbox': $('#lightbox').innerHTML = ''; break;
    case 'hide-ann': store.set('wc-ann-hidden', Number(id)); render(); break;
    case 'goto-post': {
      location.hash = '#feed';
      setTimeout(() => document.getElementById('post-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
      break;
    }
    case 'confirm': {
      const p = findPost(id); if (!p) break;
      const on = !d().confByPost.get(p.id)?.has(me);
      state.data.confirmations = on ? [...state.data.confirmations, { post_id: p.id, user_id: me }]
        : state.data.confirmations.filter((c) => !(c.post_id === p.id && c.user_id === me));
      invalidate(); render(); playPop();
      try { await state.backend.setConfirm(p.id, me, on); } catch (err) { toast(niceError(err)); refresh(); }
      break;
    }
    case 'react': {
      const pid = Number(el.dataset.post);
      const on = !d().rxByPost.get(pid)?.get(id)?.has(me);
      state.data.reactions = on ? [...state.data.reactions, { post_id: pid, user_id: me, emoji: id }]
        : state.data.reactions.filter((r) => !(r.post_id === pid && r.user_id === me && r.emoji === id));
      invalidate(); render(); if (on) playPop();
      try { await state.backend.react(pid, me, id, on); } catch (err) { toast(niceError(err)); refresh(); }
      break;
    }
    case 'comments': {
      const pid = Number(id);
      if (state.openComments.has(pid)) state.openComments.delete(pid); else state.openComments.add(pid);
      render();
      if (state.openComments.has(pid)) document.getElementById('c-in-' + pid)?.focus();
      break;
    }
    case 'del-comment': if (confirm('Comment verwijderen?')) await act(() => state.backend.deleteComment(Number(id))); break;
    case 'vote': {
      const pid = Number(el.dataset.post), sid = Number(id);
      const cur = d().verdicts.get(pid)?.votes.find((v) => v.user_id === me)?.suspect_id;
      const next = cur === sid ? null : sid;
      state.data.votes = state.data.votes.filter((v) => !(v.post_id === pid && v.user_id === me));
      if (next) state.data.votes.push({ post_id: pid, user_id: me, suspect_id: next });
      invalidate(); render(); playPop();
      try { await state.backend.vote(pid, me, next); } catch (err) { toast(niceError(err)); refresh(); }
      break;
    }
    case 'motm': {
      const pid = Number(id), month = d().curMonth;
      const next = d().myMotm === pid ? null : pid;
      state.data.motm = state.data.motm.filter((v) => !(v.month === month && v.user_id === me));
      if (next) state.data.motm.push({ month, user_id: me, post_id: next });
      invalidate(); render(); if (next) { playPop(); toast(`🏆 Je maandstem gaat naar deze melding`); }
      try { await state.backend.motmVote(month, me, next); } catch (err) { toast(niceError(err)); refresh(); }
      break;
    }
    case 'post-menu': openSheet({ kind: 'post-menu', id: Number(id) }); break;
    case 'edit-post': { const p = findPost(id); closeSheet(); if (p) openPostSheet(p); break; }
    case 'delete': {
      const p = findPost(id); if (!p) break;
      const own = p.user_id === me;
      if (!confirm(own ? 'Deze melding verwijderen? Je punt verdwijnt ook.' : `Melding van ${d().nameOf(p.user_id)} verwijderen?\n\nTip: valse meldingen kun je beter als "vals" markeren, dan telt het mee voor de blokkade.`)) break;
      closeSheet();
      await act(() => state.backend.deletePost(p), 'Verwijderd');
      break;
    }
    case 'flag': {
      const v = el.dataset.v === '1';
      closeSheet();
      await act(() => state.backend.flagPost(Number(id), v), v ? '🚩 Gemarkeerd als vals' : 'Markering weggehaald');
      break;
    }
    case 'hide': {
      const v = el.dataset.v === '1';
      let reason = null;
      if (v) { reason = prompt('Reden (optioneel), bijv. "persoon op de foto"', ''); if (reason === null) break; }
      closeSheet();
      await act(() => state.backend.hidePost(Number(id), v, reason), v ? '🙈 Verborgen' : 'Weer zichtbaar');
      break;
    }
    case 'rap': openSheet({ kind: 'rap', id: Number(id) }); break;
    case 'sus-menu': openSheet({ kind: 'sus-menu', id: Number(id) }); break;
    case 'add-suspect': openSheet({ kind: 'add-suspect', blob: null, previewUrl: null, busy: false }); break;
    case 'sus-rename': {
      const s = d().suspectById.get(Number(id)); if (!s) break;
      const n = prompt('Nieuwe (fictieve) naam', s.name);
      if (n && n.trim() && n.trim() !== s.name) { closeSheet(); await act(() => state.backend.updateSuspect(s, { name: n.trim().slice(0, 40) }), 'Naam gewijzigd'); }
      break;
    }
    case 'sus-photo': {
      const s = d().suspectById.get(Number(id)); if (!s) break;
      const file = await pickFile(); if (!file) break;
      closeSheet();
      await act(async () => state.backend.updateSuspect(s, { blob: await compressImage(file, 600, 0.82) }), 'Afbeelding gewijzigd');
      break;
    }
    case 'sus-active': {
      const s = d().suspectById.get(Number(id)); if (!s) break;
      const v = el.dataset.v === '1';
      if (!v && !confirm(`${s.name} uit het register halen? Er kan dan niet meer op gestemd worden. Oude stemmen en punten blijven bewaard.`)) break;
      closeSheet();
      await act(() => state.backend.updateSuspect(s, { active: v }), v ? 'Terug in het register' : 'Uit het register gehaald');
      break;
    }
    case 'admintab': state.adminTab = id; if (id === 'users') loadAdminUsers(); render(); break;
    case 'user-menu': openSheet({ kind: 'user-menu', id }); break;
    case 'admin-rename': {
      const u = state.adminUsers?.find((x) => x.id === id); if (!u) break;
      const n = prompt('Naam', u.display_name);
      if (n && n.trim()) { closeSheet(); await act(() => state.backend.renameUser(id, n.trim().slice(0, 40)), 'Naam gewijzigd'); }
      break;
    }
    case 'set-admin': {
      const v = el.dataset.v === '1';
      if (!confirm(v ? 'Deze gebruiker admin maken?' : 'Admin-rechten afnemen?')) break;
      closeSheet(); await act(() => state.backend.setAdmin(id, v), v ? '🛡️ Is nu admin' : 'Geen admin meer');
      break;
    }
    case 'block': {
      const days = el.dataset.v === '0' ? null : Number(el.dataset.v);
      closeSheet(); await act(() => state.backend.setBlock(id, days), days ? '🚫 1 week geblokkeerd' : '✅ Blokkade opgeheven');
      break;
    }
    case 'user-points': closeSheet(); state.adminTab = 'points'; state._adjUser = id; render(); break;
    case 'del-adj': if (confirm('Deze punten intrekken?')) await act(() => state.backend.deleteAdjustment(Number(id)), 'Ingetrokken'); break;
    case 'clear-ann': await act(() => state.backend.setAnnouncement(null), 'Mededeling verwijderd'); break;
    case 'rename': {
      const cur = d().nameOf(me);
      const n = prompt('Je naam', cur);
      if (n && n.trim() && n.trim() !== cur) await act(() => state.backend.updateProfile(me, { display_name: n.trim().slice(0, 40) }), 'Naam gewijzigd');
      break;
    }
    case 'changelog': openSheet({ kind: 'changelog' }); break;
    case 'push-on': await enablePush(); break;
    case 'push-off': await disablePush(); break;
    case 'install': state.installEvt?.prompt(); state.installEvt = null; break;
    case 'logout': await state.backend.signOut(); break;
    case 'reset-demo': if (confirm('Alle demogegevens wissen?')) state.backend.reset(); break;
  }
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'photo-input' && state.sheet?.kind === 'post') {
    const file = t.files?.[0]; if (!file) return;
    try {
      const blob = await compressImage(file);
      if (state.sheet.previewUrl) URL.revokeObjectURL(state.sheet.previewUrl);
      state.sheet.photo = blob;
      state.sheet.previewUrl = URL.createObjectURL(blob);
      renderPostSheet();
    } catch (err) { $('#post-error').textContent = niceError(err); }
    return;
  }
  if (t.id === 'sus-file' && state.sheet?.kind === 'add-suspect') {
    const file = t.files?.[0]; if (!file) return;
    const name = $('#sus-form')?.name.value || '';
    const blob = await compressImage(file, 600, 0.82);
    if (state.sheet.previewUrl) URL.revokeObjectURL(state.sheet.previewUrl);
    state.sheet.blob = blob; state.sheet.previewUrl = URL.createObjectURL(blob);
    renderSheet();
    $('#sus-form').name.value = name;
    return;
  }
  if (t.dataset.setting === 'sound') { store.set('wc-sound', t.checked); if (t.checked) playPop(); return; }
  if (t.dataset.pref) {
    const me = derive().me;
    const prefs = { ...(me.push_prefs || {}), [t.dataset.pref]: t.checked };
    me.push_prefs = prefs;
    try { await state.backend.updateProfile(state.user.id, { push_prefs: prefs }); } catch (err) { toast(niceError(err)); }
  }
});

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;

  if (f.id === 'auth-form') {
    const fd = new FormData(f);
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    const name = String(fd.get('name') || '').trim();
    const err = $('#auth-error');
    if (state.authTab === 'signup' && !name) { err.textContent = 'Vul je naam in.'; return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Vul een geldig e-mailadres in.'; return; }
    if (password.length < 6) { err.textContent = 'Wachtwoord moet minstens 6 tekens zijn.'; return; }
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      if (state.authTab === 'signup') {
        const { needsConfirm } = await state.backend.signUp(name, email, password);
        if (needsConfirm) {
          f.innerHTML = `<div class="sent"><div class="empty-emoji">📬</div><p><b>Check je mail!</b><br>Klik op de bevestigingslink, kom terug en log in.</p><button type="button" class="btn ghost" data-action="authtab" data-id="login">Naar inloggen</button></div>`;
          return;
        }
      } else {
        await state.backend.signIn(email, password);
      }
    } catch (ex) { err.textContent = niceError(ex); btn.disabled = false; }
    return;
  }

  if (f.id === 'post-form') {
    const dr = state.sheet;
    const err = $('#post-error');
    const editing = dr.postId != null;
    if (!dr.category) { err.textContent = 'Kies eerst wat je zag.'; return; }
    if (CONFIG.PHOTO_REQUIRED && !editing && !dr.photo) { err.textContent = 'Foto of het is niet gebeurd 📸'; return; }
    const payload = {
      userId: state.user.id,
      category: dr.category,
      description: String(f.description.value || '').trim().slice(0, 500),
      location: [f.location?.value, f.wctype?.value].filter(Boolean).join(' · ') || null,
      photo: dr.photo,
    };
    const before = derive().scores('week').find((r) => r.userId === state.user.id)?.rank;
    dr.busy = true; renderPostSheet();
    try {
      if (editing) {
        await state.backend.updatePost(findPost(dr.postId), payload);
        dr.busy = false; closeSheet();
        await refresh(); toast('✏️ Melding gewijzigd');
        return;
      }
      await state.backend.createPost(payload);
      const c = getCat(dr.category);
      dr.busy = false; closeSheet();
      state.filter = 'all';
      if (state.view !== 'feed') location.hash = '#feed';
      await refresh();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      playFlush(); confetti();
      const after = derive().scores('week').find((r) => r.userId === state.user.id)?.rank;
      if (after === 1 && before !== 1) {
        setTimeout(() => { playFanfare(); toast('🏆 Je pakt de leiding voor de Gouden Borstel!'); }, 1700);
      } else {
        toast(`+${fmtPts(c.points ?? 1)} punt! Op weg naar ${c.title} ${c.emoji}`);
      }
    } catch (ex) {
      dr.busy = false; renderPostSheet();
      $('#post-error').textContent = niceError(ex);
    }
    return;
  }

  if (f.classList.contains('comment-form')) {
    const body = f.body.value.trim().slice(0, 200);
    if (!body) return;
    const pid = Number(f.dataset.post);
    f.body.value = '';
    try { await state.backend.addComment(pid, body); playPop(); } catch (ex) { toast(niceError(ex)); f.body.value = body; }
    await refresh();
    document.getElementById('c-in-' + pid)?.focus();
    return;
  }

  if (f.id === 'sus-form') {
    const s = state.sheet;
    const name = f.name.value.trim().slice(0, 40);
    if (!name) { $('#sus-error').textContent = 'Geef de verdachte een naam.'; return; }
    s.busy = true; renderSheet(); $('#sus-form').name.value = name;
    try {
      await state.backend.addSuspect(name, s.blob);
      s.busy = false; closeSheet(); toast(`🕵️ ${name} staat in het register`);
    } catch (ex) { s.busy = false; renderSheet(); $('#sus-error').textContent = niceError(ex); return; }
    await refresh();
    return;
  }

  if (f.id === 'adj-form') {
    const uid = f.user.value, pts = Number(f.points.value), reason = f.reason.value.trim();
    if (!reason) { $('#adj-error').textContent = 'Geef een reden.'; return; }
    await act(() => state.backend.addAdjustment(uid, pts, reason), `${pts > 0 ? '🎁' : '⚠️'} ${pts > 0 ? '+' : ''}${fmtPts(pts)} voor ${derive().nameOf(uid)}`);
    return;
  }

  if (f.id === 'ann-form') {
    const body = f.body.value.trim().slice(0, 200);
    if (!body) return;
    await act(() => state.backend.setAnnouncement(body), '📢 Mededeling geplaatst');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ($('#lightbox').innerHTML) $('#lightbox').innerHTML = '';
  else if (state.sheet) closeSheet();
});

window.addEventListener('hashchange', () => {
  state.view = routeFromHash();
  if (state.view === 'admin') { state.adminUsers = null; loadAdminUsers(); }
  render();
  window.scrollTo(0, 0);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user && !state.sheet) refresh();
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.installEvt = e;
  if (state.view === 'me') render();
});

// Elke minuut de aftellers bijwerken (alleen als er niet getypt wordt)
setInterval(() => {
  if (!state.user || state.sheet || document.activeElement?.matches('input, textarea, select')) return;
  invalidate(); render();
}, 60000);

/* =====================================================================
   Opstarten
   ===================================================================== */
async function start() {
  const live = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY;
  try {
    state.backend = live ? await createSupabaseBackend() : createDemoBackend();
  } catch {
    $('#app').innerHTML = `<main class="auth"><div class="card form"><p class="form-error">Kan de database niet bereiken. Check je internet.</p><button class="btn primary" onclick="location.reload()">Opnieuw</button></div></main>`;
    return;
  }

  state.backend.onAuth((user) => {
    const changed = user?.id !== state.user?.id;
    state.user = user;
    if (!changed) return;
    state._whatsNewShown = false;
    if (user) { state.loaded = false; render(); refresh(); initPush(); }
    else { state.data = EMPTY; invalidate(); render(); }
  });

  state.user = await state.backend.getUser();
  render();
  if (state.user) { refresh(); }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  initPush();
}

start();
