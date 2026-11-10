
/* Reminder AI - frontend module. Loads after app.js and plugs into its views, nav and header. */
const RM = { list: [], prefs: { auto_events: 1, offsets: [1440, 60, 10] }, cfg: null, devSub: false, notifs: [], unread: 0, seen: new Set(), seenInit: false, form: null, chat: [], busy: false, aiMode: null, flt: 'All', dockOpen: false };
const OFFS = [[0, 'At the time'], [10, '10 min before'], [30, '30 min before'], [60, '1 hour before'], [180, '3 hours before'], [1440, '1 day before'], [2880, '2 days before']];
const SUGG = ['Show my reminders', 'What is overdue?', 'What events are coming up?', 'Remind me to study tomorrow at 7pm'];

function rel(ms) {
  const d = ms - Date.now(), m = Math.round(Math.abs(d) / 6e4);
  if (m < 1) return 'now';
  const s = m < 120 ? m + ' min' : m < 2880 ? Math.round(m / 60) + ' hr' : Math.round(m / 1440) + ' days';
  return d > 0 ? 'in ' + s : s + ' ago';
}
function flash(msg) {
  document.querySelectorAll('.flash').forEach((x) => x.remove());
  const d = document.createElement('div');
  d.className = 'toast flash'; d.setAttribute('role', 'status'); d.textContent = msg;
  document.body.appendChild(d); setTimeout(() => d.remove(), 4500);
}
const alertsText = (o) => (o.length ? o.map((x) => (OFFS.find((y) => y[0] === x) || [0, x + ' min before'])[1].toLowerCase()).join(', ') + ' + at the due time' : 'at the due time');

/* ---------- loading ---------- */
async function devSubState() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    return !!(reg && (await reg.pushManager.getSubscription()));
  } catch (e) { return false; }
}
async function remLoad(t) {
  if (!S.user || isA()) return;
  try {
    if (['reminders', 'home', 'assistant'].includes(t)) { const d = await API.get('/reminders'); RM.list = d.reminders; RM.prefs = d.prefs; }
    if (t === 'reminders') { RM.cfg = await API.get('/notifications/config'); RM.devSub = await devSubState(); }
    if (t === 'notifs') { const d = await API.get('/notifications'); RM.notifs = d.items; RM.unread = d.unread; }
    if (t === 'assistant' && RM.aiMode === null) RM.aiMode = (await API.get('/assistant/mode')).mode;
  } catch (e) {}
}

/* ---------- bell, floating button, polling ---------- */
function setBadge() {} // the unread count is shown next to Notifications in the side menu
async function remPoll() {
  if (!S.user || isA() || document.hidden) return;
  try {
    const d = await API.get('/notifications/unread');
    RM.unread = d.count; setBadge();
    let fresh = false;
    d.latest.forEach((n) => { if (!RM.seen.has(n.id)) { RM.seen.add(n.id); if (RM.seenInit) { fresh = true; flash('🔔 ' + n.title + (n.body ? ' - ' + n.body : '')); } } });
    RM.seenInit = true;
    if (fresh && (S.tab === 'notifs' || S.tab === 'reminders') && !RM.form && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { await remLoad(S.tab); render(); }
  } catch (e) {}
}
setInterval(remPoll, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) remPoll(); });
setTimeout(remPoll, 1500);

/* ---------- reminders page ---------- */
function rItem(r) {
  const done = r.status === 'Completed', cls = r.status === 'Overdue' ? 'Failed' : r.status;
  return `<div class="rmi ${done ? 'done' : ''}"><div style="display:flex;gap:10px;justify-content:space-between;align-items:flex-start"><div><div class="t">${esc(r.title)}</div><small>${fd(r.due_at)} · ${done ? 'completed ' + rel(r.completed_at) : rel(r.due_at)}${r.notes ? '<br>' + esc(r.notes) : ''}${done ? '' : '<br>Alerts: ' + alertsText(r.offsets)}</small></div><span class="bd ${cls}">${r.status}</span></div>
<div class="acts">${done ? `<button class="chip" onclick="remDone(${r.id},false)">↩ Undo</button>` : `<button class="chip on" onclick="remDone(${r.id},true)">✓ Done</button>`}<button class="chip" onclick="remForm(${r.id})">✎ Edit</button><button class="chip" onclick="remDel(${r.id})">🗑 Delete</button></div></div>`;
}
function formHtml() {
  const f = RM.form, t = new Date(), today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  return `<div class="card"><h3>${f.id ? 'Edit reminder' : 'New reminder'}</h3>
<input class="srch" id="rt" placeholder="Title (e.g. Submit clearance form)" aria-label="Title" maxlength="120" value="${esc(f.title)}">
<label class="lbl" for="rd">Date</label><input class="srch" id="rd" type="date" min="${today}" value="${esc(f.date)}">
<label class="lbl" for="rtm">Time</label><input class="srch" id="rtm" type="time" value="${esc(f.time)}">
<input class="srch" id="rn" placeholder="Notes (optional)" aria-label="Notes" maxlength="500" value="${esc(f.notes)}">
<p class="mu">Also alert me before (you are always notified at the due time):</p>
<div class="chips wrap">${OFFS.filter((o) => o[0] > 0).map((o) => `<button type="button" class="chip ${f.offsets.includes(o[0]) ? 'on' : ''}" onclick="remTog(${o[0]})">${o[1]}</button>`).join('')}</div>
<div id="err" class="err" role="alert"></div>
<div style="display:flex;gap:10px"><button class="btn" onclick="remSave()">${f.id ? 'Save changes' : 'Add reminder'}</button><button class="btn" style="background:var(--chip);color:var(--tx)" onclick="RM.form=null;render()">Cancel</button></div></div>`;
}
function settingsHtml() {
  const c = RM.cfg, p = RM.prefs;
  let push, btns = '';
  if (!c) push = R('Phone / browser push', 'Loading...');
  else if (!c.pushEnabled) push = R('Phone / browser push', '<span class="bd Completed">Not set up on server</span>');
  else if (!('serviceWorker' in navigator && 'PushManager' in window)) push = R('Phone / browser push', '<span class="bd Completed">Not supported here</span>');
  else {
    push = R('Phone / browser push', RM.devSub ? '<span class="bd Active">On for this device</span>' : '<span class="bd Completed">Off</span>');
    btns = RM.devSub ? '<div class="acts"><button class="chip" onclick="pushTest()">Send test push</button><button class="chip" onclick="pushOff()">Turn off</button></div>' : '<div class="acts"><button class="chip on" onclick="pushOn()">Turn on push on this device</button></div>';
  }
  const sch = c ? (c.scheduler.lastRun ? `Every ${c.scheduler.intervalSec}s · last check ${rel(c.scheduler.lastRun)}${c.scheduler.error ? ' · error' : ''}` : 'Not running yet') : '...';
  return `<div class="card"><h3>Automatic reminders</h3>
<label class="chk"><input type="checkbox" id="pauto" ${p.auto_events ? 'checked' : ''}><span>Remind me about upcoming events and registration deadlines</span></label>
<p class="mu">Send alerts:</p><div class="chips wrap">${OFFS.map((o) => `<button type="button" class="chip ${p.offsets.includes(o[0]) ? 'on' : ''}" onclick="prefTog(${o[0]})">${o[1]}</button>`).join('')}</div>
<button class="btn" onclick="savePrefs()">Save settings</button></div>
<div class="card"><h3>How you get notified</h3>${R('In-app (Notifications menu)', '<span class="bd Active">Always on</span>')}${push}${R('Scheduler', esc(sch))}${btns}<p class="mu" style="margin-bottom:0">Alerts appear under Notifications in the menu when the scheduler creates them. Push messages are only sent to devices where you turned push on. On iPhone, add this app to your Home Screen first.</p></div>`;
}
V.reminders = function () {
  const L = RM.list, c = (s) => L.filter((r) => r.status === s).length, order = { Overdue: 0, Upcoming: 1, Completed: 2 };
  const show = L.filter((r) => RM.flt === 'All' || r.status === RM.flt).sort((a, b) => order[a.status] - order[b.status] || (a.status === 'Completed' ? b.completed_at - a.completed_at : a.due_at - b.due_at));
  return `<h1>Reminders</h1>
<div class="tiles"><div class="tile"><span>UPCOMING</span><b>${c('Upcoming')}</b><span>Reminders</span></div><div class="tile"><span>OVERDUE</span><b>${c('Overdue')}</b><span>Need attention</span></div><div class="tile"><span>COMPLETED</span><b>${c('Completed')}</b><span>Done</span></div></div>

<div class="reminder-main-actions">
  <button class="btn y" type="button" onclick="remForm()">
    + New reminder
  </button>
</div>
${RM.form ? formHtml() : ''}
<div class="chips">${['All', 'Upcoming', 'Overdue', 'Completed'].map((f) => `<button class="chip ${RM.flt === f ? 'on' : ''}" onclick="RM.flt='${f}';render()">${f}</button>`).join('')}</div>
<div class="card">${show.map(rItem).join('') || '<p class="mu" style="text-align:center">No reminders here yet. Tap "New reminder" to add one.</p>'}</div>
${settingsHtml()}`;
};

/* ---------- reminder actions ---------- */
function remForm(id) {
  const r = id ? RM.list.find((x) => x.id === id) : null, d = r ? new Date(r.due_at) : null, p = (n) => String(n).padStart(2, '0');
  RM.form = { id: id || null, title: r ? r.title : '', notes: r ? r.notes : '', date: d ? `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` : '', time: d ? `${p(d.getHours())}:${p(d.getMinutes())}` : '', offsets: r ? r.offsets.slice() : RM.prefs.offsets.filter((o) => o > 0) };
  render(); const t = $('rt'); if (t) t.scrollIntoView({ block: 'center' });
}
function syncForm() { if (!RM.form) return; const g = (i) => ($(i) ? $(i).value : ''); RM.form.title = g('rt'); RM.form.date = g('rd'); RM.form.time = g('rtm'); RM.form.notes = g('rn'); }
function remTog(o) { syncForm(); const a = RM.form.offsets, i = a.indexOf(o); i < 0 ? a.push(o) : a.splice(i, 1); render(); }
async function remSave() {
  syncForm();
  const f = RM.form, er = $('err'); er.textContent = '';
  if (!f.title.trim()) { er.textContent = 'Please enter a title.'; return; }
  if (!f.date || !f.time) { er.textContent = 'Please choose a date and a time.'; return; }
  const due = new Date(f.date + 'T' + f.time).getTime();
  if (isNaN(due) || due <= Date.now()) { er.textContent = 'Please choose a time in the future.'; return; }
  try {
    const body = { title: f.title, notes: f.notes, due_at: due, offsets: f.offsets };
    f.id ? await API.put('/reminders/' + f.id, body) : await API.post('/reminders', body);
    RM.form = null; await remLoad('reminders'); render(); flash(f.id ? 'Reminder updated.' : 'Reminder added. You will be notified at the due time.');
  } catch (e) { er.textContent = e.message; }
}
async function remDone(id, done) { try { await API.post('/reminders/' + id + '/complete', { done }); await remLoad('reminders'); render(); } catch (e) { flash(e.message); } }
async function remDel(id) { if (!confirm('Delete this reminder?')) return; try { await API.del('/reminders/' + id); await remLoad('reminders'); render(); } catch (e) { flash(e.message); } }
function syncPrefs() { const c = $('pauto'); if (c) RM.prefs.auto_events = c.checked ? 1 : 0; }
function prefTog(o) { syncPrefs(); const a = RM.prefs.offsets, i = a.indexOf(o); i < 0 ? a.push(o) : a.splice(i, 1); render(); }
async function savePrefs() { syncPrefs(); try { RM.prefs = await API.put('/reminders/prefs', RM.prefs); render(); flash('Notification settings saved.'); } catch (e) { flash(e.message); } }

/* ---------- push ---------- */
const b64ToU8 = (b) => { const s = atob((b + '='.repeat((4 - (b.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
async function pushOn() {
  try {
    if (await Notification.requestPermission() !== 'granted') { flash('Notifications are blocked in your browser settings.'); return; }
    const reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(RM.cfg.publicKey) }));
    await API.post('/notifications/push/subscribe', sub.toJSON());
    await remLoad('reminders'); render(); flash('Push is on for this device. Use "Send test push" to check it.');
  } catch (e) { flash('Could not turn on push: ' + e.message); }
}
async function pushOff() {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js'), sub = reg && (await reg.pushManager.getSubscription());
    if (sub) { await API.post('/notifications/push/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
    await remLoad('reminders'); render(); flash('Push is off for this device.');
  } catch (e) { flash(e.message); }
}
async function pushTest() {
  try { const r = await API.post('/notifications/push/test'); flash(r.sent ? `Sent to the push service for ${r.sent} device(s). Check your notifications.` : 'The push service did not accept the test message.'); }
  catch (e) { flash(e.message); }
}

/* ---------- notification inbox ---------- */
V.notifs = function () {
  return `<h1>Notifications</h1><div class="acts" style="margin:0 0 12px"><button class="chip on" onclick="notifReadAll()">Mark all read</button></div>
<div class="card">${RM.notifs.map((n) => `<div class="rmi ${n.read_at ? '' : 'unread'}"><div class="t">${esc(n.title)}</div><small>${esc(n.body || '')}<br>${fd(n.created_at)}${n.push_status === 'sent' ? ' · 📲 sent to push service' : n.push_status === 'failed' ? ' · push failed' : ''}</small>
<div class="acts">${n.read_at ? '' : `<button class="chip" onclick="notifRead(${n.id})">Mark read</button>`}
${n.kind === 'reminder'
  ? `<button class="chip" type="button"
       onclick="openReminderAI()">
       💬 Open Reminder AI
     </button>`
  : `<button class="chip" type="button"
       onclick="go('events')">
       View events
     </button>`
}

<button class="chip" onclick="notifDel(${n.id})">🗑</button></div></div>`).join('') || '<p class="mu" style="text-align:center">No notifications yet. Alerts from your reminders and events will show up here.</p>'}</div>`;
};
async function notifRead(id) { try { await API.post('/notifications/read', { ids: [id] }); await remLoad('notifs'); render(); setBadge(); } catch (e) { flash(e.message); } }
async function notifReadAll() { try { await API.post('/notifications/read', { all: true }); await remLoad('notifs'); render(); } catch (e) { flash(e.message); } }
async function notifDel(id) { try { await API.del('/notifications/' + id); await remLoad('notifs'); render(); } catch (e) { flash(e.message); } }

/* ---------- Floating Reminder AI: persistent Messenger-style dock ---------- */
function remWelcome() {
  if (!RM.chat.length) RM.chat.push({
    role: 'assistant', local: true,
    content: 'Hi! I am Reminder AI. I can create, show, edit, complete and delete your reminders, and tell you about upcoming events. What do you need?'
  });
}


function remDockHtml() {
  return `
    <div id="rem-ai-dock"
      class="rem-ai-dock ${RM.dockOpen ? 'expanded' : 'minimized'}">

      <!-- Minimized floating icon -->
      <button class="rem-ai-bubble" type="button"
        onclick="openReminderAI()"
        aria-label="Open Reminder AI"
        aria-expanded="${RM.dockOpen}">
        <i data-lucide="bot"></i>
      </button>

      <!-- Expanded window -->
      <section class="rem-ai-window"
        aria-label="Reminder AI chat"
        ${RM.dockOpen ? '' : 'inert'}>

        <div class="rem-ai-header">
          <div class="rem-ai-heading">
            <span class="rem-ai-avatar">
              <i data-lucide="bot"></i>
            </span>
            <div>
              <strong>Reminder AI</strong>
              <small id="rem-ai-mode">Reminder assistant</small>
            </div>
          </div>

          <div class="rem-ai-header-actions">
            <button type="button" class="rem-ai-menu-btn"
              onclick="remToggleMenu()"
              aria-label="Reminder management menu"
              aria-controls="rem-ai-tools"
              aria-expanded="false"
              title="Manage reminders">
              <i data-lucide="layout-grid"></i>
            </button>

            <button type="button" class="rem-ai-minimize"
              onclick="minimizeReminderAI()"
              aria-label="Minimize Reminder AI">
              <i data-lucide="minus"></i>
            </button>
          </div>
        </div>

        <!-- CRUD menu -->
        <div id="rem-ai-tools" class="rem-ai-tools" hidden>
          <div id="rem-ai-tools-content"></div>
        </div>

        <!-- Existing AI conversation -->
        <div class="rem-ai-chat" id="chat"
          aria-live="polite"></div>

        <div class="rem-ai-suggestions">
          ${SUGG.map(s => `
            <button class="rem-ai-suggestion"
              type="button"
              onclick="remAsk(this.textContent)">
              ${esc(s)}
            </button>
          `).join('')}
        </div>

        <form class="rem-ai-form"
          onsubmit="return remSend(event)">
          <input id="cmsg" autocomplete="off"
            maxlength="500"
            aria-label="Ask Reminder AI"
            placeholder="Ask or give a command...">

          <button class="rem-ai-send" type="submit"
            aria-label="Send message">
            <i data-lucide="send"></i>
          </button>
        </form>
      </section>
    </div>
  `;
}


/* REMINDER AI - CRUD MENU */

RM.menuMode = 'closed';
RM.menuEditId = null;
RM.menuBusy = false;

function remToggleMenu() {
  remShowMenu(RM.menuMode === 'closed' ? 'home' : 'closed');
}

function remShowMenu(mode, id = null) {
  RM.menuMode = mode;
  RM.menuEditId = id;
  remDrawMenu();
}

function remLocalDateTime(ms) {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function remDrawMenu() {
  const dock = document.getElementById('rem-ai-dock');
  if (!dock) return;

  const panel = dock.querySelector('#rem-ai-tools');
  const body = dock.querySelector('#rem-ai-tools-content');
  const button = dock.querySelector('.rem-ai-menu-btn');

  const mode = RM.menuMode;
  panel.hidden = mode === 'closed';
  button.setAttribute('aria-expanded', String(mode !== 'closed'));

  if (mode === 'closed') return;

  if (mode === 'home') {
    body.innerHTML = `
      <h3>Reminder Management</h3>
      <p class="rem-tool-sub">Choose an action below.</p>

      <div class="rem-tool-grid">
        <button onclick="remShowMenu('form')">
          <i data-lucide="plus-circle"></i>
          <span>Create Reminder</span>
        </button>

        <button onclick="remOpenList('read')">
          <i data-lucide="list-checks"></i>
          <span>View Reminders</span>
        </button>

        <button onclick="remOpenList('update')">
          <i data-lucide="pencil"></i>
          <span>Edit Reminder</span>
        </button>

        <button onclick="remOpenList('delete')">
          <i data-lucide="trash-2"></i>
          <span>Delete Reminder</span>
        </button>

        <button onclick="remOpenList('events')">
          <i data-lucide="calendar-clock"></i>
          <span>Events & Deadlines</span>
        </button>

        <button onclick="remShowMenu('closed')">
          <i data-lucide="message-circle"></i>
          <span>AI Conversation</span>
        </button>
      </div>
    `;
  }

  if (['read', 'update', 'delete'].includes(mode)) {
    const heading = {
      read: 'My Reminders',
      update: 'Edit Reminder',
      delete: 'Delete Reminder'
    }[mode];

    body.innerHTML = `
      <button class="rem-tool-back"
        onclick="remShowMenu('home')">← Back</button>
      <h3>${heading}</h3>

      <div class="rem-tool-list">
        ${RM.list.map(r => `
          <div class="rem-tool-item">
            <strong>${esc(r.title)}</strong>
            <small>${esc(fd(r.due_at))} · ${esc(r.status)}</small>
            ${r.notes ? `<small>${esc(r.notes)}</small>` : ''}

            ${mode === 'read' ? `
              <button onclick="remToolToggleDone(${r.id}, ${r.status !== 'Completed'})">
                ${r.status === 'Completed' ? 'Mark Upcoming' : 'Mark Done'}
              </button>
            ` : mode === 'update' ? `
              <button onclick="remShowMenu('form',${r.id})">
                Edit
              </button>
            ` : `
              <button class="rem-tool-danger"
                onclick="remToolDelete(${r.id})">
                Delete
              </button>
            `}
          </div>
        `).join('') || '<p class="rem-tool-sub">No reminders found.</p>'}
      </div>
    `;
  }

  if (mode === 'form') {
    const r = RM.menuEditId == null
      ? null
      : RM.list.find(x => x.id === RM.menuEditId);

    body.innerHTML = `
      <button class="rem-tool-back"
        onclick="remShowMenu('home')">← Back</button>

      <h3>${r ? 'Edit Reminder' : 'Create Reminder'}</h3>

      <form id="rem-tool-form" onsubmit="return remToolSave(event)">
        <label for="rem-tool-title">Title</label>
        <input id="rem-tool-title" required maxlength="120"
          placeholder="e.g. Submit assignment"
          value="${esc(r?.title || '')}">

        <label for="rem-tool-due">Date and Time</label>
        <input id="rem-tool-due" type="datetime-local" required
          value="${r ? remLocalDateTime(r.due_at) : ''}">

        <label for="rem-tool-notes">Notes</label>
        <textarea id="rem-tool-notes" maxlength="500"
          placeholder="Optional notes">${esc(r?.notes || '')}</textarea>

        <p id="rem-tool-error" role="alert" class="rem-tool-error"></p>

        <button class="rem-tool-submit" type="submit">
          ${r ? 'Save Changes' : 'Create Reminder'}
        </button>
      </form>
    `;
  }

  if (mode === 'events') {
    const upcoming = (S.events || [])
      .filter(e => Number(e.end_at) > Date.now())
      .sort((a, b) => a.start_at - b.start_at);

    body.innerHTML = `
      <button class="rem-tool-back"
        onclick="remShowMenu('home')">← Back</button>

      <h3>Upcoming Events & Deadlines</h3>

      <div class="rem-tool-list">
        ${upcoming.map(e => `
          <div class="rem-tool-item">
            <strong>${esc(e.title)}</strong>
            <small>Event: ${esc(fd(e.start_at))}</small>
            ${e.reg_deadline
              ? `<small>Registration deadline: ${esc(fd(e.reg_deadline))}</small>`
              : '<small>No registration deadline specified</small>'}
            <button onclick="remToolEventReminder(${e.id})">
              Remind Me
            </button>
          </div>
        `).join('') || '<p class="rem-tool-sub">No upcoming events found.</p>'}
      </div>
    `;
  }

  if (window.lucide) window.lucide.createIcons();
}

async function remOpenList(mode) {
  if (RM.menuBusy) return;
  RM.menuBusy = true;

  try {
    if (mode === 'events') {
      S.events = await API.get('/events');
    } else {
      const data = await API.get('/reminders');
      RM.list = data.reminders;
      RM.prefs = data.prefs;
    }

    remShowMenu(mode);
  } catch (e) {
    flash(e.message || 'Unable to load data.');
  } finally {
    RM.menuBusy = false;
  }
}

async function remToolSave(event) {
  event.preventDefault();
  if (RM.menuBusy) return false;

  const title = document.getElementById('rem-tool-title').value.trim();
  const dueText = document.getElementById('rem-tool-due').value;
  const notes = document.getElementById('rem-tool-notes').value.trim();
  const error = document.getElementById('rem-tool-error');
  const due = new Date(dueText).getTime();

  error.textContent = '';

  if (!title || !dueText || !Number.isFinite(due) || due <= Date.now()) {
    error.textContent = 'Enter a title and a future date and time.';
    return false;
  }

  RM.menuBusy = true;
  const submit = document.querySelector('#rem-tool-form button[type="submit"]');
  if (submit) submit.disabled = true;

  try {
    const payload = { title, notes, due_at: due };

    if (RM.menuEditId != null) {
      await API.put('/reminders/' + RM.menuEditId, payload);
      flash('Reminder updated.');
    } else {
      payload.offsets = RM.prefs.offsets.filter(x => x > 0);
      await API.post('/reminders', payload);
      flash('Reminder created.');
    }

    const data = await API.get('/reminders');
    RM.list = data.reminders;
    RM.prefs = data.prefs;

    if (S.tab === 'reminders') render();

    remShowMenu('read');
  } catch (e) {
    if (error.isConnected) {
      error.textContent = e.message || 'Unable to save reminder.';
    }
  } finally {
    RM.menuBusy = false;
    if (submit.isConnected) submit.disabled = false;
  }

  return false;
}

async function remToolDelete(id) {
  const reminder = RM.list.find(r => r.id === id);
  if (!reminder || RM.menuBusy) return;

  if (!confirm(`Delete "${reminder.title}"?`)) return;

  RM.menuBusy = true;

  try {
    await API.del('/reminders/' + id);

    const data = await API.get('/reminders');
    RM.list = data.reminders;

    if (S.tab === 'reminders') render();

    remShowMenu('delete');
    flash('Reminder deleted.');
  } catch (e) {
    flash(e.message || 'Unable to delete reminder.');
  } finally {
    RM.menuBusy = false;
  }
}

async function remToolToggleDone(id, done) {
  if (RM.menuBusy) return;
  RM.menuBusy = true;

  try {
    await API.post('/reminders/' + id + '/complete', { done });

    const data = await API.get('/reminders');
    RM.list = data.reminders;

    if (S.tab === 'reminders') render();

    remShowMenu('read');
  } catch (e) {
    flash(e.message || 'Unable to update reminder.');
  } finally {
    RM.menuBusy = false;
  }
}

function remToolEventReminder(id) {
  const e = (S.events || []).find(x => x.id == id);
  if (!e) return;

  // Prefer registration deadline when still in the future.
  const deadline = Number(e.reg_deadline);
  const due = deadline > Date.now()
    ? deadline
    : Number(e.start_at);

  if (!Number.isFinite(due) || due <= Date.now()) {
    flash('This event has no future date to remind you about.');
    return;
  }

  remShowMenu('form');

  document.getElementById('rem-tool-title').value =
    'Event: ' + e.title;

  document.getElementById('rem-tool-due').value =
    remLocalDateTime(due);

  document.getElementById('rem-tool-notes').value =
    deadline > Date.now()
      ? 'Registration deadline for ' + e.title
      : 'Upcoming event: ' + e.title;
}

// Mount OUTSIDE #app so app.js render() cannot erase the conversation window.
function syncReminderAIDock() {
  const existing = document.getElementById('rem-ai-dock');
  if (!S.user || isA()) {
    if (existing) existing.remove();
    return;
  }
  if (!existing) {
    remWelcome();
    document.body.insertAdjacentHTML('beforeend', remDockHtml());
    if (window.lucide) window.lucide.createIcons();
    updateReminderAIDock();
  }
}
function updateReminderAIDock() {
  const dock = document.getElementById('rem-ai-dock');
  if (!dock) return;
  dock.classList.toggle('expanded', RM.dockOpen);
  dock.classList.toggle('minimized', !RM.dockOpen);
  const bubble = dock.querySelector('.rem-ai-bubble');
  bubble.setAttribute('aria-expanded', String(RM.dockOpen));
  dock.querySelector('.rem-ai-window').inert = !RM.dockOpen;
  dock.querySelector('#rem-ai-mode').textContent =
    RM.aiMode === 'ai' ? 'AI mode' : RM.aiMode === 'basic' ? 'Basic mode' : 'Reminder assistant';
  remRenderChat();
}

function updateReminderAIDock() {
  const dock = document.getElementById('rem-ai-dock');
  if (!dock) return;

  dock.classList.toggle('expanded', RM.dockOpen);
  dock.classList.toggle('minimized', !RM.dockOpen);

  const bubble = dock.querySelector('.rem-ai-bubble');
  bubble.setAttribute('aria-expanded', String(RM.dockOpen));

  dock.querySelector('.rem-ai-window').inert = !RM.dockOpen;

  dock.querySelector('#rem-ai-mode').textContent =
    RM.aiMode === 'ai'
      ? 'AI mode'
      : RM.aiMode === 'basic'
      ? 'Basic mode'
      : 'Reminder assistant';

  remRenderChat();
  remDrawMenu();
}
function remRenderChat() {
  const box = document.querySelector('#rem-ai-dock #chat');
  if (!box) return;
  box.innerHTML = RM.chat.map(m =>
    `<div class="rem-ai-message ${m.role === 'user' ? 'user' : 'assistant'}">${esc(m.content)}</div>`
  ).join('') + (RM.busy ? '<div class="rem-ai-message assistant">Thinking...</div>' : '');
  const send = document.querySelector('#rem-ai-dock .rem-ai-send');
  if (send) send.disabled = RM.busy;
  chatScroll();
}
function openReminderAI() {
  RM.dockOpen = true;
  syncReminderAIDock();
  updateReminderAIDock();
  const inp = document.querySelector('#rem-ai-dock #cmsg');
  if (inp) inp.focus();
  if (RM.aiMode === null && S.user && !isA()) {
    API.get('/assistant/mode').then(d => {
      RM.aiMode = d.mode;
      updateReminderAIDock();
    }).catch(() => {});
  }
}
function minimizeReminderAI() {
  RM.dockOpen = false;
  updateReminderAIDock();
  const bubble = document.querySelector('#rem-ai-dock .rem-ai-bubble');
  if (bubble) bubble.focus();
}
const chatScroll = () => {
  const box = document.querySelector('#rem-ai-dock #chat');
  if (box) box.scrollTop = box.scrollHeight;
};
function remAsk(text) {
  const input = document.querySelector('#rem-ai-dock #cmsg');
  if (!input || RM.busy) return;
  input.value = text;
  remSend({ preventDefault() {} });
}
async function remSend(ev) {
  ev.preventDefault();
  const input = document.querySelector('#rem-ai-dock #cmsg');
  const msg = input ? input.value.trim() : '';
  if (!msg || RM.busy) return false;
  input.value = '';
  RM.chat.push({ role: 'user', content: msg });
  RM.busy = true;
  remRenderChat();
  try {
    const d = await API.post('/assistant', {
      messages: RM.chat.filter(m => !m.local).slice(-12),
      tzOffsetMin: -new Date().getTimezoneOffset()
    });
    RM.aiMode = d.mode;
    RM.chat.push({ role: 'assistant', content: d.reply + (d.note ? '\n\n(' + d.note + ')' : '') });
    if (d.changed) {
      await remLoad('assistant');
      if (S.tab === 'reminders') render();
    }
  } catch (e) {
    RM.chat.push({ role: 'assistant', local: true, content: e.message || 'Unable to connect.' });
  } finally {
    RM.busy = false;
    updateReminderAIDock();
    if (RM.dockOpen) {
      const newInput = document.querySelector('#rem-ai-dock #cmsg');
      if (newInput) newInput.focus();
    }
  }
  return false;
}



/* OPEN REMINDER AI WITHOUT PAGE REDIRECT */

const _remOriginalGo = go;

go = function(tab, ...args) {
  if (tab === 'assistant' || tab === 'reminder-ai') {
    if (S.user && !isA()) {
      openReminderAI();
    }
    return Promise.resolve();
  }

  return _remOriginalGo(tab, ...args);
};

// Fallback if an older link directly renders the assistant view.
V.assistant = function() {
  return `<h1>Reminder AI</h1><p class="mu">Use the floating Reminder AI chat on the right.</p>
    <button class="btn" onclick="openReminderAI()">Open Reminder AI</button>`;
};

// Watch only the root app's render updates, never the dock itself.
(function startReminderDock() {
  const root = document.getElementById('app');
  if (!root) {
    document.addEventListener('DOMContentLoaded', startReminderDock, {once:true});
    return;
  }
  const observer = new MutationObserver(syncReminderAIDock);
  observer.observe(root, { childList: true, attributes: true, attributeFilter: ['class'] });
  syncReminderAIDock();
})();

/* ---------- sign-out cleanup ---------- */
const _signOut = signOut;
signOut = function () { RM.list = []; RM.notifs = []; RM.unread = 0; RM.seen.clear(); RM.seenInit = false; RM.chat = []; RM.form = null; RM.aiMode = null; RM.dockOpen = false; document.getElementById('rem-ai-dock')?.remove(); _signOut(); };
