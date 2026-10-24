/* ===== 星遇同频 VRCX 提醒 · 开始（这一段请原样保留：改过的通不过星遇同频网页上的「检查」） ===== */
/* 星遇同频 · VRCX 提醒 v4 —— https://vrcc.cc/match/
 *
 * 在 VRCX 左边加一个「星遇同频」。在那里填上星遇同频「我的资料 → 在 VRCX 里提醒」给的连接码，连上以后：
 *   - 星遇同频的提醒（擦肩、有人连你、星搭快开始……，和手机上收到的推送一样）弹在 VRCX 里：不戴头显时在电脑右下角；
 *     戴着头显时，按你在 VRCX「通知」里的设置，进 VRCX 自己的浮层、XSOverlay 或 OVR Toolkit；最近一天的提醒可以在顶上「最近的提醒」里补看；
 *   - 你在 VRChat 里待的那张地图：看图、看地图榜上的分，直接打分、写一句短评（地图榜还没有它的，由你添加）；
 *   - 看和你星轨相交的星、互相连上的星；加好友是打开 VRCX 自己的玩家窗口，由你自己点。
 *
 * 它只连星遇同频：用连上时拿到的提醒令牌，每分钟左右问一次有没有新提醒。VRCX 启动时问一次，之后只在 VRChat 开着时才问。
 * 这个令牌能读的：你的提醒（最近一天）、星轨相交（用不了时的原因）、互相连上、你所在地图在地图榜上的样子（分数、图）。
 * 能做的：给地图打分并带一句短评（和网页地图榜一样检查）、把星轨相交和最近的提醒标成看过、断开自己。
 * 告诉星遇同频的：打开「星遇同频」时（开着时换了地图也一样），你所在地图的 ID，用来查它在地图榜上的样子；
 *   打分时，那张地图、你的分和短评。别的都不发。
 * 只在你电脑上用、不告诉星遇同频的：你在哪个房间（只取地图 ID，见上）、VRCX 的好友名单和谁在线（写「已是好友」「在线」、
 *   在线的排前面）、你加没加中文社区的群组、VRCX 存着的地图缩略图。
 * 它不读 VRCX 的登录信息，不替你向 VRChat 发任何东西，不读你电脑上的文件，不运行收到的任何内容（收到的都只当文字显示）；
 * 只在你点的时候打开 VRCX 自己的玩家、群组、地图窗口。
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
  const V = 4, API = SITE + '/api/match', K = 'vrcc-vrcx-';
  const GROUP_ID = 'grp_a72a2c19-3305-4695-b83e-e7ffadcd529e';   // VRChat 中文社区的 VRChat 群组
  const warn = (err) => { try { console.warn('[星遇同频]', err && err.message ? err.message : err); } catch {} };
  const safe = (fn) => (...a) => { try { const r = fn(...a); if (r && typeof r.catch === 'function') r.catch(warn); return r; } catch (err) { warn(err); } };
  const kept = (k) => { try { return localStorage.getItem(K + k); } catch { return null; } };
  const keep = (k, v) => { try { if (v === null) localStorage.removeItem(K + k); else localStorage.setItem(K + k, String(v)); } catch {} };
  let token = /^[0-9a-f]{48}$/.test(kept('token') || '') ? kept('token') : null;
  let since = null, dot = 0, timer = 0, latest = V;  // since null: never asked yet (the first answer only says where things stand)
  let stars = null, pals = null, recent = null, recentRead = 0, drawer = false, listErr = null, crossWhy = null;   // 星轨相交、互相连上、最近的提醒（打开「星遇同频」时问一次）；星轨相交用不了的原因
  let map = null, mapErr = null, mapBusy = false;   // 你所在的地图（打开时、换地图时问）
  { const k = kept('since'); if (k !== null && Number.isFinite(+k)) since = +k; }
  const mine = () => (token || '').slice(0, 8);   // 这一次连接（重新连接会换）

  // ---------- 和星遇同频说话：网络断了、服务器出错、太频繁，都变成一句能看懂的话 ----------
  const SAY = {
    offline: '暂时无法连接星遇同频，请检查网络，稍后将自动重试。', server: '星遇同频暂时无法响应，请稍后再试。', too_many: '您今天的次数已用完，请明天再试。',
    code: '连接码有误或已过期，请在网页上重新获取。', yq_wait: '您的星正在审核中，审核通过后即可打分。', yq_paused: '您的星已暂停，暂时无法打分。', yq_off: '地图榜暂时关闭。',
    map_off: '这张地图已从地图榜下架。', xd_world: '无法读取这张地图，它可能不是公开地图。', xd_world_no: '这张地图不在您所在星池的地图榜上。',
    xd_search: '暂时无法读取这张地图的信息，请稍后再试。', bad_request: '操作未成功，请稍后再试。',
    busy: '连接功能暂停，请明天再试。', yq_empty: '请写一句再发布。', yq_words: '这句话不能发布，请修改后再试。', map_elsewhere: '我们注意到您几分钟前还在另一张地图，请稍后再试。'
  };
  const BOT = '「VRCC的小助手」';
  const WHY = {
    verify: ['使用星轨相交需要先验证 VRChat 名字，机器人才能看到您所在的房间。', '去验证'], wait: ['您的 VRChat 名字正在验证中，验证成功后即可使用。', '查看进度'],
    queued: [`机器人${BOT}的好友请求即将发出，收到后请在 VRChat 通知中同意。`, ''], sent: [`请在 VRChat 通知中同意${BOT}的好友请求，机器人才能看到您所在的房间。`, ''],
    gone: ['您已在 VRChat 中删除了机器人好友，请重新开启并同意好友请求。', '去开启'], friend: ['您关闭了机器人好友，开启并同意好友请求后即可使用。', '去开启']
  };
  const NEED = { verify: '打分前请先在星遇同频「我的资料 → VRChat 名字」验证您的 VRChat 账号。', friend: `打分前请先在 VRChat 中同意机器人${BOT}的好友请求。`, go: '机器人暂未看到您在 VRChat 中在线，请稍后再试。' };
  async function ask(path, body) {
    let r;
    try {
      r = await fetch(API + path, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'omit',   // POST 用纯文本：不用预检
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined });
    } catch { const e = new Error('offline'); e.say = SAY.offline; throw e; }
    const d = await r.json().catch(() => ({}));
    if (r.ok) return d;
    const code = r.status === 404 && d.error === 'gone' ? 'gone' : d.error || (r.status >= 500 ? 'server' : 'bad_request');
    const e = new Error(code); e.status = r.status; e.data = d; e.say = code === 'map_not_went' ? NEED[d.need] || NEED.go : code === 'yq_words' && typeof d.why === 'string' ? d.why.slice(0, 80) : SAY[code] || SAY.server;
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
  // VRCX 好友：在不在 VRCX 的好友名单里、此刻在不在 VRChat 里（只在这台电脑上看，不告诉星遇同频）
  const friendOf = (id) => { try { const f = S().friend, c = f && f.friends && typeof f.friends.get === 'function' ? f.friends.get(id) : null; return c ? (c.state === 'online' ? 'online' : 'friend') : null; } catch { return null; } };
  const inGroup = () => { try { const g = S().group; return !!(g && g.currentUserGroups && typeof g.currentUserGroups.has === 'function' && g.currentUserGroups.has(GROUP_ID)); } catch { return false; } };
  // 地图的图：VRCX 存着的这张地图的缩略图（VRChat 的图片地址），没有就用地图榜的（地图榜上通过了的才有）
  const worldPic = (id) => {
    try { const w = S().world, r = w && w.cachedWorlds && typeof w.cachedWorlds.get === 'function' ? w.cachedWorlds.get(id) : null, u = r && (r.thumbnailImageUrl || r.imageUrl); if (typeof u === 'string' && /^https:\/\//.test(u)) return u; } catch {}
    return map && map.world === id && /^\/api\/match\?xdimg=wrld_[0-9a-f-]{36}$/.test(String(map.img || '')) ? SITE + map.img : null;
  };
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
        if (kept('hello') !== mine()) { keep('hello', mine()); show('星遇同频', '您的 VRCX 已与星遇同频连接，之后的提醒将显示在这里。', true); }
        const fresh = since !== null && Array.isArray(d.items) && d.items.length > 0, had = latest;
        if (fresh) for (const x of d.items.slice(-3)) show(x.title, x.body);
        if (Number.isFinite(+d.last)) { since = +d.last; keep('since', since); }
        if (Number.isFinite(+d.dot)) dot = +d.dot;
        if (+d.latest > V) {   // 有新版本：说一次，入口一直带红点
          latest = +d.latest;
          if (kept('stale') !== String(latest)) { keep('stale', latest); show('星遇同频', '星遇同频的 VRCX 脚本已有新版本，请在「我的资料 → 在 VRCX 里提醒」下载替换，无需重新连接。', true); }
        }
        if (+d.every >= 30) wait = d.every * 1000 + Math.random() * 20000;
        // 面板开着、来了新提醒或新的星轨相交：重新拉列表；否则只动红点，不重画面板（鼠标停着的分数、「再点一次断开」不会被冲掉）
        if (isOpen && (fresh || dot > 0)) loadLists(); else if (latest !== had) paint(); else dotPaint();
      }
    } catch (err) {
      if (err.message === 'gone') return gone(false);
      if (err.status === 429) wait = 5 * 60000;
    }
    timer = setTimeout(safe(look), wait);
  }
  // 令牌失效（在网页上断开了，或在别的电脑上连了），或者这个文件太旧：说一次，停下
  function gone(old) {
    if (kept('off') !== mine()) { keep('off', mine()); show('星遇同频', old ? '您的 VRCX 脚本版本过旧，请在星遇同频「我的资料 → 在 VRCX 里提醒」下载新版替换。' : '您的 VRCX 已与星遇同频断开，如需继续接收提醒，请在左侧「星遇同频」重新连接。', true); }
    if (old) latest = Math.max(latest, V + 1);
    else { token = null; keep('token', null); keep('who', null); dot = 0; stars = pals = map = crossWhy = recent = null; }
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
    token = null; keep('token', null); keep('who', null); dot = 0; stars = pals = map = crossWhy = recent = null; clearTimeout(timer);
    paint();
    try { await ask('?vrcx-off', { token: t }); } catch {}
  }
  async function loadLists() {
    if (!token) return;
    listErr = null;
    try {
      const [c, m, r] = await Promise.all([ask('?vrcx=' + token + '&v=' + V + '&view=cross&mark=1'), ask('?vrcx=' + token + '&v=' + V + '&view=mutual'), ask('?vrcx=' + token + '&v=' + V + '&view=recent')]);
      recent = Array.isArray(r.items) ? r.items : []; recentRead = +r.read || 0;
      stars = Array.isArray(c.stars) ? c.stars : []; pals = Array.isArray(m.stars) ? m.stars : []; dot = 0;
      crossWhy = c.why === 'hide' || WHY[c.why] ? c.why : null;
      if (c.me && typeof c.me === 'object') keep('who', JSON.stringify({ star: c.me.star || null, vrc: c.me.vrc || null }));   // 名字以现在的为准
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
  // 打分；text：同时带一句短评（和网页一样 30 字、一样的检查；空的是删掉），不带就只改分、短评留着
  async function rate(score, text) {
    const h = here();
    if (!h || !map || mapBusy) return;
    mapBusy = true; mapErr = null; paint();
    try { const d = await ask('?vrcx-map', { token, world: h.world, score, ...(typeof text === 'string' ? { text } : {}) }); if (mapAt === h.world) map = d; }
    catch (err) { if (err.message === 'gone') { mapBusy = false; return gone(false); } mapErr = err.say; }
    mapBusy = false; paint();
  }

  // ---------- VRCX 左边的「星遇同频」 ----------
  // VRCX 没有给外部留位置：这里把它放进 VRCX 自己的列表；VRCX 改版后放不进去，提醒照样会弹
  const doc = typeof document !== 'undefined' ? document : null;
  let item = null, panel = null, isOpen = false, soon = 0, watch = 0;
  // 星遇同频的图标，和网站的 App 图标（tools/match-icon.html）同一个画法：白色对话气泡、中文社区 logo 里的蓝色井号
  // （assets/logo.svg 的 #，和 assets/favicon.svg 一样）、落在右上角的星，星在气泡上切出一道细缝。按 512 的画布画，缩到 24。
  // 列表里的小图标（bubble 为 none）：气泡只描边，井号和星用文字色，放大到占满 24 的格子，和 VRCX 列表里别的线条图标一样大
  const SPARK = 'M0-58Q6.5-6.5 58 0Q6.5 6.5 0 58Q-6.5 6.5-58 0Q-6.5-6.5 0-58Z';
  const MARK = (id, hash, bubble, star) => `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><rect width="512" height="512" fill="#fff"/>` +
    `<path transform="translate(382 138)" d="${SPARK}" fill="#000" stroke="#000" stroke-width="22" stroke-linejoin="round"/></mask></defs>` +
    `<g transform="${bubble === 'none' ? 'translate(-4.05 -3.35) scale(.0615)' : 'scale(.046875)'}"><g mask="url(#${id})"><g transform="translate(60.4 105.6) scale(5.4)">` +
    `<path d="M10 6h44a6 6 0 0 1 6 6v30a6 6 0 0 1-6 6h-3v10L39 48H10a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6z" fill="${bubble}"${bubble === 'none' ? ` stroke="${hash}" stroke-width="6.4" stroke-linejoin="round"` : ''}/>` +
    `<path transform="translate(15.2 12.4) scale(0.96) translate(-13.46 -46.5)" fill="${hash}" d="M47.44,53.18c-.55.01-4.63,0-4.63,0,0,0-.66,0-.51-.85.02-.12.62-4.32.65-4.49,0,0,.03-.38.05-.6.02-.26-.44-.7-.75-.7-.6,0-.83,0-1.21,0-.42,0-.85.23-.94,1.02-.09.81-.59,5.09-.59,5.09,0,0-.05.64-.86.7-.81.06-12.11-.05-12.11-.05,0,0-.92.24-.74-.86.19-1.13.79-4.45.79-4.76s.16-1.18-.7-1.18h-1.5s-.68-.08-.8.8c-.03.24-.7,5.16-.7,5.16,0,0-.12.57-.5.59-.39.01-6.05.08-6.05.08,0,0-.51.03-.5.5,0,.47-.08,2.01-.08,2.01,0,0,.08.37.5.37s5.24.02,5.24.02c0,0,.69.03.64.7-.08,1.06-1.52,10-1.52,10,0,0-.1.6-.76.6s-5.17,0-5.17,0c0,0-1.12-.11-1.12.8,0,.46-.11,1.23-.11,1.23,0,0,0,.6.8.7.44.05,5.09.02,5.09.02,0,0,.72.1.67.59-.1.92-.73,5.01-.73,5.01,0,0-.19,1.08.64,1.12.49.03,1.12.05,1.12.05,0,0,.81.14.89-.65.09-.8.84-5.37.84-5.37,0,0,.15-.76,1.01-.76s6.06.06,6.06.06c0,0,6.56-.56,6.42,6.24,0,.11.02.67.58.64.18,0,.82,0,.97,0,.41-.01.67-.34.7-.64.07-.67.74-5.15.74-5.15,0,0,.16-1.1,1.09-1.1s4.71-.02,4.71-.02c0,0,1.04-.02,1.09-.65.05-.73.09-1.33.09-1.33,0,0,0-.86-1.04-.86-.57,0-4.59.1-4.59.1,0,0-.54.1-.5-.77.04-.87,1.51-9.82,1.51-9.82,0,0,.12-.72.76-.72s5.15.02,5.15.02c0,0,.87-.03.91-.8.04-.69.11-1.23.11-1.23,0,0,.06-.88-1.12-.86ZM37.27,66.35c-.07,1.25-1.2,1.02-1.2,1.02,0,0-10.91-.05-11.74-.05s-.84-.94-.84-.94c0,0,1.42-9.05,1.6-9.74.18-.69,1.09-.64,1.09-.64,0,0,10.52.05,11.51.05s1.01.81,1.01.81c0,0-1.36,8.24-1.43,9.49Z"/>` +
    `</g></g><path transform="translate(382 138)" d="${SPARK}" fill="${star}"/></g>`;
  const ICON = '<span class="vrcc-icon"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' + MARK('vrcc-cut', 'currentColor', 'none', 'currentColor') + '</svg><i class="vrcc-dot" hidden></i></span>';
  const LOGO = '<svg class="vrcc-logo" viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><rect width="24" height="24" rx="5.5" fill="#0b1733"/>' + MARK('vrcc-cut-logo', '#0397fe', '#fff', '#fff') + '</svg>';
  const STAR = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><defs><clipPath id="vrcc-half"><rect width="12" height="24"/></clipPath></defs>' +
    '<path class="vrcc-s0" d="M12 2.8l2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 16.83l-5.5 2.89 1.05-6.12L3.1 9.27l6.15-.9z"/>' +
    '<path class="vrcc-s1" clip-path="url(#vrcc-half)" d="M12 2.8l2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 16.83l-5.5 2.89 1.05-6.12L3.1 9.27l6.15-.9z"/>' +
    '<path class="vrcc-s2" d="M12 2.8l2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 16.83l-5.5 2.89 1.05-6.12L3.1 9.27l6.15-.9z"/></svg>';
  const GROUP = { G: '#4db4ff', W: '#ffb547', Z: '#d69bff', L: '#5fe0b4' };   // 星群的颜色（万象用文字色）
  const CSS = `
#vrcc-item .vrcc-icon { position: relative; display: inline-flex; width: 24px; height: 24px; flex: none; align-items: center; justify-content: center; }
#vrcc-item .vrcc-dot { position: absolute; top: 2px; right: 0; width: 6px; height: 6px; border-radius: 50%; background: #ef4444; }
[data-collapsible="icon"] #vrcc-item .vrcc-label { display: none; }
html.vrcc-open [data-sidebar="menu-button"][data-active="true"]:not(#vrcc-item *):not(:hover) { background: transparent !important; color: inherit !important; font-weight: inherit !important; }
#vrcc-panel { --vc-fg: var(--foreground, #e9eaee); --vc-mute: var(--muted-foreground, #8d8f99); --vc-line: var(--border, rgba(255,255,255,.1)); --vc-bg: var(--background, #0b0c10); --vc-card: var(--card, rgba(255,255,255,.03)); --vc-hover: var(--accent, rgba(255,255,255,.05));
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 40; overflow: auto; background: var(--vc-bg); color: var(--vc-fg); font-size: 14px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
#vrcc-panel { --vc-gold: #ffd479; --vc-ok: #4ade80; }
html:not(.dark) #vrcc-panel { --vc-gold: #c98a00; --vc-ok: #16a34a; }   /* VRCX 的浅色主题：黄、绿在白底上看不清，深一点 */
#vrcc-panel[hidden] { display: none; }
#vrcc-panel * { box-sizing: border-box; }
#vrcc-panel .vrcc-in { max-width: 600px; padding: 28px 32px 48px; }
#vrcc-panel .vrcc-in[data-cols="2"] { max-width: 1040px; }
#vrcc-panel .vrcc-in[data-cols="3"] { max-width: 1440px; }
#vrcc-panel .vrcc-cols { display: grid; grid-template-columns: repeat(var(--vc-cols, 1), minmax(0, 1fr)); gap: 0 24px; align-items: start; }
#vrcc-panel button { margin: 0; font: inherit; cursor: pointer; }
#vrcc-panel .vrcc-head { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 0 12px; }
#vrcc-panel .vrcc-bell { grid-row: 1 / span 2; grid-column: 3; display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px; font-size: 13px; }
#vrcc-panel .vrcc-n { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #ef4444; color: #fff; font-size: 11px; font-weight: 700; line-height: 18px; text-align: center; font-variant-numeric: tabular-nums; }
#vrcc-panel .vrcc-drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 1; width: min(380px, 100%); overflow: auto; padding: 24px 20px; border-left: 1px solid var(--vc-line); background: var(--vc-bg); }
#vrcc-panel .vrcc-dhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; font-size: 15px; }
#vrcc-panel .vrcc-drawer .vrcc-x { grid: none; }
#vrcc-panel .vrcc-drawer .vrcc-name { white-space: normal; }
#vrcc-panel .vrcc-logo { grid-row: span 2; display: block; }
#vrcc-panel h2 { margin: 0; font-size: 17px; font-weight: 700; line-height: 1.3; letter-spacing: .01em; }
#vrcc-panel .vrcc-sub { grid-column: 2; margin: 0; color: var(--vc-mute); font-size: 13px; line-height: 1.4; }
#vrcc-panel .vrcc-x { grid-row: 1 / span 2; grid-column: 4; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--vc-mute); font-size: 20px; line-height: 1; }
#vrcc-panel .vrcc-x:hover { background: var(--vc-hover); color: var(--vc-fg); }
#vrcc-panel .vrcc-link { padding: 0; border: 0; background: none; color: var(--vc-mute); font-size: 13px; }
#vrcc-panel .vrcc-link:hover { color: var(--vc-fg); }
#vrcc-panel .vrcc-label { display: flex; align-items: baseline; gap: 8px; margin: 32px 0 10px; color: var(--vc-mute); font-size: 12px; font-weight: 600; letter-spacing: .12em; }
#vrcc-panel .vrcc-label span { font-variant-numeric: tabular-nums; letter-spacing: 0; }
#vrcc-panel .vrcc-card { overflow: hidden; border: 1px solid var(--vc-line); border-radius: calc(var(--radius, .625rem) + 2px); background: var(--vc-card); }
#vrcc-panel .vrcc-row { display: grid; grid-template-columns: 8px 1fr auto; align-items: baseline; gap: 2px 12px; width: 100%; padding: 12px 16px; border: 0; border-top: 1px solid var(--vc-line); background: transparent; color: inherit; text-align: left; }
#vrcc-panel .vrcc-row:first-child { border-top: 0; }
#vrcc-panel .vrcc-row:hover { background: var(--vc-hover); }
#vrcc-panel .vrcc-still:hover { background: transparent; }
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
#vrcc-panel .vrcc-on { color: var(--vc-ok); font-size: 12px; font-weight: 600; white-space: nowrap; }
#vrcc-panel button:focus-visible, #vrcc-panel input:focus-visible, #vrcc-item button:focus-visible { outline: 2px solid var(--ring, #0397fe); outline-offset: 2px; }
#vrcc-panel .vrcc-row:focus-visible { outline-offset: -2px; }
#vrcc-panel .vrcc-empty { margin: 0; padding: 20px 16px; color: var(--vc-mute); font-size: 13px; }
#vrcc-panel .vrcc-empty .vrcc-link { margin-left: 8px; text-decoration: underline; text-underline-offset: 3px; }
#vrcc-panel .vrcc-map { padding: 14px 16px 12px; }
#vrcc-panel .vrcc-pic { display: block; width: 100%; height: 168px; object-fit: cover; border-bottom: 1px solid var(--vc-line); cursor: pointer; }
#vrcc-panel .vrcc-mname { max-width: 100%; overflow: hidden; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; white-space: nowrap; text-overflow: ellipsis; vertical-align: top; }
#vrcc-panel .vrcc-mname:hover { text-decoration: underline; text-underline-offset: 3px; }
#vrcc-panel .vrcc-mtop { display: flex; align-items: baseline; gap: 12px; }
#vrcc-panel .vrcc-mtop h4 { flex: 1; min-width: 0; }
#vrcc-panel .vrcc-big { color: var(--vc-gold); font-size: 22px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
#vrcc-panel .vrcc-map h4 { margin: 0; overflow: hidden; font-size: 15px; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; }
#vrcc-panel .vrcc-map .vrcc-meta { margin: 2px 0 0; color: var(--vc-mute); font-size: 13px; }
#vrcc-panel .vrcc-rate { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
#vrcc-panel .vrcc-stars { display: flex; gap: 2px; }
#vrcc-panel .vrcc-stars button { display: block; padding: 0; border: 0; background: none; line-height: 0; }
#vrcc-panel .vrcc-stars svg path { fill: transparent; stroke: none; }
#vrcc-panel .vrcc-stars .vrcc-s0 { fill: var(--vc-line); }
#vrcc-panel .vrcc-stars [data-fill="1"] .vrcc-s1, #vrcc-panel .vrcc-stars [data-fill="2"] .vrcc-s2 { fill: var(--vc-gold); }
#vrcc-panel .vrcc-stars.off { opacity: .4; pointer-events: none; }
#vrcc-panel .vrcc-score { min-width: 3em; color: var(--vc-gold); font-weight: 700; font-variant-numeric: tabular-nums; }
#vrcc-panel .vrcc-score.none { color: var(--vc-mute); font-weight: 400; font-size: 13px; }
#vrcc-panel .vrcc-say { margin: 8px 0 0; color: var(--vc-mute); font-size: 13px; }
#vrcc-panel .vrcc-say.bad { color: #ef4444; }
#vrcc-panel .vrcc-banner { display: flex; align-items: center; gap: 12px; margin-top: 20px; padding: 12px 16px; border: 1px solid var(--vc-line); border-radius: 12px; background: var(--vc-card); font-size: 13px; }
#vrcc-panel .vrcc-banner b { color: #ef4444; font-weight: 600; }
#vrcc-panel .vrcc-banner span { flex: 1; color: var(--vc-mute); }
#vrcc-panel .vrcc-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; margin-top: 16px; }
#vrcc-panel .vrcc-btn { height: 36px; padding: 0 16px; border: 0; border-radius: calc(var(--radius, .625rem) - 2px); background: var(--primary, #e9eaee); color: var(--primary-foreground, #18181b); font-weight: 600; white-space: nowrap; }
#vrcc-panel .vrcc-btn:hover { opacity: .9; }
#vrcc-panel .vrcc-btn[disabled] { opacity: .5; cursor: default; }
#vrcc-panel .vrcc-ghost { height: 36px; padding: 0 14px; border: 1px solid var(--vc-line); border-radius: calc(var(--radius, .625rem) - 2px); background: transparent; color: inherit; white-space: nowrap; }
#vrcc-panel .vrcc-ghost:hover { background: var(--vc-hover); }
#vrcc-panel .vrcc-form { display: flex; gap: 8px; }
#vrcc-panel .vrcc-form input { flex: 0 1 220px; min-width: 0; height: 36px; padding: 0 14px; border: 1px solid var(--vc-line); border-radius: 8px; background: transparent; color: inherit; font: 600 16px/1 ui-monospace, Consolas, monospace; letter-spacing: .18em; outline: none; }
#vrcc-panel .vrcc-form input:focus { border-color: #0397fe; }
#vrcc-panel .vrcc-words { margin-top: 10px; }
#vrcc-panel .vrcc-words input { flex: 1 1 auto; font: inherit; font-size: 13px; letter-spacing: 0; }
#vrcc-panel .vrcc-words input::placeholder { letter-spacing: 0; }
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
    if (on && !panel) {
      panel = el('div'); panel.id = 'vrcc-panel'; doc.body.appendChild(panel);
      // 面板变宽变窄时，栏数变了就重画
      if (typeof ResizeObserver === 'function') new ResizeObserver(safe(() => { if (isOpen && cols() !== drawn) paint(); })).observe(panel);
    }
    if (panel) panel.hidden = !on;
    item.querySelector('button').setAttribute('data-active', String(on));
    clearInterval(watch); watch = 0;
    doc.documentElement.classList.toggle('vrcc-open', on);   // VRCX 原来选中的那一项暂时不亮（不改 VRCX 的状态）
    if (!on && sizer) { sizer.disconnect(); sized = null; }
    if (on) {
      place(); stars = pals = map = recent = null; drawer = false; paint(); loadLists(); loadMap();
      // 开着的时候换了地图：跟着换
      watch = setInterval(safe(() => { const h = here(); if ((h && h.world) !== mapAt) loadMap(); }), 3000);
    }
  }
  // 面板贴着 VRCX 左边的列表；列表收成图标、展开时跟着挪（ResizeObserver，没有就只在打开和窗口变大小时算）
  let sizer = null, sized = null;
  function place() {
    const side = item && (item.closest('[data-sidebar="sidebar"]') || item.closest('ul'));
    if (panel && side) panel.style.left = Math.round(side.getBoundingClientRect().right) + 'px';
    if (!isOpen || !side || side === sized || typeof ResizeObserver !== 'function') return;
    if (!sizer) sizer = new ResizeObserver(safe(() => { if (isOpen) place(); }));
    sizer.disconnect(); sizer.observe(side); sized = side;
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
  // 最近的提醒：一天内最后 5 条，弹过的也在这里（VR 里一闪就过）；有网页的点一下打开，只开星遇同频自己的页面
  const unread = () => (recent || []).filter((x) => +x.id > recentRead).length;
  async function openDrawer(on) {
    drawer = on; paint();
    if (!on || !token) return;
    try { const r = await ask('?vrcx=' + token + '&v=' + V + '&view=recent&mark=1'); recent = Array.isArray(r.items) ? r.items : []; recentRead = +r.read || 0; }
    catch (err) { if (err.message === 'gone') return gone(false); }
    paint();
  }
  function drawerPart(box) {
    const d = el('div', 'vrcc-drawer'), h = el('div', 'vrcc-dhead');
    h.appendChild(el('b', '', '最近的提醒')); h.appendChild(btn('vrcc-x', '×', () => openDrawer(false))).title = '收起';
    d.appendChild(h);
    if (!recent || !recent.length) d.appendChild(el('p', 'vrcc-empty', recent ? '最近一天没有提醒。' : '读取中…'));
    else recentPart(d);
    box.appendChild(d);
  }
  function recentPart(box) {
    const card = el('div', 'vrcc-card');
    for (const x of recent) {
      const u = String(x.url || ''), path = /^\/match\/[\w\-/?=&%.]*$/.test(u) && !/\.\.|%2e/i.test(u) ? u : null;   // 只开 /match/ 下的页面，不往上走
      const row = path ? btn('vrcc-row vrcc-plain', null, () => openSite(path)) : el('div', 'vrcc-row vrcc-plain vrcc-still');
      if (path) row.title = '在浏览器里打开';
      const t = String(x.title || ''), name = el('span', 'vrcc-name');
      if (t && t !== '星遇同频') name.appendChild(el('b', '', t + ' '));
      name.appendChild(doc.createTextNode(String(x.body || '')));
      row.appendChild(name); row.appendChild(el('span', 'vrcc-when', ago(+x.at || 0)));
      card.appendChild(row);
    }
    box.appendChild(card);
  }
  // 短评：打过分以后，在星星下面写一句（和网页地图榜的短评是同一条，检查通过后别人才看得到）
  function wordsPart(m) {
    const f = el('form', 'vrcc-form vrcc-words'), input = el('input'), go = el('button', 'vrcc-ghost', map.words ? '更新' : '发布');
    input.maxLength = 30; input.placeholder = '写一句短评（选填）'; input.value = map.words || ''; input.autocomplete = 'off'; go.type = 'submit'; go.disabled = mapBusy;
    f.addEventListener('submit', safe((e) => { e.preventDefault(); const t = input.value.trim(); if (t !== (map.words || '')) rate(map.mine, t); }));
    f.appendChild(input); f.appendChild(go); m.appendChild(f);
    const st = map.words && (map.wordsOk === 'wait' ? '短评检查中，通过后别人才看得到。' : map.wordsOk === 'hidden' ? '短评没有通过检查，别人看不到，请修改后再发布。' : '');
    if (st) m.appendChild(el('p', 'vrcc-say' + (map.wordsOk === 'hidden' ? ' bad' : ''), st));
  }
  function mapPart(box) {
    const h = here();
    box.appendChild(label('你现在在'));
    const card = el('div', 'vrcc-card'), m = el('div', 'vrcc-map');
    card.appendChild(m); box.appendChild(card);
    if (!h) { m.appendChild(el('p', 'vrcc-meta', '在 VRChat 里进一张地图，这里就能直接给它打分。')); return; }
    // 地图的图：先用 VRCX 自己存着的（不经过我们），没有再用地图榜上的；点图或名字打开 VRCX 自己的地图窗口
    const open = () => launch('world/' + h.world, SITE + '/match/?map=' + h.world), pic = worldPic(h.world);
    if (pic) {
      const im = el('img', 'vrcc-pic'); im.alt = ''; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer'; im.src = pic;
      im.addEventListener('error', () => im.remove()); im.addEventListener('click', safe(open)); im.title = '在 VRCX 里看这张地图';
      card.insertBefore(im, m);
    }
    // 和网站的卡片一样：名字，右边大字的分数，下面一行说明
    const top = el('div', 'vrcc-mtop'), name = btn('vrcc-mname', (map && map.name) || h.name || '这张地图', open);
    name.title = '在 VRCX 里看这张地图';
    const h4 = el('h4'); h4.appendChild(name); top.appendChild(h4);
    if (map && map.board && map.raters) top.appendChild(el('span', 'vrcc-big', Number(map.avg).toFixed(1)));
    m.appendChild(top);
    if (!map) { m.appendChild(el('p', 'vrcc-say' + (mapErr ? ' bad' : ''), mapErr || '读取中…')); return; }
    m.appendChild(el('p', 'vrcc-meta', map.off ? '这张地图不在您所在星池的地图榜上。'
      : map.board ? (map.raters ? '地图榜 · ' + map.raters + ' 人打分' : '在地图榜上，还没有人打分')
      : map.pending ? '审核中，通过后就上地图榜' : '还不在地图榜上，打分后由你添加'));
    if (map.off) return;
    m.appendChild(starsFor(map.mine, (s) => rate(s), !map.can || mapBusy));
    if (map.mine && map.can) wordsPart(m);
    const say = mapBusy ? '提交中…' : mapErr || (!map.can ? NEED[map.need] || NEED.go : '');   // 打过分的：星星旁边写着几分，不用再说
    if (say) m.appendChild(el('p', 'vrcc-say' + (mapErr || !map.can ? ' bad' : ''), say));
    if (map.board) { const go = btn('vrcc-link', '在地图榜看看 ↗', () => openSite('/match/?map=' + h.world)); go.style.marginTop = '6px'; m.appendChild(go); }
  }
  // 宽的时候分两栏：左「你现在在、社区」，右「星轨相交、互相连上」；窄的时候一栏。最近的提醒是顶上的按钮
  let drawn = 1;
  const cols = () => { const w = panel ? panel.clientWidth : 0; return w >= 820 ? 2 : 1; };
  const PLAN = { 1: [['map', 'cross', 'pals', 'group']], 2: [['map', 'group'], ['cross', 'pals']] };
  function columns(box) {
    const parts = { map: mapPart, cross: (b) => { if (crossWhy !== 'hide') crossPart(b); }, pals: palPart, group: groupPart };
    let plan = PLAN[cols()].map((keys) => { const c = el('div', 'vrcc-col'); keys.forEach((k) => parts[k](c)); return c; }).filter((c) => c.childNodes.length);
    const n = plan.length; drawn = cols();
    const grid = el('div', 'vrcc-cols'); grid.style.setProperty('--vc-cols', String(n)); plan.forEach((c) => grid.appendChild(c));
    box.dataset.cols = String(n); box.appendChild(grid);
  }
  // 星轨相交：用不了的（16–17 岁、关掉了）整节不显示；没验证、没同意机器人好友的，说原因，点一下到网页那一页
  function crossPart(box) {
    box.appendChild(label('星轨相交', stars && stars.length));
    const card = el('div', 'vrcc-card');
    if (stars && WHY[crossWhy]) {
      const p = el('p', 'vrcc-empty', WHY[crossWhy][0]);
      if (WHY[crossWhy][1]) p.appendChild(btn('vrcc-link', WHY[crossWhy][1] + ' ↗', () => openSite('/match/?tab=inbox&cross')));
      card.appendChild(p);
    }
    if (!stars) {
      const p = el('p', 'vrcc-empty', listErr || '读取中…');
      if (listErr) p.appendChild(btn('vrcc-link', '重试', () => { listErr = null; paint(); loadLists(); }));
      card.appendChild(p);
    } else if (!stars.length) { if (!WHY[crossWhy]) card.appendChild(el('p', 'vrcc-empty', '在 VRChat 和其他星遇玩家待过同一个房间，TA 会出现在这里。')); }
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
  }
  // 互相连上：VRChat 名字；不是 VRCX 好友的，点一下打开 VRCX 自己的玩家窗口去加
  function palPart(box) {
    if (pals && pals.length) {
      box.appendChild(label('互相连上', pals.length));
      const card2 = el('div', 'vrcc-card');
      // 在 VRChat 里的好友排前面，其余照原来的顺序（最近连上的在前）
      const on = (s) => (s.vrcUser && friendOf(s.vrcUser) === 'online' ? 0 : 1);
      for (const s of pals.map((s, i) => [s, i]).sort((a, b) => on(a[0]) - on(b[0]) || a[1] - b[1]).map((x) => x[0])) {
        const fr = s.vrcUser ? friendOf(s.vrcUser) : null;
        const row = btn('vrcc-row vrcc-pal', null, () => (s.vrcUser ? launch('user/' + s.vrcUser, 'https://vrchat.com/home/user/' + s.vrcUser) : openSite('/match/?tab=inbox')));
        row.title = s.vrcUser ? '在 VRCX 里打开 TA 的资料' : '在浏览器里打开';
        const g = el('i', 'vrcc-g'); if (GROUP[s.group]) g.style.background = GROUP[s.group];
        const name = el('span', 'vrcc-name'); name.appendChild(el('b', '', String(s.vrc || s.name || '')));
        const sub = [s.name, s.star ? '★' + s.star : ''].filter(Boolean).join(' ');
        if (sub) name.appendChild(el('i', '', sub));
        row.appendChild(g); row.appendChild(name);
        row.appendChild(el('span', fr === 'online' ? 'vrcc-on' : s.vrcUser && !fr ? 'vrcc-add' : 'vrcc-when', fr === 'online' ? '在线' : fr ? '已是好友' : s.vrcUser ? '加好友 ›' : '看资料 ↗'));
        card2.appendChild(row);
      }
      box.appendChild(card2);
    }
  }
  function groupPart(box) {
    if (inGroup()) return;   // 已经加入了：这一节不用了
    box.appendChild(label('社区'));
    const card = el('div', 'vrcc-card');
    const row = btn('vrcc-row vrcc-plain', null, () => launch('group/' + GROUP_ID, 'https://vrchat.com/home/group/' + GROUP_ID));
    row.title = '在 VRCX 里打开群组';
    row.appendChild(el('span', 'vrcc-name', 'VRChat 中文社区 VRCC 的 VRChat 群组'));
    row.appendChild(el('span', 'vrcc-add', '加入 ›'));
    card.appendChild(row); box.appendChild(card);
  }
  function dotPaint() {
    const d = item && item.querySelector('.vrcc-dot'); if (d) d.hidden = !((token && dot > 0) || latest > V);
  }
  function paint() {
    if (!doc || !item) return;
    try {
      dotPaint();
      if (!panel || panel.hidden) return;
      let who = {}; try { who = JSON.parse(kept('who') || '{}') || {}; } catch {}
      const box = el('div', 'vrcc-in'), head = el('div', 'vrcc-head');
      head.insertAdjacentHTML('beforeend', LOGO);   // (ours, fixed)
      head.appendChild(el('h2', '', '星遇同频'));
      if (token) {
        const bell = btn('vrcc-ghost vrcc-bell', '最近的提醒', () => openDrawer(!drawer)), k = unread();
        if (k) bell.appendChild(el('span', 'vrcc-n', String(k)));
        bell.setAttribute('aria-expanded', String(drawer)); head.appendChild(bell);
      }
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
          if (code.length !== 8) { err.textContent = '连接码为 8 位，请检查后重新输入。'; err.hidden = false; return; }
          go.disabled = true; err.hidden = true;
          try { await pair(code); loadLists(); loadMap(); } catch (er) { err.textContent = er.say || SAY.server; err.hidden = false; go.disabled = false; }
        }));
        form.appendChild(input); form.appendChild(go); box.appendChild(form);
        box.appendChild(el('p', 'vrcc-hint', '在星遇同频「我的资料 → 在 VRCX 里提醒」获取，10 分钟内有效。'));
        box.appendChild(err);
        groupPart(box);
        setTimeout(() => { try { input.focus(); } catch {} }, 0);
      } else {
        columns(box);
        if (drawer) drawerPart(box);
        const foot = el('div', 'vrcc-foot');
        foot.appendChild(btn('vrcc-ghost', '打开星遇同频 ↗', () => openSite('/match/?tab=inbox&cross')));
        const test = btn('vrcc-ghost', '试一下提醒', () => { show('星遇同频', '这是一条测试提醒，看到它说明 VRCX 提醒已正常工作。', true); test.textContent = '已弹出'; setTimeout(() => { test.textContent = '试一下提醒'; }, 3000); });
        foot.appendChild(test);
        const off = btn('vrcc-link', '断开', () => {
          if (off.dataset.sure) return void unpair();
          off.dataset.sure = '1'; off.textContent = '再点一次断开';
          setTimeout(() => { if (off.isConnected) { delete off.dataset.sure; off.textContent = '断开'; } }, 3000);   // 3 秒内没再点：算了
        });
        off.style.marginLeft = 'auto'; foot.appendChild(off);
        box.appendChild(foot);
      }
      const top = panel.scrollTop; panel.replaceChildren(box); panel.scrollTop = top;   // 重画不跳回顶上
    } catch (err) {
      warn(err);
      // 画不出来时至少留一个能关掉、能重试的面板
      if (panel && !panel.hidden) { panel.textContent = ''; const p = el('p', 'vrcc-empty', '「星遇同频」暂时无法显示。'); p.appendChild(btn('vrcc-link', '重试', () => paint())); p.appendChild(btn('vrcc-link', '关闭', () => toggle(false))); panel.appendChild(p); }
    }
  }
  if (doc) {
    try {
      // VRCX 重画左边的列表时，「星遇同频」可能被拿掉：看到就放回去
      new MutationObserver(() => { if (!soon && (!item || !item.isConnected)) soon = requestAnimationFrame(safe(mount)); }).observe(doc.body, { childList: true, subtree: true });
      // 点 VRCX 自己的页面，或者按 Esc：收起来
      doc.addEventListener('click', safe((e) => { if (isOpen && e.target.closest && e.target.closest('[data-sidebar="menu-button"]') && !e.target.closest('#vrcc-item')) toggle(false); }), true);
      doc.addEventListener('keydown', safe((e) => { if (isOpen && e.key === 'Escape' && !doc.querySelector('[role="dialog"], [role="alertdialog"]')) { if (drawer) openDrawer(false); else toggle(false); } }));   // VRCX 自己的窗口开着时，Esc 留给它
      window.addEventListener('resize', safe(() => { if (isOpen) place(); }));
      safe(mount)();
    } catch (err) { warn(err); }
  }
  if (token) setTimeout(safe(() => look(true)), 5000 + Math.random() * 10000);
})();
/* ===== 星遇同频 VRCX 提醒 · 结束 ===== */
