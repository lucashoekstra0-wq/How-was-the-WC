import { CONFIG } from './config.js';

/* =====================================================================
   Helpers
   ===================================================================== */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CATS = CONFIG.CATEGORIES;
const CAT_BY_ID = Object.fromEntries(CATS.map((c) => [c.id, c]));
const getCat = (id) => CAT_BY_ID[id] || { id, emoji: '❓', label: id, title: 'Spotter', color: '#888', points: 1 };
const DAY = 86400000;

function weekStart(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // maandag
  return x;
}
const rtf = new Intl.RelativeTimeFormat('nl', { numeric: 'auto' });
function ago(iso) {
  const s = (new Date(iso) - Date.now()) / 1000;
  for (const [u, sec] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(s) >= sec) return rtf.format(Math.round(s / sec), u);
  }
  return 'zojuist';
}
const fmtDate = (d) => d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });

function hue(str) { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) % 360; return h; }
function initials(name) { return String(name).trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'; }
function avatar(name, size = '') {
  return `<span class="avatar ${size}" style="--h:${hue(name)}" aria-hidden="true">${esc(initials(name))}</span>`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2800);
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
  return m || 'Er ging iets mis.';
}

/* Foto verkleinen naar max 1280px JPEG (scheelt opslag en data). */
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
  const w = src.width, h = src.height;
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
}
const blobToDataUrl = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });

/* =====================================================================
   Backend 1: Supabase (live, gedeeld met het hele kantoor)
   ===================================================================== */
async function createSupabaseBackend() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const toUser = (s) => (s?.user ? { id: s.user.id, email: s.user.email } : null);
  const ok = ({ error, data }) => { if (error) throw error; return data; };

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
      const [profiles, posts, confirmations] = await Promise.all([
        sb.from('profiles').select('id, display_name'),
        sb.from('posts').select('id, user_id, category, description, location, photo_path, created_at')
          .order('created_at', { ascending: false }).limit(10000),
        sb.from('confirmations').select('post_id, user_id').limit(50000),
      ]);
      return { profiles: ok(profiles), posts: ok(posts), confirmations: ok(confirmations) };
    },
    async createPost({ userId, category, description, location, photo }) {
      let photo_path = null;
      if (photo) {
        photo_path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        ok(await sb.storage.from('photos').upload(photo_path, photo, { contentType: 'image/jpeg' }));
      }
      const res = await sb.from('posts').insert({ category, description, location, photo_path });
      if (res.error) {
        if (photo_path) await sb.storage.from('photos').remove([photo_path]);
        throw res.error;
      }
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
    photoUrl(post) { return post.photo_path ? sb.storage.from('photos').getPublicUrl(post.photo_path).data.publicUrl : null; },
    async updateName(userId, name) { ok(await sb.from('profiles').update({ display_name: name }).eq('id', userId)); },
  };
}

/* =====================================================================
   Backend 2: Demo (alleen op dit toestel, om de app uit te proberen)
   ===================================================================== */
function demoPhoto(emoji, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><pattern id="t" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="#f4f8f9"/><path d="M50 0H0V50" fill="none" stroke="#d5e3e6" stroke-width="3"/></pattern></defs><rect width="400" height="300" fill="url(#t)"/><circle cx="200" cy="150" r="90" fill="${color}" opacity=".18"/><text x="200" y="185" font-size="110" text-anchor="middle">${emoji}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function seedDemo() {
  const people = [
    { id: 'd1', display_name: 'Sanne de Vries' },
    { id: 'd2', display_name: 'Pieter Bakker' },
    { id: 'd3', display_name: 'Fatima El Amrani' },
    { id: 'd4', display_name: 'Joost Jansen' },
  ];
  const ws = weekStart().getTime();
  const span = Math.max(Date.now() - ws, 3600000);
  const thisWeek = (f) => new Date(ws + span * f).toISOString();
  const lastWeek = (f) => new Date(ws - 7 * DAY + 7 * DAY * f).toISOString();
  const rows = [
    ['d1', 'remsporen', 'Klassieker. Iemand heeft de borstel niet gevonden.', 0.95, 'w', 'Begane grond'],
    ['d3', 'plas', 'Plasje naast de pot, ik ben er bijna in uitgegleden 🫠', 0.8, 'w', '1e verdieping'],
    ['d2', 'wasbak', 'Tandpasta + baardharen in de wasbak.', 0.6, 'w', '1e verdieping'],
    ['d1', 'bril', 'Bril met verdachte druppels.', 0.4, 'w', 'Begane grond'],
    ['d4', 'haar', 'Krulletje op de bril. Geen commentaar.', 0.25, 'w', '2e verdieping'],
    ['d1', 'remsporen', 'Alweer! Zelfde wc als vorige keer.', 0.1, 'w', 'Begane grond'],
    ['d2', 'remsporen', 'Na de vrijdagmiddagborrel...', 0.9, 'l', '2e verdieping'],
    ['d2', 'plas', 'Mikken blijft lastig blijkbaar.', 0.7, 'l', 'Begane grond'],
    ['d3', 'bril', 'Bril plakt.', 0.5, 'l', '1e verdieping'],
    ['d2', 'wasbak', 'Koffieprut in de wasbak.', 0.3, 'l', '2e verdieping'],
    ['d4', 'remsporen', '', 0.15, 'l', 'Begane grond'],
  ];
  const posts = rows.map(([user_id, category, description, f, wk, location], i) => {
    const c = getCat(category);
    return {
      id: 100 + rows.length - i, user_id, category, description, location,
      photo_path: demoPhoto(c.emoji, c.color),
      created_at: wk === 'w' ? thisWeek(f) : lastWeek(f),
    };
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const confirmations = [
    { post_id: posts[0].id, user_id: 'd2' }, { post_id: posts[0].id, user_id: 'd3' },
    { post_id: posts[1].id, user_id: 'd1' }, { post_id: posts[3].id, user_id: 'd4' },
  ];
  return { profiles: people, posts, confirmations, session: null, nextId: 1000 };
}

function createDemoBackend() {
  const KEY = 'howwasthewc-demo-v1';
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (!db) db = seedDemo();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch { /* opslag vol of geblokkeerd: blijft dan alleen in het geheugen */ }
  };
  let authCb = () => {};
  const userFromEmail = (email) => 'me-' + hue(email.toLowerCase()) + '-' + email.length;

  return {
    mode: 'demo',
    async getUser() { return db.session; },
    onAuth(cb) { authCb = cb; },
    async signUp(name, email, password) {
      if (password.length < 6) throw new Error('Password should be at least 6 characters');
      const id = userFromEmail(email);
      const p = db.profiles.find((x) => x.id === id);
      if (p) p.display_name = name; else db.profiles.push({ id, display_name: name });
      db.session = { id, email };
      save(); authCb(db.session);
      return { needsConfirm: false };
    },
    async signIn(email, password) {
      const id = userFromEmail(email);
      if (!db.profiles.find((x) => x.id === id)) db.profiles.push({ id, display_name: email.split('@')[0] });
      db.session = { id, email };
      save(); authCb(db.session);
    },
    async signOut() { db.session = null; save(); authCb(null); },
    async loadAll() {
      return structuredClone({ profiles: db.profiles, posts: db.posts, confirmations: db.confirmations });
    },
    async createPost({ userId, category, description, location, photo }) {
      const photo_path = photo ? await blobToDataUrl(await compressImage(photo, 700, 0.6)) : null;
      db.posts.unshift({ id: db.nextId++, user_id: userId, category, description, location, photo_path, created_at: new Date().toISOString() });
      save();
    },
    async deletePost(post) {
      db.posts = db.posts.filter((p) => p.id !== post.id);
      db.confirmations = db.confirmations.filter((c) => c.post_id !== post.id);
      save();
    },
    async setConfirm(postId, userId, on) {
      db.confirmations = db.confirmations.filter((c) => !(c.post_id === postId && c.user_id === userId));
      if (on) db.confirmations.push({ post_id: postId, user_id: userId });
      save();
    },
    photoUrl(post) { return post.photo_path; },
    async updateName(userId, name) {
      const p = db.profiles.find((x) => x.id === userId);
      if (p) p.display_name = name;
      save();
    },
    reset() { try { localStorage.removeItem(KEY); } catch {} location.reload(); },
  };
}

/* =====================================================================
   State + berekeningen
   ===================================================================== */
const state = {
  backend: null,
  user: null,
  data: { profiles: [], posts: [], confirmations: [] },
  loaded: false,
  view: (location.hash.slice(1) || 'feed'),
  filter: 'all',
  feedLimit: 25,
  period: 'week',
  boardCat: 'all',
  authTab: 'login',
  draft: null,
  installEvt: null,
};

function rankPosts(posts) {
  const m = new Map();
  for (const p of posts) {
    const r = m.get(p.user_id) || { userId: p.user_id, points: 0, count: 0, last: '' };
    r.points += getCat(p.category).points ?? 1;
    r.count++;
    if (p.created_at > r.last) r.last = p.created_at;
    m.set(p.user_id, r);
  }
  const arr = [...m.values()].sort((a, b) => b.points - a.points || a.last.localeCompare(b.last));
  let rank = 0, prev = null;
  arr.forEach((r, i) => { if (r.points !== prev) { rank = i + 1; prev = r.points; } r.rank = rank; });
  return arr;
}

function derive() {
  const { profiles, posts, confirmations } = state.data;
  const names = new Map(profiles.map((p) => [p.id, p.display_name]));
  const nameOf = (id) => names.get(id) || 'Onbekende spotter';

  const confByPost = new Map();
  const confGiven = new Map();
  for (const c of confirmations) {
    if (!confByPost.has(c.post_id)) confByPost.set(c.post_id, new Set());
    confByPost.get(c.post_id).add(c.user_id);
    confGiven.set(c.user_id, (confGiven.get(c.user_id) || 0) + 1);
  }

  const ws = weekStart().getTime();
  const inWeek = (p, start) => { const t = new Date(p.created_at).getTime(); return t >= start && t < start + 7 * DAY; };

  // Gouden Borstel: winnaar(s) per afgeronde week
  const byWeek = new Map();
  for (const p of posts) {
    const k = weekStart(new Date(p.created_at)).getTime();
    if (k >= ws) continue;
    if (!byWeek.has(k)) byWeek.set(k, []);
    byWeek.get(k).push(p);
  }
  const history = [...byWeek.entries()].sort((a, b) => b[0] - a[0]).map(([k, ps]) => {
    const r = rankPosts(ps);
    return { week: k, points: r[0].points, winners: r.filter((x) => x.rank === 1).map((x) => x.userId) };
  });
  const wins = new Map();
  for (const h of history) for (const u of h.winners) wins.set(u, (wins.get(u) || 0) + 1);

  // Huidige titelhouders (altijd, per categorie)
  const titles = new Map();
  for (const c of CATS) {
    const r = rankPosts(posts.filter((p) => p.category === c.id));
    if (r.length) titles.set(c.id, r.filter((x) => x.rank === 1).map((x) => x.userId));
  }

  return { nameOf, confByPost, confGiven, ws, inWeek, history, wins, titles };
}

function badgesFor(userId, d) {
  const mine = state.data.posts.filter((p) => p.user_id === userId);
  const cats = new Set(mine.map((p) => p.category));
  const hours = mine.map((p) => new Date(p.created_at).getHours());
  const w = d.wins.get(userId) || 0;
  return [
    { emoji: '🐣', name: 'Eerste spot', hint: 'Plaats je eerste melding', got: mine.length >= 1 },
    { emoji: '🔟', name: 'Vaste klant', hint: '10 meldingen', got: mine.length >= 10 },
    { emoji: '🦸', name: 'WC-legende', hint: '50 meldingen', got: mine.length >= 50 },
    { emoji: '🌈', name: 'Alleskunner', hint: 'Elke categorie minstens 1×', got: CATS.every((c) => cats.has(c.id)) },
    { emoji: '🏆', name: w > 1 ? `Gouden Borstel ×${w}` : 'Gouden Borstel', hint: 'Win een week', got: w > 0 },
    { emoji: '👀', name: 'Getuige', hint: '10× "Ik zag het ook"', got: (d.confGiven.get(userId) || 0) >= 10 },
    { emoji: '🌅', name: 'Vroege vogel', hint: 'Melding vóór 8:00', got: hours.some((h) => h < 8) },
    { emoji: '🌙', name: 'Overwerker', hint: 'Melding na 18:00', got: hours.some((h) => h >= 18) },
  ];
}

/* =====================================================================
   Views
   ===================================================================== */
const LOGO = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><rect x="16" y="6" width="32" height="16" rx="4" fill="currentColor" opacity=".9"/><path d="M8 26h48v4c0 11-9 20-20 20h-8C17 50 8 41 8 30z" fill="currentColor"/><path d="M22 50h20l-3 8H25z" fill="currentColor" opacity=".9"/><ellipse cx="32" cy="27" rx="18" ry="3.2" fill="var(--paper)" opacity=".55"/></svg>`;

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

function viewFeed(d) {
  const all = [{ id: 'all', emoji: '🧻', label: 'Alles' }, ...CATS];
  const chips = all.map((c) => `<button class="chip ${state.filter === c.id ? 'on' : ''}" data-action="filter" data-id="${esc(c.id)}">${c.emoji} ${esc(c.label)}</button>`).join('');
  const list = state.data.posts.filter((p) => state.filter === 'all' || p.category === state.filter);
  const shown = list.slice(0, state.feedLimit);
  const weekPosts = state.data.posts.filter((p) => d.inWeek(p, d.ws)).length;
  return `
    <section class="stat-strip">
      <div><b>${weekPosts}</b><span>meldingen deze week</span></div>
      <div><b>${state.data.posts.length}</b><span>totaal ooit</span></div>
    </section>
    <div class="chips">${chips}</div>
    ${shown.length ? shown.map((p) => postCard(p, d)).join('') : `
      <div class="empty"><div class="empty-emoji">✨</div><p>Nog niks gemeld${state.filter !== 'all' ? ' in deze categorie' : ''}.<br>Brandschoon… of heeft nog niemand goed gekeken?</p></div>`}
    ${list.length > shown.length ? `<button class="btn ghost wide" data-action="more">Meer laden</button>` : ''}`;
}

function postCard(p, d) {
  const c = getCat(p.category);
  const url = state.backend.photoUrl(p);
  const conf = d.confByPost.get(p.id) || new Set();
  const mine = p.user_id === state.user.id;
  const iConf = conf.has(state.user.id);
  const name = d.nameOf(p.user_id);
  return `
  <article class="card post" style="--c:${esc(c.color)}">
    <header class="post-head">
      <span class="cat-badge">${c.emoji} ${esc(c.label)}</span>
      <span class="pts">+${c.points ?? 1}</span>
    </header>
    ${url ? `<button class="photo" data-action="zoom" data-src="${esc(url)}" aria-label="Foto groot bekijken"><img src="${esc(url)}" loading="lazy" alt="Foto bij melding: ${esc(c.label)}"></button>` : ''}
    ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
    <div class="meta">${avatar(name, 'sm')}<b>${esc(name)}</b><span>· ${esc(ago(p.created_at))}</span>${p.location ? `<span>· 📍 ${esc(p.location)}</span>` : ''}</div>
    <div class="actions">
      <button class="btn ghost small ${iConf ? 'on' : ''}" data-action="confirm" data-id="${p.id}" ${mine ? 'disabled' : ''} aria-pressed="${iConf}">
        👀 Ik zag het ook${conf.size ? ` · ${conf.size}` : ''}
      </button>
      ${mine ? `<button class="btn ghost small danger" data-action="delete" data-id="${p.id}">Verwijderen</button>` : ''}
    </div>
  </article>`;
}

function viewScores(d) {
  const posts = state.data.posts;
  const weekRank = rankPosts(posts.filter((p) => d.inWeek(p, d.ws)));
  const leaders = weekRank.filter((r) => r.rank === 1);
  const daysLeft = Math.ceil((d.ws + 7 * DAY - Date.now()) / DAY);
  const last = d.history.find((h) => h.week === d.ws - 7 * DAY);

  const gold = `
  <section class="card gold">
    <div class="gold-top">
      <div class="trophy" aria-hidden="true">🏆</div>
      <div>
        <h2>De Gouden Borstel</h2>
        <p class="muted">Weekprijs · wie de meeste punten scoort · nog ${daysLeft} ${daysLeft === 1 ? 'dag' : 'dagen'}</p>
      </div>
    </div>
    ${leaders.length
      ? `<div class="gold-leader">${leaders.map((l) => `${avatar(d.nameOf(l.userId))}<span><b>${esc(d.nameOf(l.userId))}</b><small>${l.points} ${l.points === 1 ? 'punt' : 'punten'} deze week</small></span>`).join('')}</div>`
      : `<p class="gold-empty">Nog niemand gescoord deze week. Jouw kans! 🧻</p>`}
    ${last ? `<p class="gold-last">Vorige week: <b>${last.winners.map((u) => esc(d.nameOf(u))).join(' & ')}</b> (${last.points} pt)</p>` : ''}
  </section>`;

  const scoped = posts.filter((p) => (state.period === 'week' ? d.inWeek(p, d.ws) : true) && (state.boardCat === 'all' || p.category === state.boardCat));
  const ranked = rankPosts(scoped);
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
          <span class="row-pts">${r.points}</span>
        </div>`).join('') : `<p class="list-empty">Nog geen punten ${state.period === 'week' ? 'deze week' : ''}${cat ? 'in ' + esc(cat.label) : ''}.</p>`}
    </div>
  </section>`;

  const fame = d.history.length ? `
  <section class="board">
    <h2>Hall of Fame</h2>
    <div class="card list">
      ${d.history.slice(0, 10).map((h) => `
        <div class="row">
          <span class="medal">🏆</span>
          <span class="row-name"><b>${h.winners.map((u) => esc(d.nameOf(u))).join(' & ')}</b><small>week van ${fmtDate(new Date(h.week))}</small></span>
          <span class="row-pts">${h.points}</span>
        </div>`).join('')}
    </div>
  </section>` : '';

  return gold + board + fame;
}

function viewProfile(d) {
  const me = state.user.id;
  const name = d.nameOf(me);
  const mine = state.data.posts.filter((p) => p.user_id === me);
  const total = mine.reduce((s, p) => s + (getCat(p.category).points ?? 1), 0);
  const week = mine.filter((p) => d.inWeek(p, d.ws)).reduce((s, p) => s + (getCat(p.category).points ?? 1), 0);
  const held = CATS.filter((c) => (d.titles.get(c.id) || []).includes(me));
  const badges = badgesFor(me, d);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  return `
  <section class="card profile">
    ${avatar(name, 'lg')}
    <div>
      <h2>${esc(name)}</h2>
      <p class="muted">${esc(state.user.email || '')}</p>
      <button class="link" data-action="rename">Naam wijzigen</button>
    </div>
  </section>

  <section class="stat-strip three">
    <div><b>${total}</b><span>punten totaal</span></div>
    <div><b>${week}</b><span>deze week</span></div>
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
  </div>`;
}

function viewShell() {
  const d = derive();
  const v = state.view;
  const content = v === 'scores' ? viewScores(d) : v === 'me' ? viewProfile(d) : viewFeed(d);
  const tab = (id, emoji, label) => `<a href="#${id}" class="${v === id ? 'on' : ''}" ${v === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${emoji}</span>${label}</a>`;
  return `
  <header class="topbar">
    <div class="brand">${LOGO}<span>How was the WC?</span></div>
    <button class="icon-btn" data-action="refresh" aria-label="Vernieuwen">↻</button>
  </header>
  ${state.backend.mode === 'demo' ? `<div class="demo-bar">🧪 Demomodus — alleen op dit toestel</div>` : ''}
  <main class="content">${state.loaded ? content : `<div class="loading">Even de pot checken…</div>`}</main>
  <button class="fab" data-action="new" aria-label="Nieuwe melding"><span aria-hidden="true">＋</span> Melden</button>
  <nav class="tabbar">
    ${tab('feed', '🧻', 'Meldingen')}
    ${tab('scores', '🏆', 'Scorebord')}
    ${tab('me', '🙂', 'Profiel')}
  </nav>`;
}

function render() {
  const app = $('#app');
  const scrollY = window.scrollY;
  app.innerHTML = state.user ? viewShell() : viewAuth();
  window.scrollTo(0, scrollY);
}

/* ---------- Nieuwe melding (sheet) ---------- */
function openSheet() {
  state.draft = { category: state.filter !== 'all' ? state.filter : null, photo: null, previewUrl: null, busy: false };
  renderSheet();
  document.body.classList.add('no-scroll');
}
function closeSheet() {
  if (state.draft?.previewUrl) URL.revokeObjectURL(state.draft.previewUrl);
  state.draft = null;
  $('#sheet').innerHTML = '';
  document.body.classList.remove('no-scroll');
}
function renderSheet() {
  const dr = state.draft;
  if (!dr) return;
  const descVal = $('#sheet textarea')?.value ?? '';
  const locVal = $('#sheet select')?.value ?? '';
  $('#sheet').innerHTML = `
  <div class="sheet-backdrop" data-action="close-sheet"></div>
  <form class="sheet" id="post-form" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
    <div class="sheet-grip" aria-hidden="true"></div>
    <div class="sheet-head">
      <h2 id="sheet-title">Nieuwe melding</h2>
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
      <legend>Foto${CONFIG.PHOTO_REQUIRED ? '' : ' (optioneel)'}</legend>
      <label class="photo-pick ${dr.previewUrl ? 'has' : ''}">
        ${dr.previewUrl ? `<img src="${dr.previewUrl}" alt="Gekozen foto">` : `<span class="pp-icon">📸</span><span>Tik om een foto te maken</span>`}
        <input type="file" accept="image/*" capture="environment" id="photo-input" hidden>
      </label>
      <p class="hint">Alleen de pot of wasbak, nooit personen 🙈</p>
    </fieldset>

    ${CONFIG.LOCATIONS.length ? `
    <label class="field">Welke wc?
      <select name="location">
        ${CONFIG.LOCATIONS.map((l) => `<option ${l === locVal ? 'selected' : ''}>${esc(l)}</option>`).join('')}
      </select>
    </label>` : ''}

    <label class="field">Beschrijving
      <textarea name="description" maxlength="500" rows="2" placeholder="Vertel het verhaal…">${esc(descVal)}</textarea>
    </label>

    <p class="form-error" id="post-error" role="alert"></p>
    <button class="btn primary big wide" type="submit" ${dr.busy ? 'disabled' : ''}>
      ${dr.busy ? 'Bezig met uploaden…' : dr.category ? `Melden en +${getCat(dr.category).points ?? 1} punt scoren` : 'Melden'}
    </button>
  </form>`;
}

/* ---------- Lightbox ---------- */
function openLightbox(src) {
  $('#lightbox').innerHTML = `<div class="lightbox" data-action="close-lightbox" role="dialog" aria-label="Foto"><img src="${esc(src)}" alt=""><button class="icon-btn" aria-label="Sluiten">✕</button></div>`;
}

/* =====================================================================
   Acties
   ===================================================================== */
async function refresh(quiet = true) {
  if (!state.user) return;
  try {
    state.data = await state.backend.loadAll();
    state.loaded = true;
    render();
    if (!quiet) toast('Bijgewerkt ✨');
  } catch (e) {
    state.loaded = true;
    render();
    toast(niceError(e));
  }
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const id = el.dataset.id;
  const findPost = () => state.data.posts.find((p) => String(p.id) === id);

  switch (a) {
    case 'authtab': state.authTab = id; render(); break;
    case 'filter': state.filter = id; state.feedLimit = 25; render(); break;
    case 'more': state.feedLimit += 25; render(); break;
    case 'boardcat': state.boardCat = id; render(); break;
    case 'period': state.period = id; render(); break;
    case 'refresh': el.classList.add('spin'); await refresh(false); break;
    case 'new': openSheet(); break;
    case 'close-sheet': if (!state.draft?.busy) closeSheet(); break;
    case 'pick-cat': state.draft.category = id; renderSheet(); break;
    case 'zoom': openLightbox(el.dataset.src); break;
    case 'close-lightbox': $('#lightbox').innerHTML = ''; break;
    case 'confirm': {
      const p = findPost(); if (!p) break;
      const on = !(derive().confByPost.get(p.id)?.has(state.user.id));
      // direct tonen, daarna opslaan
      if (on) state.data.confirmations.push({ post_id: p.id, user_id: state.user.id });
      else state.data.confirmations = state.data.confirmations.filter((c) => !(c.post_id === p.id && c.user_id === state.user.id));
      render();
      try { await state.backend.setConfirm(p.id, state.user.id, on); } catch (err) { toast(niceError(err)); refresh(); }
      break;
    }
    case 'delete': {
      const p = findPost(); if (!p) break;
      if (!confirm('Deze melding verwijderen? Je punt verdwijnt ook.')) break;
      try { await state.backend.deletePost(p); toast('Verwijderd'); } catch (err) { toast(niceError(err)); }
      refresh();
      break;
    }
    case 'rename': {
      const cur = derive().nameOf(state.user.id);
      const n = prompt('Je naam', cur);
      if (n && n.trim() && n.trim() !== cur) {
        try { await state.backend.updateName(state.user.id, n.trim().slice(0, 40)); toast('Naam gewijzigd'); } catch (err) { toast(niceError(err)); }
        refresh();
      }
      break;
    }
    case 'install': state.installEvt?.prompt(); state.installEvt = null; break;
    case 'logout': await state.backend.signOut(); break;
    case 'reset-demo': if (confirm('Alle demogegevens wissen?')) state.backend.reset(); break;
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.id !== 'photo-input' || !state.draft) return;
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const blob = await compressImage(file);
    if (state.draft.previewUrl) URL.revokeObjectURL(state.draft.previewUrl);
    state.draft.photo = blob;
    state.draft.previewUrl = URL.createObjectURL(blob);
    renderSheet();
  } catch (err) {
    $('#post-error').textContent = niceError(err);
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
          err.textContent = '';
          f.innerHTML = `<div class="sent"><div class="empty-emoji">📬</div><p><b>Check je mail!</b><br>Klik op de bevestigingslink, kom terug en log in.</p><button type="button" class="btn ghost" data-action="authtab" data-id="login">Naar inloggen</button></div>`;
          return;
        }
      } else {
        await state.backend.signIn(email, password);
      }
    } catch (ex) {
      err.textContent = niceError(ex);
      btn.disabled = false;
    }
    return;
  }

  if (f.id === 'post-form') {
    const dr = state.draft;
    const err = $('#post-error');
    if (!dr.category) { err.textContent = 'Kies eerst wat je zag.'; return; }
    if (CONFIG.PHOTO_REQUIRED && !dr.photo) { err.textContent = 'Foto of het is niet gebeurd 📸'; return; }
    const fd = new FormData(f);
    const payload = {
      userId: state.user.id,
      category: dr.category,
      description: String(fd.get('description') || '').trim().slice(0, 500),
      location: fd.get('location') ? String(fd.get('location')) : null,
      photo: dr.photo,
    };
    dr.busy = true;
    renderSheet();
    try {
      await state.backend.createPost(payload);
      const c = getCat(dr.category);
      closeSheet();
      state.view = 'feed'; state.filter = 'all';
      if (location.hash !== '#feed') history.replaceState(null, '', '#feed');
      await refresh();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      confetti();
      toast(`+${c.points ?? 1} punt! Op weg naar ${c.title} ${c.emoji}`);
    } catch (ex) {
      dr.busy = false;
      renderSheet();
      $('#post-error').textContent = niceError(ex);
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ($('#lightbox').innerHTML) $('#lightbox').innerHTML = '';
  else if (state.draft && !state.draft.busy) closeSheet();
});

window.addEventListener('hashchange', () => {
  state.view = location.hash.slice(1) || 'feed';
  render();
  window.scrollTo(0, 0);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user && !state.draft) refresh();
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.installEvt = e;
  if (state.view === 'me') render();
});

/* =====================================================================
   Opstarten
   ===================================================================== */
async function start() {
  const live = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY;
  try {
    state.backend = live ? await createSupabaseBackend() : createDemoBackend();
  } catch (e) {
    $('#app').innerHTML = `<main class="auth"><div class="card form"><p class="form-error">Kan de database niet bereiken. Check je internet of de gegevens in config.js.</p><button class="btn primary" onclick="location.reload()">Opnieuw</button></div></main>`;
    return;
  }

  state.backend.onAuth((user) => {
    const changed = user?.id !== state.user?.id;
    state.user = user;
    if (!changed) return;
    if (user) { state.loaded = false; render(); refresh(); }
    else { state.data = { profiles: [], posts: [], confirmations: [] }; render(); }
  });

  state.user = await state.backend.getUser();
  render();
  if (state.user) refresh();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

start();
