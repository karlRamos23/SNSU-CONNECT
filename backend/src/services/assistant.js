// Reminder AI. Uses Claude (Anthropic API) with tools when ANTHROPIC_API_KEY is set,
// otherwise falls back to a rule-based "basic mode". Tools always act on the signed-in student only.
const R = require('./reminders');
const N = require('./nlp');

const mode = () => (process.env.ANTHROPIC_API_KEY ? 'ai' : 'basic');

/* ---------- tools (shared by AI mode) ---------- */
const TOOLS = [
  { name: 'list_reminders', description: "List the student's reminders.", input_schema: { type: 'object', properties: { filter: { type: 'string', enum: ['all', 'upcoming', 'overdue', 'completed'] } } } },
  { name: 'create_reminder', description: 'Create a reminder. due is the student local time like 2026-10-25T15:00.', input_schema: { type: 'object', properties: { title: { type: 'string' }, due: { type: 'string' }, notes: { type: 'string' }, before_minutes: { type: 'array', items: { type: 'integer' }, description: 'Extra alerts before the due time, in minutes' } }, required: ['title', 'due'] } },
  { name: 'update_reminder', description: 'Change the title, notes or due time of a reminder by id.', input_schema: { type: 'object', properties: { id: { type: 'integer' }, title: { type: 'string' }, due: { type: 'string' }, notes: { type: 'string' } }, required: ['id'] } },
  { name: 'complete_reminder', description: 'Mark a reminder completed (or not completed with done=false).', input_schema: { type: 'object', properties: { id: { type: 'integer' }, done: { type: 'boolean' } }, required: ['id'] } },
  { name: 'delete_reminder', description: 'Permanently delete a reminder by id.', input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
  { name: 'list_events', description: 'List upcoming campus events and their registration deadlines.', input_schema: { type: 'object', properties: {} } },
];

function runTool(uid, off, name, input) {
  const view = (r) => ({ id: r.id, title: r.title, notes: r.notes, due: N.toLocalIso(r.due_at, off), status: r.status, extra_alerts_before_minutes: r.offsets });
  const need = (r) => { if (!r) throw new Error('Reminder not found'); return r; };
  switch (name) {
    case 'list_reminders': {
      const f = input.filter || 'all';
      let l = R.list(uid);
      if (f !== 'all') l = l.filter((r) => r.status.toLowerCase() === f);
      return { data: l.slice(0, 30).map(view) };
    }
    case 'create_reminder': {
      const ms = N.isoToMs(input.due, off);
      if (ms === null) throw new Error('due must look like 2026-10-25T15:00');
      return { data: view(R.create(uid, { title: input.title, notes: input.notes, due_at: ms, offsets: input.before_minutes })), changed: true };
    }
    case 'update_reminder': {
      const b = {};
      if (input.title !== undefined) b.title = input.title;
      if (input.notes !== undefined) b.notes = input.notes;
      if (input.due !== undefined) { const ms = N.isoToMs(input.due, off); if (ms === null) throw new Error('bad due'); b.due_at = ms; }
      return { data: view(need(R.update(uid, input.id, b))), changed: true };
    }
    case 'complete_reminder': return { data: view(need(R.setDone(uid, input.id, input.done !== false))), changed: true };
    case 'delete_reminder': need(R.remove(uid, input.id)); return { data: { deleted: true }, changed: true };
    case 'list_events': return { data: R.upcomingEvents(10).map((e) => ({ title: e.title, venue: e.venue, starts: N.toLocalIso(e.start_at, off), registration_deadline: e.reg_deadline ? N.toLocalIso(e.reg_deadline, off) : null })) };
  }
  throw new Error('Unknown tool');
}

/* ---------- AI mode ---------- */
function systemPrompt(off) {
  const now = Date.now(), day = N.DAYS[N.local(now, off).getUTCDay()];
  return `You are Reminder AI, the assistant inside SNSU Connects, a campus event and attendance app for Surigao del Norte State University students.
You help the student view, create, edit, complete and delete their own reminders, and answer questions about upcoming campus events and registration deadlines. Use the tools for every action and never say you did something unless a tool succeeded.
The student's current local time is ${N.toLocalIso(now, off)} (${day}). Use it to resolve words like tomorrow or next Friday, and pass dates to tools as local times like 2026-10-25T15:00.
If the date or time is missing, ask for it. Ask before deleting unless the student clearly named the reminder to delete. Keep replies short and friendly for a phone screen, in plain text without markdown.
You cannot send notifications yourself: alerts are sent by the app's scheduler. Do not promise a notification was delivered. Politely steer unrelated questions back to reminders and events.`;
}

async function aiChat(user, history, off) {
  const msgs = history.map((m) => ({ role: m.role, content: m.content }));
  let changed = false;
  for (let i = 0; i < 6; i++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 600, system: systemPrompt(off), tools: TOOLS, messages: msgs }),
    });
    if (!r.ok) throw new Error('AI service error ' + r.status);
    const d = await r.json();
    msgs.push({ role: 'assistant', content: d.content });
    const uses = d.content.filter((b) => b.type === 'tool_use');
    if (d.stop_reason !== 'tool_use' || !uses.length) {
      return { reply: d.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() || 'Done.', changed };
    }
    const results = uses.map((u) => {
      let out;
      try { out = runTool(user.id, off, u.name, u.input || {}); if (out.changed) changed = true; }
      catch (e) { out = { data: { error: e.message } }; }
      return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out.data) };
    });
    msgs.push({ role: 'user', content: results });
  }
  return { reply: 'I could not finish that request. Please try again.', changed };
}

/* ---------- basic (rule-based) mode ---------- */
const STOP = new Set('the a an my me to of for and or on at in is it that this please reminder reminders remind set add create new delete remove cancel clear mark done complete completed finish finished as move change reschedule postpone push all show list what which any have'.split(' '));
const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
function match(text, pool) {
  const w = new Set(words(text));
  if (!w.size) return [];
  const scored = pool.map((r) => ({ r, s: words(r.title).filter((x) => w.has(x)).length })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return scored.length ? scored.filter((x) => x.s === scored[0].s).map((x) => x.r) : [];
}
const line = (r, off) => `• ${r.title} - ${N.fmtLocal(r.due_at, off)} (${r.status})`;
const HELP = 'I can help you manage reminders. Try:\n• "Remind me to submit my form tomorrow at 3pm"\n• "Show my reminders" or "What is overdue?"\n• "Mark submit form as done"\n• "Move IT quiz to Friday 9am"\n• "Delete the quiz reminder"\n• "What events are coming up?"';
const ASKS = /^(Sure\. When should I remind you|What time on that day|What should I remind you about|What time should I move)/;

function basicChat(user, text, off, prevUser) {
  const uid = user.id, t = text.trim();
  const all = () => R.list(uid), pending = () => all().filter((r) => r.status !== 'Completed');

  if (/\b(remind me|(set|add|create|make) (a |an )?(new )?reminder|new reminder)\b/i.test(t)) {
    const w = N.parseWhen(t, off);
    if (!w) return { reply: 'Sure. When should I remind you? Include a date and time, for example: "Remind me to submit my form tomorrow at 3pm".' };
    const title = N.cleanTitle(w.rest);
    if (!title) return { reply: 'What should I remind you about?' };
    if (w.needTime) return { reply: `What time on that day should I remind you about "${title}"?` };
    const r = R.create(uid, { title, due_at: w.ms });
    return { reply: `Done. I set a reminder: "${r.title}" for ${N.fmtLocal(r.due_at, off)}. You will be notified at that time.`, changed: true };
  }

  if (/^(show|list|what|which|any|how many|do i have|see|view)\b/i.test(t) && !/\b(event|events|activities|deadline|deadlines)\b/i.test(t) || /\b(reminders|overdue|upcoming|to-?do)\b/i.test(t) && !/\b(delete|remove|cancel|clear|done|complete|completed|finish|move|reschedule|postpone)\b/i.test(t)) {
    let l = all(), label = 'reminders';
    if (/\boverdue|late|missed\b/i.test(t)) { l = l.filter((r) => r.status === 'Overdue'); label = 'overdue reminders'; }
    else if (/\bcompleted|done|finished\b/i.test(t)) { l = l.filter((r) => r.status === 'Completed'); label = 'completed reminders'; }
    else if (/\btoday\b/i.test(t)) { const [a, b] = N.dayBounds(off, 0); l = l.filter((r) => r.status !== 'Completed' && r.due_at >= a && r.due_at < b); label = 'reminders for today'; }
    else if (/\btomorrow\b/i.test(t)) { const [a, b] = N.dayBounds(off, 1); l = l.filter((r) => r.status !== 'Completed' && r.due_at >= a && r.due_at < b); label = 'reminders for tomorrow'; }
    else if (/\bweek\b/i.test(t)) { const b = Date.now() + 6048e5; l = l.filter((r) => r.status !== 'Completed' && r.due_at < b); label = 'reminders this week'; }
    else if (/\bupcoming|next\b/i.test(t)) { l = l.filter((r) => r.status === 'Upcoming'); label = 'upcoming reminders'; }
    if (!l.length) return { reply: `You have no ${label}.` };
    return { reply: `You have ${l.length} ${l.length === 1 ? label.replace('reminders', 'reminder') : label}:\n` + l.slice(0, 12).map((r) => line(r, off)).join('\n') + (l.length > 12 ? '\n...and more in your Reminders page.' : '') };
  }

  if (/\b(delete|remove|cancel|clear)\b/i.test(t)) {
    if (/\bcompleted\b/i.test(t)) {
      const c = all().filter((r) => r.status === 'Completed');
      c.forEach((r) => R.remove(uid, r.id));
      return { reply: c.length ? `Deleted ${c.length} completed reminder${c.length === 1 ? '' : 's'}.` : 'You have no completed reminders.', changed: c.length > 0 };
    }
    const m = match(t, all());
    if (m.length === 1) { R.remove(uid, m[0].id); return { reply: `Deleted "${m[0].title}".`, changed: true }; }
    if (m.length > 1) return { reply: 'Which one do you mean?\n' + m.map((r) => line(r, off)).join('\n') + '\nTell me more of the title.' };
    return { reply: 'I could not find a reminder like that. Say "show my reminders" to see them.' };
  }

  if (/\b(reschedule|move|postpone|push|change)\b/i.test(t)) {
    const w = N.parseWhen(t, off);
    const m = match(w ? w.rest : t, pending());
    if (!w || w.needTime) return { reply: 'What time should I move it to? Include a date and time, for example: "Move IT quiz to Friday 9am".' };
    if (m.length === 1) { const r = R.update(uid, m[0].id, { due_at: w.ms }); return { reply: `Moved "${r.title}" to ${N.fmtLocal(r.due_at, off)}.`, changed: true }; }
    if (m.length > 1) return { reply: 'Which one do you mean?\n' + m.map((r) => line(r, off)).join('\n') };
    return { reply: 'I could not find a reminder like that. Say "show my reminders" to see them.' };
  }

  if (/\b(done|completed?|finish(ed)?|mark)\b/i.test(t)) {
    const m = match(t, pending());
    if (m.length === 1) { R.setDone(uid, m[0].id, true); return { reply: `Marked "${m[0].title}" as completed.`, changed: true }; }
    if (m.length > 1) return { reply: 'Which one do you mean?\n' + m.map((r) => line(r, off)).join('\n') + '\nTell me more of the title.' };
    return { reply: 'I could not find a pending reminder like that. Say "show my reminders" to see them.' };
  }

  if (/\b(events?|activities|schedule|deadlines?|registration)\b/i.test(t)) {
    const ev = R.upcomingEvents(6);
    if (!ev.length) return { reply: 'There are no upcoming events right now.' };
    return { reply: 'Upcoming events:\n' + ev.map((e) => `• ${e.title} - ${N.fmtLocal(e.start_at, off)} at ${e.venue}${e.reg_deadline && e.reg_deadline > Date.now() ? `\n  Register by ${N.fmtLocal(e.reg_deadline, off)}` : ''}`).join('\n') + '\nSay "remind me about <event> on <date> at <time>" to set a reminder.' };
  }

  return { reply: HELP };
}

/* ---------- entry point ---------- */
async function chat(user, messages, off) {
  const clean = [];
  for (const m of Array.isArray(messages) ? messages.slice(-12) : []) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || !m.content.trim()) continue;
    const c = m.content.trim().slice(0, 1000);
    if (clean.length && clean[clean.length - 1].role === m.role) clean[clean.length - 1].content += '\n' + c;
    else clean.push({ role: m.role, content: c });
  }
  while (clean.length && clean[0].role !== 'user') clean.shift();
  if (!clean.length || clean[clean.length - 1].role !== 'user') throw new R.VErr('Send a message first.');

  const basic = () => {
    let text = clean[clean.length - 1].content, prevUser = null;
    const n = clean.length;
    if (n >= 3 && clean[n - 2].role === 'assistant' && ASKS.test(clean[n - 2].content)) text = clean[n - 3].content + ' ' + text;
    return basicChat(user, text, off, prevUser);
  };
  if (process.env.ANTHROPIC_API_KEY) {
    try { return { ...(await aiChat(user, clean, off)), mode: 'ai' }; }
    catch (e) { console.error('[assistant]', e.message); return { ...basic(), mode: 'basic', note: 'The AI service is unavailable right now, so I used basic mode.' }; }
  }
  return { ...basic(), mode: 'basic' };
}

module.exports = { chat, mode };
