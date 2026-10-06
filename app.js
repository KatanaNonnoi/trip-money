(() => {
  'use strict';

  /* ---------- Config ---------- */
  const LS = {
    data: 'trip.localData',
    editKey: 'trip.editKey',
    tab: 'trip.tab',
  };
  const BAD_KEY_MSG = 'รหัสแก้ไขไม่ถูกต้อง'; // must match Code.gs

  const CATEGORIES = [
    { key: 'stay', label: 'ที่พัก', emoji: '🏨', color: '#7c3aed' },
    { key: 'travel', label: 'เดินทาง', emoji: '🚗', color: '#3b82f6' },
    { key: 'food', label: 'อาหาร', emoji: '🍜', color: '#f97316' },
    { key: 'fun', label: 'กิจกรรม', emoji: '🎡', color: '#ec4899' },
    { key: 'shop', label: 'ของใช้', emoji: '🛒', color: '#14b8a6' },
    { key: 'other', label: 'อื่นๆ', emoji: '📦', color: '#f59e0b' },
  ];
  const catOf = (key) => CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];

  const AVATAR_GRADIENTS = [
    'linear-gradient(135deg,#7c3aed,#3b82f6)',
    'linear-gradient(135deg,#ec4899,#f43f5e)',
    'linear-gradient(135deg,#f97316,#f59e0b)',
    'linear-gradient(135deg,#10b981,#06b6d4)',
    'linear-gradient(135deg,#6366f1,#ec4899)',
    'linear-gradient(135deg,#14b8a6,#3b82f6)',
    'linear-gradient(135deg,#f43f5e,#f97316)',
    'linear-gradient(135deg,#8b5cf6,#d946ef)',
  ];

  const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const safeSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } };

  const apiUrl = () => ((window.TRIP_CONFIG && window.TRIP_CONFIG.API_URL) || '').trim();
  const isRemote = () => !!apiUrl();
  const editKey = () => safeGet(LS.editKey) || '';
  const canEdit = () => !isRemote() || !!editKey();

  /* ---------- State ---------- */
  let state = { members: [], expenses: [], settings: {} };
  let memberFilter = 'all';

  /* ---------- Utils ---------- */
  const $ = (sel) => document.querySelector(sel);
  const nf = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
  const money = (n) => '฿' + nf.format(Math.round((Number(n) || 0) * 100) / 100);
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7);
  const avatarBg = (m) => AVATAR_GRADIENTS[hash(m.id || m.name) % AVATAR_GRADIENTS.length];
  const initial = (name) => [...String(name).trim()][0] || '?';
  const avatar = (m) => `<div class="avatar" style="background:${avatarBg(m)}">${esc(initial(m.name))}</div>`;
  const fmtDate = (s) => {
    if (!s) return '';
    const d = new Date(s + 'T00:00:00');
    return isNaN(d) ? s : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  };

  function toast(msg, isErr = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.className = 'toast'), 2600);
  }

  function setSync(text, cls) {
    const el = $('#syncStatus');
    el.textContent = text;
    el.className = 'sync ' + (cls || '');
  }

  /* ---------- Data layer ---------- */
  function sampleData() {
    const m = (name, due, paid) => ({ id: uid(), name, due, paid, note: '' });
    const e = (title, category, amount, date) => ({ id: uid(), title, category, amount, date, note: '' });
    return {
      settings: { tripName: 'ทริปเชียงใหม่ 3 วัน 2 คืน', perPerson: 3000 },
      members: [m('ต้น', 3000, 3000), m('มายด์', 3000, 3000), m('บอส', 3000, 1500), m('แนน', 3000, 0), m('เจ', 3000, 3500)],
      expenses: [
        e('ที่พักวิลล่า 2 คืน', 'stay', 6400, today()),
        e('เช่ารถตู้ + น้ำมัน', 'travel', 4200, today()),
        e('หมูกระทะคืนแรก', 'food', 1850, today()),
        e('บัตรเข้าสวน', 'fun', 1250, today()),
        e('น้ำ ขนม ของใช้', 'shop', 780, today()),
      ],
    };
  }

  function loadLocal() {
    const raw = safeGet(LS.data);
    if (raw) { try { return JSON.parse(raw); } catch { /* fallthrough */ } }
    const d = sampleData();
    safeSet(LS.data, JSON.stringify(d));
    return d;
  }

  function normalize(d) {
    d = d || {};
    return {
      members: (d.members || []).map((m) => ({ ...m, id: String(m.id), due: num(m.due), paid: num(m.paid) })),
      expenses: (d.expenses || []).map((e) => ({ ...e, id: String(e.id), amount: num(e.amount) })),
      settings: d.settings || {},
    };
  }

  async function post(body) {
    const res = await fetch(apiUrl(), {
      method: 'POST',
      // text/plain avoids a CORS preflight, which Apps Script can't answer
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function load() {
    $('#demoBanner').hidden = isRemote();
    if (!isRemote()) {
      state = normalize(loadLocal());
      setSync('โหมดทดลอง', 'busy');
      render();
      return;
    }
    setSync('กำลังโหลด…', 'busy');
    try {
      const res = await fetch(apiUrl(), { method: 'GET' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'โหลดข้อมูลไม่สำเร็จ');
      state = normalize(json.data);
      setSync('ซิงก์แล้ว ✓', 'ok');
    } catch (err) {
      console.error(err);
      setSync('เชื่อมต่อไม่ได้', 'err');
      toast('โหลดข้อมูลไม่ได้ ลองกดรีเฟรช', true);
    }
    render();
  }

  function applyLocal(op) {
    if (op.action === 'upsert') {
      const list = state[op.sheet];
      const i = list.findIndex((r) => r.id === op.row.id);
      if (i >= 0) list[i] = { ...list[i], ...op.row };
      else list.push(op.row);
    } else if (op.action === 'delete') {
      state[op.sheet] = state[op.sheet].filter((r) => r.id !== op.id);
    } else if (op.action === 'setting') {
      state.settings[op.key_name] = op.value;
    }
  }

  async function mutate(op) {
    applyLocal(op);
    render();
    if (!isRemote()) {
      safeSet(LS.data, JSON.stringify(state));
      return true;
    }
    setSync('กำลังบันทึก…', 'busy');
    try {
      const json = await post({ ...op, key: editKey() });
      if (!json.ok) {
        if (json.error === BAD_KEY_MSG) { safeSet(LS.editKey, null); renderLock(); }
        throw new Error(json.error || 'บันทึกไม่สำเร็จ');
      }
      state = normalize(json.data);
      setSync('ซิงก์แล้ว ✓', 'ok');
      render();
      return true;
    } catch (err) {
      console.error(err);
      setSync('บันทึกไม่สำเร็จ', 'err');
      toast('บันทึกไม่สำเร็จ: ' + err.message, true);
      await load();
      return false;
    }
  }

  /* ---------- Edit lock ---------- */
  let afterUnlock = null;

  // Run fn now if this device can edit, otherwise ask for the key first.
  function requireEdit(fn) {
    if (canEdit()) return fn();
    afterUnlock = fn;
    const f = $('#unlockForm');
    f.reset();
    $('#unlockError').textContent = '';
    $('#unlockDialog').showModal();
    f.elements.key.focus();
  }

  function renderLock() {
    const b = $('#btnLock');
    const unlocked = isRemote() && !!editKey();
    b.hidden = !isRemote();
    b.classList.toggle('unlocked', unlocked);
    b.innerHTML = unlocked ? '🔓<span class="lbl"> แก้ไขได้</span>' : '🔒<span class="lbl"> ใส่รหัสแก้ไข</span>';
    b.title = unlocked ? 'เครื่องนี้แก้ไขได้' : 'ใส่รหัสเพื่อแก้ไข';
  }

  /* ---------- Calculations ---------- */
  function memberStatus(m) {
    if (m.paid <= 0) return 'none';
    if (m.due > 0 && m.paid > m.due) return 'over';
    if (m.paid >= m.due) return 'full';
    return 'partial';
  }

  function compute() {
    const { members, expenses } = state;
    const n = members.length;
    const totalPaid = members.reduce((s, m) => s + m.paid, 0);
    const totalDue = members.reduce((s, m) => s + m.due, 0);
    const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
    const outstanding = members.reduce((s, m) => s + Math.max(m.due - m.paid, 0), 0);
    const unpaidCount = members.filter((m) => m.paid < m.due).length;
    const projected = members.reduce((s, m) => s + Math.max(m.due, m.paid), 0);
    const balance = totalPaid - totalExpense;
    const share = n ? totalExpense / n : 0;
    return { n, totalPaid, totalDue, totalExpense, outstanding, unpaidCount, projected, balance, share };
  }

  /* ---------- Render ---------- */
  function render() {
    const c = compute();
    const tripName = state.settings.tripName || 'ทริปของเรา';
    $('#tripName').textContent = tripName;
    document.title = tripName + ' · กองกลาง';

    renderLock();
    renderStats(c);
    renderSummary(c);
    renderOwing();
    renderMembers();
    renderExpenses(c);
    renderSettle(c);
    $('#dotMembers').hidden = c.unpaidCount === 0;
  }

  function renderStats(c) {
    $('#sPaid').textContent = money(c.totalPaid);
    const pct = c.totalDue ? Math.min(100, (c.totalPaid / c.totalDue) * 100) : 0;
    $('#sPaidBar').style.width = pct + '%';
    $('#sPaidFoot').textContent = c.totalDue ? `${Math.round(pct)}% จากเป้า ${money(c.totalDue)}` : 'ยังไม่ได้ตั้งยอดเก็บ';

    $('#sExpense').textContent = money(c.totalExpense);
    $('#sExpenseFoot').textContent = `${state.expenses.length} รายการ`;

    const short = c.balance < 0;
    $('#sBalanceCard').className = 'stat ' + (short ? 'stat-red' : 'stat-violet');
    $('#sBalanceIcon').textContent = short ? '⚠️' : '✨';
    $('#sBalanceLabel').textContent = short ? 'เงินขาด' : 'เงินคงเหลือ';
    $('#sBalance').textContent = money(Math.abs(c.balance));
    $('#sBalanceFoot').textContent = short
      ? (c.n ? `เก็บเพิ่มคนละ ${money(Math.ceil(-c.balance / c.n))}` : 'ยังไม่มีสมาชิก')
      : 'พอจ่ายค่าใช้จ่าย';

    $('#sOutstanding').textContent = money(c.outstanding);
    $('#sOutstandingFoot').textContent = c.unpaidCount ? `${c.unpaidCount} คนยังจ่ายไม่ครบ` : 'ทุกคนจ่ายครบ 🎉';
  }

  function renderSummary(c) {
    const max = Math.max(c.totalPaid, c.totalExpense, 1);
    $('#cPaid').style.width = (c.totalPaid / max) * 100 + '%';
    $('#cExp').style.width = (c.totalExpense / max) * 100 + '%';
    $('#cPaidVal').textContent = money(c.totalPaid);
    $('#cExpVal').textContent = money(c.totalExpense);

    const pill = $('#diffPill');
    if (Math.abs(c.balance) < 0.005) { pill.className = 'pill pill-violet'; pill.textContent = 'พอดีเป๊ะ'; }
    else if (c.balance > 0) { pill.className = 'pill pill-green'; pill.textContent = `เหลือ ${money(c.balance)}`; }
    else { pill.className = 'pill pill-red'; pill.textContent = `ขาด ${money(-c.balance)}`; }

    const box = (cls, label, value, foot) =>
      `<div class="v-box ${cls}"><p>${label}</p><strong>${value}</strong>${foot ? `<p>${foot}</p>` : ''}</div>`;
    const boxes = [];

    if (c.balance >= 0) {
      boxes.push(box('v-good', '💚 เงินเหลือรวม', money(c.balance), 'หลังหักค่าใช้จ่ายทั้งหมด'));
      if (c.n && c.balance > 0) boxes.push(box('v-good', '↩️ เฉลี่ยคืนได้คนละ', money(Math.floor((c.balance / c.n) * 100) / 100), `หาร ${c.n} คน`));
    } else {
      const short = -c.balance;
      boxes.push(box('v-bad', '❗ เงินขาดรวม', money(short), 'ค่าใช้จ่ายมากกว่าเงินที่เก็บได้'));
      if (c.n) boxes.push(box('v-warn', '📣 ต้องเก็บเพิ่มเฉลี่ยคนละ', money(Math.ceil(short / c.n)), `หาร ${c.n} คน · ดูรายคนในหน้า “หารเท่า”`));
    }

    if (c.outstanding > 0) {
      const p = c.projected - c.totalExpense;
      boxes.push(box('v-info', '🔮 ถ้าทุกคนจ่ายครบตามยอด',
        p >= 0 ? `เหลือ ${money(p)}` : `ยังขาด ${money(-p)}`,
        p >= 0 ? `ยังรอเก็บอีก ${money(c.outstanding)}` : (c.n ? `ควรเพิ่มยอดเก็บคนละ ${money(Math.ceil(-p / c.n))}` : '')));
    }
    $('#verdict').innerHTML = boxes.join('');
  }

  function memberItem(m) {
    const st = memberStatus(m);
    const remain = Math.max(m.due - m.paid, 0);
    const pct = m.due ? Math.min(100, (m.paid / m.due) * 100) : (m.paid > 0 ? 100 : 0);
    const badge = {
      full: `<span class="badge b-full">จ่ายครบ</span>`,
      over: `<span class="badge b-over">เกิน ${money(m.paid - m.due)}</span>`,
      partial: `<span class="badge b-partial">ค้าง ${money(remain)}</span>`,
      none: `<span class="badge b-none">ยังไม่จ่าย</span>`,
    }[st];
    const barColor = { full: 'var(--g-green)', over: 'var(--g-violet)', partial: 'var(--g-amber)', none: 'var(--g-red)' }[st];
    return `
      <li class="item" tabindex="0" data-act="edit-member" data-id="${esc(m.id)}">
        ${avatar(m)}
        <div class="item-main">
          <div class="item-title"><span class="t">${esc(m.name)}</span> ${badge}</div>
          <div class="item-sub">${money(m.paid)} / ${money(m.due)}${m.note ? ' · ' + esc(m.note) : ''}</div>
          <div class="mini-bar"><span style="width:${pct}%;background:${barColor}"></span></div>
        </div>
        <div class="item-side">
          <button class="btn btn-green btn-sm" data-act="pay" data-id="${esc(m.id)}">＋ จ่าย</button>
        </div>
      </li>`;
  }

  function renderOwing() {
    const owing = state.members.filter((m) => m.paid < m.due).sort((a, b) => (b.due - b.paid) - (a.due - a.paid));
    $('#owingList').innerHTML = owing.length
      ? owing.slice(0, 5).map(memberItem).join('')
      : `<li class="empty"><span>🎉</span>${state.members.length ? 'ทุกคนจ่ายครบแล้ว' : 'ยังไม่มีสมาชิก'}</li>`;
  }

  function renderMembers() {
    const list = $('#memberList');
    $('#memberCount').textContent = state.members.length;
    const items = state.members.filter((m) => {
      const st = memberStatus(m);
      if (memberFilter === 'all') return true;
      if (memberFilter === 'full') return st === 'full' || st === 'over';
      return st === memberFilter;
    });

    if (!state.members.length) {
      list.innerHTML = `<li class="empty"><span>👋</span>ยังไม่มีสมาชิก กด ＋ เพื่อเพิ่ม</li>`;
    } else if (!items.length) {
      list.innerHTML = `<li class="empty"><span>🔍</span>ไม่มีสมาชิกในสถานะนี้</li>`;
    } else {
      list.innerHTML = items.map(memberItem).join('');
    }
  }

  function renderExpenses(c) {
    $('#expenseCount').textContent = state.expenses.length;
    $('#expenseTotal').textContent = money(c.totalExpense);

    const byCat = CATEGORIES.map((cat) => ({
      ...cat,
      total: state.expenses.filter((e) => catOf(e.category).key === cat.key).reduce((s, e) => s + e.amount, 0),
    })).filter((x) => x.total > 0);
    $('#catBar').innerHTML = byCat.map((x) =>
      `<span style="width:${(x.total / (c.totalExpense || 1)) * 100}%;background:${x.color}" title="${x.label} ${money(x.total)}"></span>`).join('');
    $('#catLegend').innerHTML = byCat.map((x) =>
      `<span><i style="background:${x.color}"></i>${x.emoji} ${x.label} ${money(x.total)}</span>`).join('');

    const list = $('#expenseList');
    if (!state.expenses.length) {
      list.innerHTML = `<li class="empty"><span>🧾</span>ยังไม่มีค่าใช้จ่าย กด ＋ เพื่อเพิ่ม</li>`;
      return;
    }
    const sorted = [...state.expenses].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    list.innerHTML = sorted.map((e) => {
      const cat = catOf(e.category);
      return `
        <li class="item" tabindex="0" data-act="edit-expense" data-id="${esc(e.id)}">
          <div class="avatar" style="background:${cat.color}1f;font-size:1.3rem">${cat.emoji}</div>
          <div class="item-main">
            <div class="item-title"><span class="t">${esc(e.title)}</span></div>
            <div class="item-sub"><span style="color:${cat.color};font-weight:600">${cat.label}</span>${e.date ? ' · ' + fmtDate(e.date) : ''}${e.note ? ' · ' + esc(e.note) : ''}</div>
          </div>
          <div class="item-side"><span class="amount">${money(e.amount)}</span></div>
        </li>`;
    }).join('');
  }

  function renderSettle(c) {
    $('#shareInfo').textContent = `คนละ ${money(c.share)}`;
    const list = $('#settleList');
    if (!state.members.length) {
      list.innerHTML = `<li class="empty"><span>🤝</span>ยังไม่มีสมาชิก</li>`;
      $('#settleSum').innerHTML = '';
      return;
    }
    let owe = 0, back = 0;
    list.innerHTML = state.members.map((m) => {
      const diff = m.paid - c.share;
      let res;
      if (Math.abs(diff) < 0.005) res = `<span class="res res-even">พอดี ✓</span>`;
      else if (diff < 0) { owe += -diff; res = `<span class="res res-owe">จ่ายเพิ่ม ${money(-diff)}</span>`; }
      else { back += diff; res = `<span class="res res-back">ได้คืน ${money(diff)}</span>`; }
      return `
        <li class="settle-row">
          <div class="who">${avatar(m)}<div style="min-width:0"><div class="who-name">${esc(m.name)}</div><div class="who-sub">จ่ายแล้ว ${money(m.paid)}</div></div></div>
          <span class="num">${money(m.paid)}</span>
          <span class="num">${money(c.share)}</span>
          <span class="num res-cell">${res}</span>
        </li>`;
    }).join('');
    $('#settleSum').innerHTML =
      `<div class="v-box v-warn"><p>ต้องเก็บเพิ่มรวม</p><strong>${money(owe)}</strong></div>` +
      `<div class="v-box v-good"><p>ต้องคืนรวม</p><strong>${money(back)}</strong></div>`;
  }

  /* ---------- Tabs (phone) ---------- */
  const TABS = ['overview', 'members', 'expenses', 'settle'];
  function setTab(tab, scroll = true) {
    if (!TABS.includes(tab)) tab = 'overview';
    document.body.dataset.tab = tab;
    document.querySelectorAll('#tabbar [data-go]').forEach((b) => b.classList.toggle('active', b.dataset.go === tab));
    safeSet(LS.tab, tab);
    try { history.replaceState(null, '', '#' + tab); } catch { /* ignore */ }
    if (scroll) window.scrollTo({ top: 0 });
  }

  /* ---------- Dialogs ---------- */
  function openMember(m) {
    $('#memberForm').reset();
    const f = $('#memberForm').elements;
    $('#memberDialogTitle').textContent = m ? 'แก้ไขสมาชิก' : 'เพิ่มสมาชิก';
    $('#btnDelMember').hidden = !m;
    f.id.value = m ? m.id : '';
    f.name.value = m ? m.name : '';
    f.due.value = m ? m.due : num(state.settings.perPerson) || '';
    f.paid.value = m ? m.paid : 0;
    f.note.value = m ? m.note || '' : '';
    $('#memberDialog').showModal();
    if (!m) f.name.focus();
  }

  function openPay(m) {
    $('#payForm').reset();
    const f = $('#payForm').elements;
    f.id.value = m.id;
    $('#payName').textContent = m.name;
    const remain = Math.max(m.due - m.paid, 0);
    $('#payInfo').textContent = `จ่ายแล้ว ${money(m.paid)} จาก ${money(m.due)}` + (remain ? ` · ค้างอีก ${money(remain)}` : '');
    const quick = [remain, 100, 500, 1000].filter((v, i, a) => v > 0 && a.indexOf(v) === i);
    $('#payQuick').innerHTML = quick.map((v, i) =>
      `<button type="button" class="chip" data-amount="${v}">${i === 0 && v === remain ? 'ส่วนที่ค้าง ' : '+'}${money(v)}</button>`).join('');
    f.amount.value = remain || '';
    $('#payDialog').showModal();
  }

  let pickedCat = 'food';
  function setCat(key) {
    pickedCat = key;
    $('#catPick').innerHTML = CATEGORIES.map((c) =>
      `<button type="button" class="cat-opt${c.key === key ? ' active' : ''}" style="--c:${c.color}" data-cat="${c.key}">${c.emoji} ${c.label}</button>`).join('');
  }

  function openExpense(e) {
    $('#expenseForm').reset();
    const f = $('#expenseForm').elements;
    $('#expenseDialogTitle').textContent = e ? 'แก้ไขค่าใช้จ่าย' : 'เพิ่มค่าใช้จ่าย';
    $('#btnDelExpense').hidden = !e;
    f.id.value = e ? e.id : '';
    f.title.value = e ? e.title : '';
    f.amount.value = e ? e.amount : '';
    f.date.value = e ? e.date || '' : today();
    f.note.value = e ? e.note || '' : '';
    setCat(e ? catOf(e.category).key : 'food');
    $('#expenseDialog').showModal();
    if (!e) f.title.focus();
  }

  function openSettings() {
    const f = $('#settingsForm').elements;
    f.tripName.value = state.settings.tripName || '';
    f.perPerson.value = state.settings.perPerson || '';
    $('#btnLockOut').hidden = !(isRemote() && editKey());
    $('#settingsDialog').showModal();
  }

  /* ---------- Events ---------- */
  function bind() {
    const addMember = () => requireEdit(() => openMember(null));
    const addExpense = () => requireEdit(() => openExpense(null));

    document.querySelectorAll('[data-add]').forEach((b) =>
      b.addEventListener('click', () => (b.dataset.add === 'member' ? addMember() : addExpense())));
    $('#fab').addEventListener('click', () => (document.body.dataset.tab === 'expenses' ? addExpense() : addMember()));
    $('#btnSettings').addEventListener('click', () => requireEdit(openSettings));
    $('#btnRefresh').addEventListener('click', () => load().then(() => toast('โหลดข้อมูลล่าสุดแล้ว')));
    $('#btnLock').addEventListener('click', () => {
      if (editKey()) toast('เครื่องนี้แก้ไขข้อมูลได้แล้ว 🔓');
      else requireEdit(() => toast('ปลดล็อกแล้ว แก้ไขได้เลย 🔓'));
    });

    document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.go)));

    document.querySelectorAll('dialog').forEach((d) => {
      d.addEventListener('click', (ev) => {
        if (ev.target === d || ev.target.closest('[data-close]')) d.close();
      });
    });

    $('#memberFilters').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-filter]');
      if (!b) return;
      memberFilter = b.dataset.filter;
      document.querySelectorAll('#memberFilters .chip').forEach((x) => x.classList.toggle('active', x === b));
      renderMembers();
    });

    // tap a row to edit, tap "+ จ่าย" to record a payment
    const onAct = (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b) return;
      const id = b.dataset.id;
      if (b.dataset.act === 'pay') {
        const m = state.members.find((x) => x.id === id);
        if (m) requireEdit(() => openPay(m));
      } else if (b.dataset.act === 'edit-member') {
        const m = state.members.find((x) => x.id === id);
        if (m) requireEdit(() => openMember(m));
      } else if (b.dataset.act === 'edit-expense') {
        const e = state.expenses.find((x) => x.id === id);
        if (e) requireEdit(() => openExpense(e));
      }
    };
    document.addEventListener('click', onAct);
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && ev.target.matches('.item[data-act]')) onAct(ev);
    });

    $('#unlockForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const key = ev.target.elements.key.value.trim();
      if (!key) return;
      const btn = $('#btnUnlock');
      btn.disabled = true;
      btn.textContent = 'กำลังตรวจ…';
      try {
        const json = await post({ action: 'ping', key });
        if (!json.ok) {
          $('#unlockError').textContent = json.error === BAD_KEY_MSG ? 'รหัสไม่ถูกต้อง ลองใหม่อีกครั้ง' : json.error;
          return;
        }
        safeSet(LS.editKey, key);
        $('#unlockDialog').close();
        renderLock();
        const fn = afterUnlock;
        afterUnlock = null;
        if (fn) fn();
      } catch (err) {
        $('#unlockError').textContent = 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง';
      } finally {
        btn.disabled = false;
        btn.textContent = 'ปลดล็อก';
      }
    });

    $('#memberForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const f = ev.target.elements;
      const name = f.name.value.trim();
      if (!name) return;
      const row = { id: f.id.value || uid(), name, due: num(f.due.value), paid: num(f.paid.value), note: f.note.value.trim() };
      $('#memberDialog').close();
      mutate({ action: 'upsert', sheet: 'members', row }).then((ok) => ok && toast('บันทึกสมาชิกแล้ว'));
    });

    $('#btnDelMember').addEventListener('click', () => {
      const id = $('#memberForm').elements.id.value;
      const m = state.members.find((x) => x.id === id);
      if (!m || !confirm(`ลบสมาชิก “${m.name}” ?`)) return;
      $('#memberDialog').close();
      mutate({ action: 'delete', sheet: 'members', id }).then((ok) => ok && toast('ลบสมาชิกแล้ว'));
    });

    $('#payQuick').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-amount]');
      if (b) $('#payForm').elements.amount.value = b.dataset.amount;
    });

    $('#payForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const f = ev.target.elements;
      const m = state.members.find((x) => x.id === f.id.value);
      const amt = num(f.amount.value);
      if (!m || !amt) return;
      $('#payDialog').close();
      const row = { ...m, paid: Math.max(0, m.paid + amt) };
      mutate({ action: 'upsert', sheet: 'members', row }).then((ok) => ok && toast(`รับเงินจาก ${m.name} ${money(amt)} แล้ว 💸`));
    });

    $('#catPick').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-cat]');
      if (b) setCat(b.dataset.cat);
    });

    $('#expenseForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const f = ev.target.elements;
      const title = f.title.value.trim();
      if (!title) return;
      const row = { id: f.id.value || uid(), title, category: pickedCat, amount: num(f.amount.value), date: f.date.value, note: f.note.value.trim() };
      $('#expenseDialog').close();
      mutate({ action: 'upsert', sheet: 'expenses', row }).then((ok) => ok && toast('บันทึกค่าใช้จ่ายแล้ว'));
    });

    $('#btnDelExpense').addEventListener('click', () => {
      const id = $('#expenseForm').elements.id.value;
      const e = state.expenses.find((x) => x.id === id);
      if (!e || !confirm(`ลบรายการ “${e.title}” ?`)) return;
      $('#expenseDialog').close();
      mutate({ action: 'delete', sheet: 'expenses', id }).then((ok) => ok && toast('ลบรายการแล้ว'));
    });

    $('#settingsForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target.elements;
      $('#settingsDialog').close();
      const tripName = f.tripName.value.trim();
      const perPerson = num(f.perPerson.value);
      let ok = true;
      if (tripName !== (state.settings.tripName || '')) ok = await mutate({ action: 'setting', key_name: 'tripName', value: tripName });
      if (ok && perPerson !== num(state.settings.perPerson)) ok = await mutate({ action: 'setting', key_name: 'perPerson', value: perPerson });
      if (ok) toast('บันทึกการตั้งค่าแล้ว');
    });

    $('#btnLockOut').addEventListener('click', () => {
      safeSet(LS.editKey, null);
      $('#settingsDialog').close();
      renderLock();
      toast('ล็อกเครื่องนี้แล้ว 🔒');
    });

    // pull fresh data when coming back to the tab
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isRemote()) load();
    });
  }

  bind();
  setTab(location.hash.slice(1) || safeGet(LS.tab) || 'overview', false);
  load();
})();
