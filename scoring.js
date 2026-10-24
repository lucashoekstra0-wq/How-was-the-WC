// =====================================================================
//  How was the WC?  —  puntentelling, weken (vr 17:00) en blokkades
//  Wordt gebruikt door de app én door de pushmeldingen-functie.
// =====================================================================

export const TZ = 'Europe/Amsterdam';
export const HOUR = 3600000;
export const DAY = 24 * HOUR;
export const VOTE_WINDOW = 24 * HOUR;
export const EDIT_WINDOW = 24 * HOUR;
const WEEK_END_DAY = 5;   // vrijdag
const WEEK_END_HOUR = 17; // 17:00

const DTF = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
});
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wandklok-tijd in Amsterdam voor een tijdstip (ms). */
export function amsParts(t) {
  const o = {};
  for (const p of DTF.formatToParts(new Date(t))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second, wd: WD[o.weekday] };
}
function offsetAt(t) {
  const p = amsParts(t);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
}
/** Amsterdamse wandklok → ms (dag mag over-/onderlopen). */
export function amsToUtc(y, m, d, h = 0, mi = 0) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offsetAt(guess);
  const off2 = offsetAt(t);
  if (guess - off2 !== t) t = guess - off2;
  return t;
}
/** Begin van de "week" (vorige vrijdag 17:00) waarin t valt. */
export function weekStartOf(t) {
  const p = amsParts(t);
  const back = (p.wd - WEEK_END_DAY + 7) % 7;
  let s = amsToUtc(p.y, p.m, p.d - back, WEEK_END_HOUR);
  if (s > t) s = amsToUtc(p.y, p.m, p.d - back - 7, WEEK_END_HOUR);
  return s;
}
export function nextWeekStart(ws) {
  const p = amsParts(ws);
  return amsToUtc(p.y, p.m, p.d + 7, WEEK_END_HOUR);
}
export function prevWeekStart(ws) {
  const p = amsParts(ws);
  return amsToUtc(p.y, p.m, p.d - 7, WEEK_END_HOUR);
}
export function monthKey(t) {
  const p = amsParts(t);
  return `${p.y}-${String(p.m).padStart(2, '0')}`;
}

const ts = (iso) => (iso ? new Date(iso).getTime() : 0);

/** Telt alles door. data = rijen uit de database, cfg = CONFIG. */
export function computeModel(data, cfg, now = Date.now()) {
  const catPoints = new Map((cfg.CATEGORIES || []).map((c) => [c.id, c.points ?? 1]));
  const minVotes = cfg.SUSPECT_MIN_VOTES ?? 2;
  const posts = data.posts || [];
  const valid = (p) => p && !p.is_false && !p.hidden;
  const postById = new Map(posts.map((p) => [p.id, p]));

  // ---- uitspraak per melding (verdachten) ----
  const votesByPost = new Map();
  for (const v of data.votes || []) {
    if (!votesByPost.has(v.post_id)) votesByPost.set(v.post_id, []);
    votesByPost.get(v.post_id).push(v);
  }
  const verdicts = new Map();
  for (const p of posts) {
    const vs = votesByPost.get(p.id) || [];
    const closesAt = ts(p.created_at) + VOTE_WINDOW;
    const counts = new Map();
    for (const v of vs) counts.set(v.suspect_id, (counts.get(v.suspect_id) || 0) + 1);
    const closed = now >= closesAt;
    let winners = [];
    if (closed && valid(p) && vs.length >= minVotes) {
      const max = Math.max(...counts.values());
      winners = [...counts.entries()].filter(([, n]) => n === max).map(([id]) => id);
    }
    const correct = new Set(vs.filter((v) => winners.includes(v.suspect_id)).map((v) => v.user_id));
    verdicts.set(p.id, { closesAt, closed, counts, total: vs.length, winners, correct, votes: vs });
  }

  // ---- puntgebeurtenissen ----
  const events = [];
  for (const p of posts) {
    if (!valid(p)) continue;
    events.push({ userId: p.user_id, points: catPoints.get(p.category) ?? 1, at: ts(p.created_at), kind: 'post', category: p.category });
    const vd = verdicts.get(p.id);
    for (const u of vd.correct) events.push({ userId: u, points: 0.5, at: vd.closesAt, kind: 'vote' });
  }
  for (const a of data.adjustments || []) {
    events.push({ userId: a.user_id, points: Number(a.points), at: ts(a.created_at), kind: 'adjust' });
  }

  const rank = (evs) => {
    const m = new Map();
    for (const e of evs) {
      const r = m.get(e.userId) || { userId: e.userId, points: 0, count: 0, last: 0 };
      r.points = Math.round((r.points + e.points) * 10) / 10;
      if (e.kind === 'post') r.count++;
      if (e.at > r.last) r.last = e.at;
      m.set(e.userId, r);
    }
    const arr = [...m.values()].filter((r) => r.points > 0).sort((a, b) => b.points - a.points || a.last - b.last);
    let rk = 0, prev = null;
    arr.forEach((r, i) => { if (r.points !== prev) { rk = i + 1; prev = r.points; } r.rank = rk; });
    return arr;
  };

  const curWs = weekStartOf(now);
  const curWe = nextWeekStart(curWs);
  const inRange = (from, to) => (e) => e.at >= from && e.at < to && e.at <= now;

  /** Ranglijst: period 'week' | 'all' | {from,to}; cat = categorie-id of 'all'. */
  function scores(period = 'week', cat = 'all') {
    let evs = events.filter((e) => e.at <= now);
    if (period === 'week') evs = evs.filter(inRange(curWs, curWe));
    else if (period && typeof period === 'object') evs = evs.filter(inRange(period.from, period.to));
    if (cat !== 'all') evs = evs.filter((e) => e.kind === 'post' && e.category === cat);
    return rank(evs);
  }

  // ---- Gouden Borstel + Dader van de week per afgeronde week ----
  const weekKeys = new Set();
  for (const e of events) if (e.at < curWs) weekKeys.add(weekStartOf(e.at));
  const verdictWeeks = new Set();
  for (const [, vd] of verdicts) if (vd.winners.length && vd.closesAt < curWs) verdictWeeks.add(weekStartOf(vd.closesAt));

  function daderFor(from, to) {
    const m = new Map();
    for (const [, vd] of verdicts) {
      if (!vd.winners.length || vd.closesAt < from || vd.closesAt >= to || vd.closesAt > now) continue;
      for (const s of vd.winners) m.set(s, (m.get(s) || 0) + 1);
    }
    if (!m.size) return { suspects: [], count: 0 };
    const max = Math.max(...m.values());
    return { suspects: [...m.entries()].filter(([, n]) => n === max).map(([id]) => id), count: max };
  }

  const history = [...new Set([...weekKeys, ...verdictWeeks])].sort((a, b) => b - a).map((ws) => {
    const r = rank(events.filter(inRange(ws, nextWeekStart(ws))));
    return {
      week: ws, weekEnd: nextWeekStart(ws),
      points: r[0]?.points || 0,
      winners: r.filter((x) => x.rank === 1).map((x) => x.userId),
      dader: daderFor(ws, nextWeekStart(ws)),
    };
  });
  const wins = new Map();
  for (const h of history) for (const u of h.winners) wins.set(u, (wins.get(u) || 0) + 1);

  // ---- titels per categorie (altijd) ----
  const titles = new Map();
  for (const c of cfg.CATEGORIES || []) {
    const r = scores('all', c.id);
    if (r.length) titles.set(c.id, r.filter((x) => x.rank === 1).map((x) => x.userId));
  }

  // ---- strafblad per verdachte ----
  const rap = new Map();
  for (const s of data.suspects || []) rap.set(s.id, { accused: 0, convictions: 0, wcs: new Map(), cats: new Map(), lastAt: 0, dadersVanDeWeek: 0 });
  for (const [pid, vd] of verdicts) {
    const p = postById.get(pid);
    for (const [sid, n] of vd.counts) { const r = rap.get(sid); if (r) r.accused += n; }
    for (const sid of vd.winners) {
      const r = rap.get(sid); if (!r) continue;
      r.convictions++;
      if (p.location) r.wcs.set(p.location, (r.wcs.get(p.location) || 0) + 1);
      r.cats.set(p.category, (r.cats.get(p.category) || 0) + 1);
      r.lastAt = Math.max(r.lastAt, ts(p.created_at));
    }
  }
  for (const h of history) for (const sid of h.dader.suspects) { const r = rap.get(sid); if (r) r.dadersVanDeWeek++; }
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  for (const r of rap.values()) { r.favWc = top(r.wcs); r.favCat = top(r.cats); }

  // ---- melding van de maand ----
  const motmByMonth = new Map();
  for (const v of data.motm || []) {
    const p = postById.get(v.post_id);
    if (!valid(p)) continue;
    if (!motmByMonth.has(v.month)) motmByMonth.set(v.month, new Map());
    const m = motmByMonth.get(v.month);
    m.set(v.post_id, (m.get(v.post_id) || 0) + 1);
  }
  function motmLeader(month) {
    const m = motmByMonth.get(month);
    if (!m || !m.size) return null;
    const [pid, n] = [...m.entries()].sort((a, b) => b[1] - a[1] || ts(postById.get(a[0]).created_at) - ts(postById.get(b[0]).created_at))[0];
    return { postId: pid, votes: n };
  }
  const curMonth = monthKey(now);
  const motmHistory = [...motmByMonth.keys()].filter((k) => k < curMonth).sort().reverse()
    .map((k) => ({ month: k, ...motmLeader(k) }));

  return {
    now, curWs, curWe, verdicts, events, scores, history, wins, titles, rap,
    daderThisWeek: daderFor(curWs, curWe), curMonth, motmLeader, motmHistory, motmByMonth,
    blockedUntil: (uid) => blockedUntil(uid, data, now),
  };
}

/** Zelfde regel als de database: 2x vals binnen 7 dagen = 7 dagen blokkade. */
export function blockedUntil(uid, data, now = Date.now()) {
  const prof = (data.profiles || []).find((p) => p.id === uid) || {};
  const since = ts(prof.unblocked_at) || -Infinity;
  const flags = (data.posts || [])
    .filter((p) => p.user_id === uid && p.is_false && p.flagged_at && ts(p.flagged_at) > since)
    .map((p) => ts(p.flagged_at)).sort((a, b) => a - b);
  let auto = 0;
  for (const t of flags) {
    const n = flags.filter((x) => x > t - 7 * DAY && x <= t).length;
    if (n >= 2) auto = Math.max(auto, t + 7 * DAY);
  }
  const until = Math.max(auto, ts(prof.blocked_until));
  return until > now ? until : 0;
}
