/* ===== 星遇同频 VRCX 提醒 · 开始（这一段请原样保留：改过的通不过星遇同频网页上的「检查」） ===== */
/* 星遇同频 · VRCX 提醒 v3 —— https://vrcc.cc/match/
 *
 * 在 VRCX 左边加一个「星遇同频」。在那里填上星遇同频「我的资料 → 在 VRCX 里提醒」给的连接码，连上以后：
 *   - 星遇同频的提醒（擦肩、有人连你、星搭快开始……，和手机上收到的推送一样）弹在 VRCX 里：不戴头显时在电脑右下角；
 *     戴着头显时，按你在 VRCX「通知」里的设置，进 VRCX 自己的浮层、XSOverlay 或 OVR Toolkit；
 *   - 你在 VRChat 里待的那张地图，可以直接打分（地图榜还没有它的，由你添加）；
 *   - 看和你星轨相交的星、互相连上的星；加好友是打开 VRCX 自己的玩家窗口，由你自己点。
 *
 * 它只连星遇同频：用连上时拿到的提醒令牌，每分钟左右问一次有没有新提醒。这个令牌只能读你的提醒、星轨相交和互相连上，
 * 能做的只有给地图打分、断开自己。它不读 VRCX 的登录信息，不替你向 VRChat 发任何东西，不读你电脑上的文件，不运行收到的
 * 任何内容（收到的都只当文字显示）。只有你点「打分」时，才把你所在的地图告诉星遇同频。
 * VRCX 启动时问一次，之后只在 VRChat 开着时才问。
 *
 * 每个人的这个文件都一样，里面没有你的任何信息。
 * 安装：把这个文件命名为 custom.js，放进 %AppData%\VRCX，重启 VRCX。原来就有 custom.js 的，把这一整段粘到原文件最后。
 * 断开：在 VRCX 的「星遇同频」里点「断开」，或者在星遇同频「我的资料」里断开。不用了就删掉这一段。
 * 只从 vrcc.cc 下载。星遇同频不会在 QQ 群、私聊里发这个文件，别人发给你的 custom.js 不要装。
 * 想确认手上的是不是原样的：在星遇同频「我的资料 → 在 VRCX 里提醒」点「检查」，选你的 custom.js（只在你的浏览器里比对，不上传）。
 */
(() => {
  'use strict';
  if (window.__vrccVrcx) return;               // 已经在跑了（不会跑两份）
  window.__vrccVrcx = true;
  const SITE = 'https://vrcc.cc';
  const V = 3, API = SITE + '/api/match', K = 'vrcc-vrcx-';
  const GROUP_ID = 'grp_a72a2c19-3305-4695-b83e-e7ffadcd529e';   // VRChat 中文社区的 VRChat 群组
  const warn = (err) => { try { console.warn('[星遇同频]', err && err.message ? err.message : err); } catch {} };
  const safe = (fn) => (...a) => { try { const r = fn(...a); if (r && typeof r.catch === 'function') r.catch(warn); return r; } catch (err) { warn(err); } };
  const kept = (k) => { try { return localStorage.getItem(K + k); } catch { return null; } };
  const keep = (k, v) => { try { if (v === null) localStorage.removeItem(K + k); else localStorage.setItem(K + k, String(v)); } catch {} };
  let token = /^[0-9a-f]{48}$/.test(kept('token') || '') ? kept('token') : null;
  let since = null, dot = 0, timer = 0, latest = V;  // since null: never asked yet (the first answer only says where things stand)
  let stars = null, pals = null, listErr = null;   // 星轨相交、互相连上（打开「星遇同频」时问一次）
  let map = null, mapErr = null, mapBusy = false;   // 你所在的地图（打开时、换地图时问）
  { const k = kept('since'); if (k !== null && Number.isFinite(+k)) since = +k; }
  const mine = () => (token || '').slice(0, 8);   // 这一次连接（重新连接会换）

  // ---------- 和星遇同频说话：网络断了、服务器出错、太频繁，都变成一句能看懂的话 ----------
  const SAY = {
    offline: '连不上星遇同频，检查一下网络，稍后会自动重试。', server: '星遇同频暂时出了点问题，稍后再试。', too_many: '今天的次数用完了，明天再试。',
    code: '连接码不对或过期了，回网页重新拿一个。', yq_wait: '你的星还在审核，通过后就能打分。', yq_paused: '你的星已暂停，暂时不能打分。', yq_off: '地图榜暂时关闭了。',
    map_off: '这张地图已经从地图榜下架了。', xd_world: '读不到这张地图，它可能不是公开地图。', xd_world_no: '这张地图不在你所在星池的地图榜上。',
    xd_search: '暂时读不到这张地图的信息，稍后再试。', bad_request: '没成功，稍后再试。',
    busy: '连接暂时停了，明天再试。', map_elsewhere: '机器人几分钟前还看到你在另一张地图，过几分钟再试。'
  };
  const NEED = { verify: '先在星遇同频「我的资料 → VRChat 名字」验证你的 VRChat 账号，才能打分。', friend: '先在 VRChat 里同意机器人「VRCC的小助手」的好友请求，才能打分。', go: '机器人还没看到你在 VRChat 里在线，过几分钟再试。' };
  async function ask(path, body) {
    let r;
    try {
      r = await fetch(API + path, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'omit',   // POST 用纯文本：不用预检
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined });
    } catch { const e = new Error('offline'); e.say = SAY.offline; throw e; }
    const d = await r.json().catch(() => ({}));
    if (r.ok) return d;
    const code = r.status === 404 && d.error === 'gone' ? 'gone' : d.error || (r.status >= 500 ? 'server' : 'bad_request');
    const e = new Error(code); e.status = r.status; e.data = d; e.say = code === 'map_not_went' ? NEED[d.need] || NEED.go : SAY[code] || SAY.server;
    throw e;
  }

  // ---------- 弹提醒：和 VRCX 自己弹通知时一样的判断（src/stores/notification） ----------
  const S = () => { try { return window.$pinia || {}; } catch { return {}; } };
  const playing = () => { const g = S().game; return !g || g.isGameRunning !== false; };
  function where() {
    const p = S(), g = p.game || {}, ns = p.notificationsSettings || {};
    const when = { Always: () => true, 'Inside VR': () => !!g.isSteamVRRunning, 'Outside VR': () => !g.isSteamVRRunning,
      'Game Closed': () => !g.isGameRunning, 'Game Running': () => !!g.isGameRunning, 'Desktop Mode': () => !!(g.isGameNoVR && g.isGameRunning) };
    const is = (k) => !!(when[k] && when[k]());
    const vr = is(ns.overlayToast || 'Game Running');
    const to = { vr: vr && ns.overlayNotifications !== false, xs: vr && ns.xsNotifications !== false, hud: vr && ns.ovrtHudNotifications !== false, wrist: vr && !!ns.ovrtWristNotifications };
    // 电脑右下角：没戴头显就弹；戴着时照 VRCX 的「桌面通知」设置，浮层都关了也弹（至少留在 Windows 通知里）
    to.desk = !g.isSteamVRRunning || is(ns.desktopToast) || !(to.vr || to.xs || to.hud || to.wrist);
    to.secs = Math.max(3, Math.floor((+ns.notificationTimeout || 5000) / 1000));   // VRCX 的「通知停留时间」，单位秒
    to.alpha = Math.min(1, Math.max(.2, (+(p.advancedSettings || {}).notificationOpacity || 100) / 100));
    return to;
  }
  // VRCX 自己弹通知用的函数（不是公开接口，不在的就跳过；VRCX 更新后可能改名）
  const call = (fn, ...args) => { try { const A = window.AppApi; if (A && typeof A[fn] === 'function') Promise.resolve(A[fn](...args)).catch(() => {}); } catch {} };
  function show(title, body, desk = false) {
    try {
      title = String(title || '星遇同频').slice(0, 60); body = String(body || '').slice(0, 200);
      const to = where();
      if (to.desk || desk) {
        if (window.electron && typeof window.electron.desktopNotification === 'function') { try { window.electron.desktopNotification(title, body, ''); } catch {} }   // Linux 版 VRCX
        else call('DesktopNotification', title, body, '');
      }
      if (to.vr) call('ExecuteVrOverlayFunction', 'playNoty', JSON.stringify({ noty: { type: 'External', message: title + '：' + body }, message: '', image: '' }));
      if (to.xs) call('XSNotification', title, body, to.secs, to.alpha, '');
      if (to.hud || to.wrist) call('OVRTNotification', to.hud, to.wrist, title, body, to.secs, to.alpha, '');
    } catch (err) { warn(err); }
  }
  const openLink = (url) => { try { if (window.AppApi && typeof window.AppApi.OpenLink === 'function') return void window.AppApi.OpenLink(url); } catch {} try { window.open(url, '_blank'); } catch {} };
  const openSite = (path) => openLink(SITE + path);
  // VRCX 自己的窗口（和点 vrcx://user/…、vrcx://group/… 链接一样）；打不开就用浏览器
  const launch = (what, fallback) => { try { const v = S().vrcx; if (v && typeof v.eventLaunchCommand === 'function') return void v.eventLaunchCommand(what); } catch {} openLink(fallback); };
  const isFriend = (id) => { try { const f = S().friend; return !!(f && f.friends && typeof f.friends.has === 'function' && f.friends.has(id)); } catch { return false; } };
  const inGroup = () => { try { const g = S().group; return !!(g && g.currentUserGroups && typeof g.currentUserGroups.has === 'function' && g.currentUserGroups.has(GROUP_ID)); } catch { return false; } };
  // 你现在所在的地图（VRCX 知道，私人房间也知道；在路上、没开 VRChat 时没有）
  const here = () => { try { const l = (S().location || {}).lastLocation || {}, m = /^(wrld_[0-9a-f-]{36})(:|$)/.exec(String(l.location || '')); return playing() && m ? { world: m[1], name: String(l.name || '') } : null; } catch { return null; } };

  // ---------- 问星遇同频 ----------
  async function look(first) {
    clearTimeout(timer); timer = 0;
    if (!token) return paint();
    let wait = 60000 + Math.random() * 20000;
    try {
      if (first || playing()) {
        const d = await ask('?vrcx=' + token + '&v=' + V + (since === null ? '' : '&since=' + since));
        if (d.old) return gone(true);
        if (kept('hello') !== mine()) { keep('hello', mine()); show('星遇同频', 'VRCX 提醒已连上，玩的时候提醒会弹在这里。', true); }
        if (since !== null && Array.isArray(d.items)) for (const x of d.items.slice(-3)) show(x.title, x.body);
        if (Number.isFinite(+d.last)) { since = +d.last; keep('since', since); }
        if (Number.isFinite(+d.dot)) dot = +d.dot;
        if (+d.latest > V) {   // 有新版本：说一次，入口一直带红点
          latest = +d.latest;
          if (kept('stale') !== String(latest)) { keep('stale', latest); show('星遇同频', '「星遇同频」的 VRCX 脚本有新版本，去星遇同频「我的资料 → 在 VRCX 里提醒」下载替换，不用重新连接。', true); }
        }
        if (+d.every >= 30) wait = d.every * 1000 + Math.random() * 20000;
        paint();
      }
    } catch (err) {
      if (err.message === 'gone') return gone(false);
      if (err.status === 429) wait = 5 * 60000;
    }
    timer = setTimeout(safe(look), wait);
  }
  // 令牌失效（在网页上断开了，或在别的电脑上连了），或者这个文件太旧：说一次，停下
  function gone(old) {
    if (kept('off') !== mine()) { keep('off', mine()); show('星遇同频', old ? '这个 VRCX 脚本太旧了，去星遇同频「我的资料 → 在 VRCX 里提醒」下载新版替换。' : '星遇同频已断开。想再连上，打开 VRCX 左边的「星遇同频」。', true); }
    if (old) latest = Math.max(latest, V + 1);
    else { token = null; keep('token', null); keep('who', null); dot = 0; stars = pals = map = null; }
    paint();
  }
  async function pair(code) {
    const d = await ask('?vrcx-pair', { code });
    if (!/^[0-9a-f]{48}$/.test(d.token || '')) { const e = new Error('server'); e.say = SAY.server; throw e; }
    token = d.token; keep('token', token); keep('who', JSON.stringify(d.me || {})); since = null; keep('since', null);
    look(true);
  }
  async function unpair() {
    const t = token;
    token = null; keep('token', null); keep('who', null); dot = 0; stars = pals = map = null; clearTimeout(timer);
    paint();
    try { await ask('?vrcx-off', { token: t }); } catch {}
  }
  async function loadLists() {
    if (!token) return;
    listErr = null;
    try {
      const [c, m] = await Promise.all([ask('?vrcx=' + token + '&v=' + V + '&view=cross&mark=1'), ask('?vrcx=' + token + '&v=' + V + '&view=mutual')]);
      stars = Array.isArray(c.stars) ? c.stars : []; pals = Array.isArray(m.stars) ? m.stars : []; dot = 0;
    } catch (err) { if (err.message === 'gone') return gone(false); listErr = err.say || SAY.server; }
    paint();
  }
  let mapAt = null;   // 问的是哪张地图（换了地图，旧的回答就不要了）
  async function loadMap() {
    const h = here();
    mapAt = h && h.world; mapErr = null;
    if (!token || !h) { map = null; return paint(); }
    try { const d = await ask('?vrcx=' + token + '&v=' + V + '&view=map&world=' + h.world); if (mapAt === h.world) map = d; }
    catch (err) { if (err.message === 'gone') return gone(false); if (mapAt === h.world) { map = null; mapErr = err.say; } }
    paint();
  }
  async function rate(score) {
    const h = here();
    if (!h || !map || mapBusy) return;
    mapBusy = true; mapErr = null; paint();
    try { const d = await ask('?vrcx-map', { token, world: h.world, score }); if (mapAt === h.world) map = d; }
    catch (err) { if (err.message === 'gone') { mapBusy = false; return gone(false); } mapErr = err.say; }
    mapBusy = false; paint();
  }

  // ---------- VRCX 左边的「星遇同频」 ----------
  // VRCX 没有给外部留位置：这里把它放进 VRCX 自己的列表；VRCX 改版后放不进去，提醒照样会弹
  const doc = typeof document !== 'undefined' ? document : null;
  let item = null, panel = null, isOpen = false, soon = 0, watch = 0;
  // 星遇同频的图标（对话气泡、井号、落在角上的星），简化成和 VRCX 列表里一样的线条图标
  const MARK = (id, line, fill, star) => `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/>` +
    '<path transform="translate(19 5)" d="M0-4.2Q.45-.45 4.2 0Q.45.45 0 4.2Q-.45.45-4.2 0Q-.45-.45 0-4.2Z" fill="#000" stroke="#000" stroke-width="3" stroke-linejoin="round"/></mask></defs>' +
    `<g mask="url(#${id})"><path d="M5 6h11a2.5 2.5 0 0 1 2.5 2.5v6a2.5 2.5 0 0 1-2.5 2.5h-.5v3.2L12.6 17H5a2.5 2.5 0 0 1-2.5-2.5v-6A2.5 2.5 0 0 1 5 6z" fill="${fill}" stroke="${fill === 'none' ? line : fill}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path d="M9.3 8.8l-.8 6M12.7 8.8l-.8 6M6.5 10.7h7.6M6.1 13h7.6" fill="none" stroke="${line}" stroke-width="1.5" stroke-linecap="round"/></g>` +
    `<path transform="translate(19 5)" d="M0-3.4Q.38-.38 3.4 0Q.38.38 0 3.4Q-.38.38-3.4 0Q-.38-.38 0-3.4Z" fill="${star}"/>`;
  const ICON = '<span class="vrcc-icon"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' + MARK('vrcc-cut', 'currentColor', 'none', 'currentColor') + '</svg><i class="vrcc-dot" hidden></i></span>';
  const LOGO = '<svg class="vrcc-logo" viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><rect width="24" height="24" rx="5.5" fill="#0b1733"/><g transform="translate(2.4 2.6) scale(.8)">' + MARK('vrcc-cut-logo', '#0397fe', '#f4f7ff', '#fff') + '</g></svg>';
  const STAR = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><defs><clipPath id="vrcc-half"><rect width="12" height="24"/></clipPath></defs>' +
    '<path class="vrcc-s0" d="M12 2.8l2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 16.83l-5.5 2.89 1.05-6.12L3.1 9.27l6.15-.9z"/>' +
    '<path class="vrcc-s1" clip-path="url(#vrcc-half)" d="M12 2.8l2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 16.83l-5.5 2.89 1.05-6.12L3.1 9.27l6.15-.9z"/>' +
    '<path class="vrcc-s2" d="M12 2.8l2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 16.83l-5.5 2.89 1.05-6.12L3.1 9.27l6.15-.9z"/></svg>';
  const GROUP = { G: '#4db4ff', W: '#ffb547', Z: '#d69bff', L: '#5fe0b4' };   // 星群的颜色（万象用文字色）
  const CSS = `
#vrcc-item .vrcc-icon { position: relative; display: inline-flex; width: 24px; height: 24px; flex: none; align-items: center; justify-content: center; }
#vrcc-item .vrcc-dot { position: absolute; top: 2px; right: 0; width: 6px; height: 6px; border-radius: 50%; background: #ef4444; }
[data-collapsible="icon"] #vrcc-item .vrcc-label { display: none; }
#vrcc-panel { --vc-fg: var(--foreground, #e9eaee); --vc-mute: var(--muted-foreground, #8d8f99); --vc-line: var(--border, rgba(255,255,255,.1)); --vc-bg: var(--background, #0b0c10); --vc-card: var(--card, rgba(255,255,255,.03)); --vc-hover: var(--accent, rgba(255,255,255,.05));
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 40; overflow: auto; background: var(--vc-bg); color: var(--vc-fg); font-size: 14px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
#vrcc-panel[hidden] { display: none; }
#vrcc-panel * { box-sizing: border-box; }
#vrcc-panel .vrcc-in { max-width: 600px; padding: 28px 32px 48px; }
#vrcc-panel button { margin: 0; font: inherit; cursor: pointer; }
#vrcc-panel .vrcc-head { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0 12px; }
#vrcc-panel .vrcc-logo { grid-row: span 2; display: block; }
#vrcc-panel h2 { margin: 0; font-size: 17px; font-weight: 700; line-height: 1.3; letter-spacing: .01em; }
#vrcc-panel .vrcc-sub { grid-column: 2; margin: 0; color: var(--vc-mute); font-size: 13px; line-height: 1.4; }
#vrcc-panel .vrcc-x { grid-row: 1 / span 2; grid-column: 3; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--vc-mute); font-size: 20px; line-height: 1; }
#vrcc-panel .vrcc-x:hover { background: var(--vc-hover); color: var(--vc-fg); }
#vrcc-panel .vrcc-link { padding: 0; border: 0; background: none; color: var(--vc-mute); font-size: 13px; }
#vrcc-panel .vrcc-link:hover { color: var(--vc-fg); }
#vrcc-panel .vrcc-label { display: flex; align-items: baseline; gap: 8px; margin: 32px 0 10px; color: var(--vc-mute); font-size: 12px; font-weight: 600; letter-spacing: .12em; }
#vrcc-panel .vrcc-label span { font-variant-numeric: tabular-nums; letter-spacing: 0; }
#vrcc-panel .vrcc-card { overflow: hidden; border: 1px solid var(--vc-line); border-radius: 12px; background: var(--vc-card); }
#vrcc-panel .vrcc-row { display: grid; grid-template-columns: 8px 1fr auto; align-items: baseline; gap: 2px 12px; width: 100%; padding: 12px 16px; border: 0; border-top: 1px solid var(--vc-line); background: transparent; color: inherit; text-align: left; }
#vrcc-panel .vrcc-row:first-child { border-top: 0; }
#vrcc-panel .vrcc-row:hover { background: var(--vc-hover); }
#vrcc-panel .vrcc-g { width: 8px; height: 8px; border-radius: 50%; background: var(--vc-fg); transform: translateY(-1px); }
#vrcc-panel .vrcc-name { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
#vrcc-panel .vrcc-name b { font-weight: 600; }
#vrcc-panel .vrcc-name i { margin-left: 6px; color: var(--vc-mute); font-style: normal; font-variant-numeric: tabular-nums; }
#vrcc-panel .vrcc-when { color: var(--vc-mute); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
#vrcc-panel .vrcc-when b { margin-right: 6px; color: #ef4444; font-weight: 600; }
#vrcc-panel .vrcc-intro { grid-column: 2; min-width: 0; overflow: hidden; color: var(--vc-mute); font-size: 13px; white-space: nowrap; text-overflow: ellipsis; }
#vrcc-panel .vrcc-tag { grid-column: 3; color: var(--vc-mute); font-size: 12px; text-align: right; white-space: nowrap; }
#vrcc-panel .vrcc-pal { align-items: center; grid-template-columns: 8px 1fr auto; }
#vrcc-panel .vrcc-pal .vrcc-g { transform: none; }
#vrcc-panel .vrcc-plain { grid-template-columns: 1fr auto; align-items: center; }
#vrcc-panel .vrcc-add { color: #0397fe; font-size: 13px; font-weight: 600; white-space: nowrap; }
#vrcc-panel .vrcc-empty { margin: 0; padding: 20px 16px; color: var(--vc-mute); font-size: 13px; }
#vrcc-panel .vrcc-empty .vrcc-link { margin-left: 8px; text-decoration: underline; text-underline-offset: 3px; }
#vrcc-panel .vrcc-map { padding: 14px 16px 12px; }
#vrcc-panel .vrcc-map h4 { margin: 0; overflow: hidden; font-size: 15px; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; }
#vrcc-panel .vrcc-map .vrcc-meta { margin: 2px 0 0; color: var(--vc-mute); font-size: 13px; }
#vrcc-panel .vrcc-rate { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
#vrcc-panel .vrcc-stars { display: flex; gap: 2px; }
#vrcc-panel .vrcc-stars button { display: block; padding: 0; border: 0; background: none; line-height: 0; }
#vrcc-panel .vrcc-stars svg path { fill: transparent; stroke: none; }
#vrcc-panel .vrcc-stars .vrcc-s0 { fill: var(--vc-line); }
#vrcc-panel .vrcc-stars [data-fill="1"] .vrcc-s1, #vrcc-panel .vrcc-stars [data-fill="2"] .vrcc-s2 { fill: #ffd479; }
#vrcc-panel .vrcc-stars.off { opacity: .4; pointer-events: none; }
#vrcc-panel .vrcc-score { min-width: 3em; color: #ffd479; font-weight: 700; font-variant-numeric: tabular-nums; }
#vrcc-panel .vrcc-score.none { color: var(--vc-mute); font-weight: 400; font-size: 13px; }
#vrcc-panel .vrcc-say { margin: 8px 0 0; color: var(--vc-mute); font-size: 13px; }
#vrcc-panel .vrcc-say.bad { color: #ef4444; }
#vrcc-panel .vrcc-banner { display: flex; align-items: center; gap: 12px; margin-top: 20px; padding: 12px 16px; border: 1px solid var(--vc-line); border-radius: 12px; background: var(--vc-card); font-size: 13px; }
#vrcc-panel .vrcc-banner b { color: #ef4444; font-weight: 600; }
#vrcc-panel .vrcc-banner span { flex: 1; color: var(--vc-mute); }
#vrcc-panel .vrcc-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; margin-top: 16px; }
#vrcc-panel .vrcc-btn { height: 36px; padding: 0 16px; border: 0; border-radius: 8px; background: #0397fe; color: #fff; font-weight: 600; white-space: nowrap; }
#vrcc-panel .vrcc-btn:hover { background: #1aa3ff; }
#vrcc-panel .vrcc-btn[disabled] { opacity: .5; cursor: default; }
#vrcc-panel .vrcc-ghost { height: 36px; padding: 0 14px; border: 1px solid var(--vc-line); border-radius: 8px; background: transparent; color: inherit; white-space: nowrap; }
#vrcc-panel .vrcc-ghost:hover { background: var(--vc-hover); }
#vrcc-panel .vrcc-form { display: flex; gap: 8px; }
#vrcc-panel .vrcc-form input { flex: 0 1 220px; min-width: 0; height: 36px; padding: 0 14px; border: 1px solid var(--vc-line); border-radius: 8px; background: transparent; color: inherit; font: 600 16px/1 ui-monospace, Consolas, monospace; letter-spacing: .18em; outline: none; }
#vrcc-panel .vrcc-form input:focus { border-color: #0397fe; }
#vrcc-panel .vrcc-form input::placeholder { color: var(--vc-mute); font-weight: 400; letter-spacing: .18em; }
#vrcc-panel .vrcc-hint { margin: 10px 0 0; color: var(--vc-mute); font-size: 13px; }
#vrcc-panel .vrcc-err { margin: 10px 0 0; color: #ef4444; font-size: 13px; }`;
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (cls, text, fn) => { const b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', safe(fn)); return b; };
  const label = (text, n) => { const l = el('div', 'vrcc-label'); l.appendChild(el('span', '', text)); if (n) l.appendChild(el('span', '', String(n))); return l; };
  function mount() {
    soon = 0;
    if (!doc) return;
    const menu = doc.querySelector('[data-sidebar="menu"]');
    if (!menu || (item && menu.contains(item))) return;
    if (!doc.getElementById('vrcc-css')) { const st = el('style'); st.id = 'vrcc-css'; st.textContent = CSS; doc.head.appendChild(st); }
    const like = menu.querySelector('[data-sidebar="menu-item"]'), likeBtn = like && like.querySelector('[data-sidebar="menu-button"]');
    item = el('li', like ? like.className : ''); item.id = 'vrcc-item'; item.setAttribute('data-sidebar', 'menu-item');
    const b = btn(likeBtn ? likeBtn.className : '', null, () => toggle(!isOpen)); b.title = '星遇同频'; b.setAttribute('data-sidebar', 'menu-button');
    b.innerHTML = ICON + '<span class="vrcc-label">星遇同频</span>';   // (ours, fixed)
    item.appendChild(b); menu.appendChild(item);
    paint();
  }
  function toggle(on) {
    if (!doc || !item) return;
    isOpen = on;
    if (on && !panel) { panel = el('div'); panel.id = 'vrcc-panel'; doc.body.appendChild(panel); }
    if (panel) panel.hidden = !on;
    item.querySelector('button').setAttribute('data-active', String(on));
    clearInterval(watch); watch = 0;
    if (on) {
      place(); stars = pals = map = null; paint(); loadLists(); loadMap();
      // 开着的时候换了地图：跟着换
      watch = setInterval(safe(() => { const h = here(); if ((h && h.world) !== mapAt) loadMap(); }), 3000);
    }
  }
  function place() {
    const side = item && (item.closest('[data-sidebar="sidebar"]') || item.closest('ul'));
    if (panel && side) panel.style.left = Math.round(side.getBoundingClientRect().right) + 'px';
  }
  const ago = (t) => { const m = Math.max(0, (Date.now() - t) / 60e3); if (m < 60) return m < 1 ? '刚刚' : Math.floor(m) + ' 分钟前'; if (m < 1440) return Math.floor(m / 60) + ' 小时前'; const d = new Date(t); return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日'; };
  // 连接码按 ABCD-EFGH 显示（打的时候自动加横线、变大写）
  const codeShape = (v) => { const c = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); return c.length > 4 ? c.slice(0, 4) + '-' + c.slice(4) : c; };
  // 五颗星，点左半颗是单数：1–10 分（和网页上的地图榜一样）
  function starsFor(score, onPick, off) {
    const box = el('div', 'vrcc-stars' + (off ? ' off' : '')), out = el('span', 'vrcc-score' + (score ? '' : ' none'), score ? score + ' 分' : '点星星打分');
    const fill = (v) => [...box.children].forEach((b, i) => b.setAttribute('data-fill', String(Math.max(0, Math.min(2, v - i * 2)))));
    for (let i = 0; i < 5; i++) {
      const b = btn('', null, null); b.innerHTML = STAR; b.title = (i * 2 + 2) + ' 分';   // (ours, fixed)
      const at = (e) => { const r = b.getBoundingClientRect(); return i * 2 + (e.clientX - r.left < r.width / 2 ? 1 : 2); };
      b.addEventListener('mousemove', (e) => { fill(at(e)); out.textContent = at(e) + ' 分'; out.className = 'vrcc-score'; });
      b.addEventListener('click', safe((e) => onPick(at(e))));
      box.appendChild(b);
    }
    box.addEventListener('mouseleave', () => { fill(score || 0); out.textContent = score ? score + ' 分' : '点星星打分'; out.className = 'vrcc-score' + (score ? '' : ' none'); });
    fill(score || 0);
    const row = el('div', 'vrcc-rate'); row.appendChild(box); row.appendChild(out);
    return row;
  }
  function mapPart(box) {
    const h = here();
    box.appendChild(label('你现在在'));
    const card = el('div', 'vrcc-card'), m = el('div', 'vrcc-map');
    card.appendChild(m); box.appendChild(card);
    if (!h) { m.appendChild(el('p', 'vrcc-meta', '在 VRChat 里进一张地图，这里就能直接给它打分。')); return; }
    m.appendChild(el('h4', '', (map && map.name) || h.name || '这张地图'));
    if (!map) { m.appendChild(el('p', 'vrcc-say' + (mapErr ? ' bad' : ''), mapErr || '读取中…')); return; }
    m.appendChild(el('p', 'vrcc-meta', map.off ? '这张地图不在你所在星池的地图榜上。'
      : map.board ? (map.raters ? '地图榜 ' + Number(map.avg).toFixed(1) + ' 分 · ' + map.raters + ' 人打分' : '在地图榜上，还没有人打分')
      : map.pending ? '审核中，通过后就上地图榜' : '还不在地图榜上，打分后由你添加'));
    if (map.off) return;
    m.appendChild(starsFor(map.mine, rate, !map.can || mapBusy));
    const say = mapBusy ? '提交中…' : mapErr || (!map.can ? NEED[map.need] || NEED.go : map.mine ? '已打分，改分直接点星星。' : '');
    if (say) m.appendChild(el('p', 'vrcc-say' + (mapErr || !map.can ? ' bad' : ''), say));
    if (map.board) { const go = btn('vrcc-link', '在地图榜看看 ↗', () => openSite('/match/?map=' + h.world)); go.style.marginTop = '6px'; m.appendChild(go); }
  }
  function listPart(box) {
    box.appendChild(label('星轨相交', stars && stars.length));
    const card = el('div', 'vrcc-card');
    if (!stars) {
      const p = el('p', 'vrcc-empty', listErr || '读取中…');
      if (listErr) p.appendChild(btn('vrcc-link', '重试', () => { listErr = null; paint(); loadLists(); }));
      card.appendChild(p);
    } else if (!stars.length) card.appendChild(el('p', 'vrcc-empty', '在 VRChat 和其他星遇玩家待过同一个房间，TA 会出现在这里。'));
    else for (const s of stars) {
      const row = btn('vrcc-row', null, () => openSite('/match/?tab=inbox&cross=' + (+s.n || ''))); row.title = '在浏览器里打开';
      const g = el('i', 'vrcc-g'); if (GROUP[s.group]) g.style.background = GROUP[s.group];
      const name = el('span', 'vrcc-name'); name.appendChild(el('b', '', String(s.vrc || s.name || '')));
      const sub = [s.vrc ? s.name : '', s.star ? '★' + s.star : ''].filter(Boolean).join(' ');
      if (sub) name.appendChild(el('i', '', sub));
      const when = el('span', 'vrcc-when'); if (s.fresh) when.appendChild(el('b', '', '新')); when.appendChild(doc.createTextNode(ago(+s.at || 0)));
      row.appendChild(g); row.appendChild(name); row.appendChild(when);
      row.appendChild(el('span', 'vrcc-intro', String(s.intro || s.line || '')));
      row.appendChild(el('span', 'vrcc-tag', s.mutual ? '互相连上' : s.linked ? '你连了 TA' : ''));
      card.appendChild(row);
    }
    box.appendChild(card);
    // 互相连上：VRChat 名字；不是 VRCX 好友的，点一下打开 VRCX 自己的玩家窗口去加
    if (pals && pals.length) {
      box.appendChild(label('互相连上', pals.length));
      const card2 = el('div', 'vrcc-card');
      for (const s of pals) {
        const fr = s.vrcUser && isFriend(s.vrcUser);
        const row = btn('vrcc-row vrcc-pal', null, () => (s.vrcUser ? launch('user/' + s.vrcUser, 'https://vrchat.com/home/user/' + s.vrcUser) : openSite('/match/?tab=inbox')));
        row.title = s.vrcUser ? '在 VRCX 里打开 TA 的资料' : '在浏览器里打开';
        const g = el('i', 'vrcc-g'); if (GROUP[s.group]) g.style.background = GROUP[s.group];
        const name = el('span', 'vrcc-name'); name.appendChild(el('b', '', String(s.vrc || s.name || '')));
        const sub = [s.name, s.star ? '★' + s.star : ''].filter(Boolean).join(' ');
        if (sub) name.appendChild(el('i', '', sub));
        row.appendChild(g); row.appendChild(name);
        row.appendChild(el('span', s.vrcUser && !fr ? 'vrcc-add' : 'vrcc-when', fr ? '已是好友' : s.vrcUser ? '加好友 ›' : '看资料 ↗'));
        card2.appendChild(row);
      }
      box.appendChild(card2);
    }
  }
  function groupPart(box) {
    box.appendChild(label('社区'));
    const card = el('div', 'vrcc-card'), joined = inGroup();
    const row = btn('vrcc-row vrcc-plain', null, () => launch('group/' + GROUP_ID, 'https://vrchat.com/home/group/' + GROUP_ID));
    row.title = '在 VRCX 里打开群组';
    row.appendChild(el('span', 'vrcc-name', 'VRChat 中文社区 VRCC 的 VRChat 群组'));
    row.appendChild(el('span', joined ? 'vrcc-when' : 'vrcc-add', joined ? '已加入' : '加入 ›'));
    card.appendChild(row); box.appendChild(card);
  }
  function paint() {
    if (!doc || !item) return;
    try {
      const d = item.querySelector('.vrcc-dot'); if (d) d.hidden = !((token && dot > 0) || latest > V);
      if (!panel || panel.hidden) return;
      let who = {}; try { who = JSON.parse(kept('who') || '{}') || {}; } catch {}
      const box = el('div', 'vrcc-in'), head = el('div', 'vrcc-head');
      head.insertAdjacentHTML('beforeend', LOGO);   // (ours, fixed)
      head.appendChild(el('h2', '', '星遇同频'));
      head.appendChild(btn('vrcc-x', '×', () => toggle(false))).title = '关闭';
      head.appendChild(el('p', 'vrcc-sub', token ? '已连接' + (who.star ? ' · ★' + who.star : '') + (who.vrc ? ' ' + who.vrc : '') : '在 VRCX 里收提醒、给地图打分、看星轨相交'));
      box.appendChild(head);
      if (latest > V) {   // 有新版本
        const b = el('div', 'vrcc-banner'); b.appendChild(el('b', '', '有新版本')); b.appendChild(el('span', '', '下载后替换 custom.js，重启 VRCX，不用重新连接。'));
        b.appendChild(btn('vrcc-ghost', '去下载 ↗', () => openSite('/match/?tab=me&vrcx'))); box.appendChild(b);
      }
      if (!token) {
        box.appendChild(label('连接码'));
        const form = el('form', 'vrcc-form'), input = el('input'), go = el('button', 'vrcc-btn', '连接'), err = el('p', 'vrcc-err');
        input.placeholder = 'ABCD-EFGH'; input.maxLength = 9; input.autocomplete = 'off'; input.spellcheck = false; go.type = 'submit'; err.hidden = true;
        input.addEventListener('input', () => { const v = codeShape(input.value); if (v !== input.value) input.value = v; });
        form.addEventListener('submit', safe(async (e) => {
          e.preventDefault();
          const code = input.value.replace(/-/g, '');
          if (code.length !== 8) { err.textContent = '连接码是 8 位。'; err.hidden = false; return; }
          go.disabled = true; err.hidden = true;
          try { await pair(code); loadLists(); loadMap(); } catch (er) { err.textContent = er.say || SAY.server; err.hidden = false; go.disabled = false; }
        }));
        form.appendChild(input); form.appendChild(go); box.appendChild(form);
        box.appendChild(el('p', 'vrcc-hint', '在星遇同频「我的资料 → 在 VRCX 里提醒」获取，10 分钟内有效。'));
        box.appendChild(err);
        groupPart(box);
        setTimeout(() => { try { input.focus(); } catch {} }, 0);
      } else {
        mapPart(box);
        listPart(box);
        groupPart(box);
        const foot = el('div', 'vrcc-foot');
        foot.appendChild(btn('vrcc-ghost', '打开星遇同频 ↗', () => openSite('/match/?tab=inbox&cross')));
        const test = btn('vrcc-ghost', '试一下提醒', () => { show('星遇同频', '这是一条测试提醒。看到它，就说明 VRCX 提醒是通的。', true); test.textContent = '已弹出'; setTimeout(() => { test.textContent = '试一下提醒'; }, 3000); });
        foot.appendChild(test);
        const off = btn('vrcc-link', '断开', () => { if (off.dataset.sure) unpair(); else { off.dataset.sure = '1'; off.textContent = '再点一次断开'; } });
        off.style.marginLeft = 'auto'; foot.appendChild(off);
        box.appendChild(foot);
      }
      panel.replaceChildren(box);
    } catch (err) {
      warn(err);
      // 画不出来时至少留一个能关掉、能重试的面板
      if (panel && !panel.hidden) { panel.textContent = ''; const p = el('p', 'vrcc-empty', '「星遇同频」出了点问题。'); p.appendChild(btn('vrcc-link', '重试', () => paint())); p.appendChild(btn('vrcc-link', '关闭', () => toggle(false))); panel.appendChild(p); }
    }
  }
  if (doc) {
    try {
      // VRCX 重画左边的列表时，「星遇同频」可能被拿掉：看到就放回去
      new MutationObserver(() => { if (!soon && (!item || !item.isConnected)) soon = requestAnimationFrame(safe(mount)); }).observe(doc.body, { childList: true, subtree: true });
      // 点 VRCX 自己的页面，或者按 Esc：收起来
      doc.addEventListener('click', safe((e) => { if (isOpen && e.target.closest && e.target.closest('[data-sidebar="menu-button"]') && !e.target.closest('#vrcc-item')) toggle(false); }), true);
      doc.addEventListener('keydown', safe((e) => { if (isOpen && e.key === 'Escape') toggle(false); }));
      window.addEventListener('resize', safe(() => { if (isOpen) place(); }));
      safe(mount)();
    } catch (err) { warn(err); }
  }
  if (token) setTimeout(safe(() => look(true)), 5000 + Math.random() * 10000);
})();
/* ===== 星遇同频 VRCX 提醒 · 结束 ===== */
