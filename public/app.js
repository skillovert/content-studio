// Content Studio UI: one page, hash routes, no build step.
// Screens: playlists (#/), suggestions (#/suggest), playlist (#/p/<slug>), video (#/p/<slug>/v/<folder>), hashtags (#/hashtags).
import {recordPage} from './record.js';
import {editPage} from './edit.js';

const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
let STATE = null; // {taxonomy, playlists, beds, root}

// ---------- tiny helpers ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
async function api(method, url, data) {
  const res = await fetch(url, {method, headers: data ? {'Content-Type': 'application/json'} : {}, body: data ? JSON.stringify(data) : undefined});
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || res.statusText);
  return out;
}
function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = ''), err ? 5000 : 2200);
}
const safe = (fn) => async (...a) => {
  try {
    return await fn(...a);
  } catch (e) {
    toast(e.message, true);
  }
};
const tax = () => STATE.taxonomy;
// replaceChildren would print null/false as text; drop them
const render = (...kids) => app.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
const fieldLabel = (f) => tax().fields[f].label;
const values = (f) => tax().fields[f].values.map((v) => v.value);
// playlist names always come from the taxonomy: Topics first (same list as server/taxonomy.mjs NAME_FIELDS)
const NAME_FIELDS = ['topic', 'industry', 'breakout', 'section', 'region', 'audience', 'cause'];
const kebab = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function namePicker(current, onPick) {
  const known = NAME_FIELDS.some((f) => values(f).includes(current));
  const el = h('select', {},
    h('option', {value: '', disabled: true, selected: !known}, known || !current ? 'Pick from the taxonomy…' : `${current} (not in the taxonomy; pick one)`),
    NAME_FIELDS.map((f) => h('optgroup', {label: fieldLabel(f)}, values(f).map((v) => h('option', {value: v, selected: v === current}, v)))));
  el.onchange = () => onPick(el.value);
  return el;
}
const RULE_TEXT = {min1: 'at least one', one: 'pick one', many: 'any', optional: 'optional, one', 'optional-many': 'optional'};
const CARD_FIELDS = ['topic', 'section', 'format', 'label', 'region', 'industry', 'audience', 'breakout', 'cause'];
const DEFAULT_FIELDS = ['topic', 'section', 'label', 'cause', 'region', 'industry', 'audience', 'breakout'];
const GATE_TIP = (g) => `${g.id} · ${g.name}: ${g.detail}`;

function gateBars(gates) {
  return h('span', {class: 'gates', title: gates.map(GATE_TIP).join('\n')}, gates.map((g) => h('i', {class: g.status})));
}

// Chip picker for one taxonomy field. rule "one"/"optional" behaves like a radio.
function chipPicker(field, selected, onChange, {leadFirst = false} = {}) {
  const single = ['one', 'optional'].includes(tax().fields[field].rule);
  const box = h('div', {class: 'chips'});
  const draw = () => {
    box.replaceChildren(
      ...values(field).map((v) =>
        h('button', {
          type: 'button',
          class: 'chip' + (selected.includes(v) ? ' on' : '') + (leadFirst && selected[0] === v ? ' lead' : ''),
          title: leadFirst && selected[0] === v ? 'Lead (first picked)' : '',
          onclick: () => {
            if (selected.includes(v)) selected.splice(selected.indexOf(v), 1);
            else if (single) selected.splice(0, selected.length, v);
            else selected.push(v);
            draw();
            onChange?.();
          },
        }, field === 'label' ? `${v} News` : v),
      ),
    );
  };
  draw();
  return box;
}

// ---------- router ----------
async function route() {
  const hash = location.hash || '#/';
  document.querySelectorAll('header nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === hash));
  STATE = await api('GET', '/api/state');
  let m;
  if ((m = /^#\/p\/([a-z0-9-]+)\/v\/([A-Za-z0-9-]+)$/.exec(hash))) return videoPage(m[1], m[2]);
  if ((m = /^#\/p\/([a-z0-9-]+)\/v\/([A-Za-z0-9-]+)\/record$/.exec(hash))) return recordPage({slug: m[1], folder: m[2], h, api, toast, render});
  if ((m = /^#\/p\/([a-z0-9-]+)\/v\/([A-Za-z0-9-]+)\/edit$/.exec(hash))) return editPage({slug: m[1], folder: m[2], h, api, toast, render});
  if ((m = /^#\/p\/([a-z0-9-]+)\/new-video$/.exec(hash))) return newVideoPage(m[1]);
  if ((m = /^#\/p\/([a-z0-9-]+)(?:\/(\w+))?$/.exec(hash))) return playlistPage(m[1], m[2] || 'videos');
  if (hash === '#/suggest') return suggestPage();
  if (hash === '#/hashtags') return hashtagsPage();
  if (hash === '#/settings') return settingsPage();
  if (hash === '#/brand') return brandPage();
  if (hash === '#/new') return playlistForm(null);
  return homePage();
}
window.addEventListener('hashchange', safe(route));
$('#addVideo').addEventListener('click', () => addVideoDialog());

// ---------- home: playlists ----------
function homePage() {
  const lists = STATE.playlists;
  render(
    h('div', {class: 'row'},
      h('div', {class: 'grow'}, h('div', {class: 'label'}, [STATE.brand?.name, STATE.brand?.role].filter(Boolean).join(' · ') || 'Your channel'), h('h1', {}, 'Playlists')),
      h('a', {class: 'btn', href: '#/suggest'}, 'Suggest from Topics'),
      h('a', {class: 'btn primary', href: '#/new'}, '+ New playlist'),
    ),
    h('p', {class: 'muted'}, 'Every playlist sets the decisions its videos inherit. Open one to see its videos.'),
    lists.length
      ? h('div', {class: 'grid'}, lists.map((p) =>
          h('div', {class: 'card click', onclick: () => (location.hash = `#/p/${p.slug}`)},
            h('div', {class: 'row'}, h('span', {class: 'badge'}, p.kit && p.kit !== 'news' ? p.kitName : p.format), p.flow !== 'defined' ? h('span', {class: 'badge warn'}, 'flow not defined') : null, h('span', {class: 'grow'}), h('span', {class: 'label'}, `${p.codePrefix}01 …`)),
            h('h2', {style: 'margin:12px 0 4px'}, p.name),
            h('p', {class: 'muted', style: 'margin:0 0 12px'}, p.purpose),
            p.videos.length
              ? h('div', {class: 'stack'}, p.videos.slice(0, 5).map((v) => h('div', {class: 'row'}, h('span', {class: 'mono muted'}, v.code), h('span', {class: 'grow'}, v.title), h('span', {class: 'muted mono'}, `${v.done}/8`))))
              : h('p', {class: 'muted'}, 'No videos yet.'),
          ),
        ))
      : h('div', {class: 'card'}, h('p', {}, 'No playlists yet. '), h('a', {class: 'btn primary', href: '#/suggest'}, 'Suggest playlists from Topics')),
  );
}

// ---------- add video (template picker; graphics-driven arrives in Phase 2) ----------
function addVideoDialog(slug) {
  const dlg = $('#dlg');
  const lists = STATE.playlists;
  const pick = h('select', {}, lists.map((p) => h('option', {value: p.slug, selected: p.slug === slug}, p.name)));
  dlg.replaceChildren(
    h('h2', {}, 'Add a video'),
    h('p', {class: 'muted'}, 'Pick the playlist, then how the video is made.'),
    lists.length ? pick : h('p', {}, 'Create a playlist first.'),
    h('button', {class: 'choice', disabled: !lists.length, onclick: () => {
      dlg.close();
      location.hash = `#/p/${pick.value}/new-video`;
    }}, 'Graphics-driven', h('small', {}, 'Concept (text or PDF) → plan PDF → 540p preview → record → dubs → finals.')),
    h('button', {class: 'choice', disabled: true}, 'Creator-driven', h('small', {}, 'Filmed by the creator. Planned for later.')),
    h('div', {class: 'row', style: 'margin-top:18px;justify-content:flex-end'}, h('button', {onclick: () => dlg.close()}, 'Close')),
  );
  dlg.showModal();
}

// ---------- suggestions ----------
async function suggestPage() {
  const list = await api('GET', '/api/suggestions');
  list.sort((a, b) => b.recommended - a.recommended || a.covered.length - b.covered.length);
  const chosen = new Set(list.filter((s) => s.recommended).map((s) => s.slug));
  const count = h('span', {class: 'muted'});
  const createBtn = h('button', {class: 'primary big'});
  const sync = () => {
    count.textContent = `${chosen.size} selected`;
    createBtn.textContent = chosen.size ? `Create ${chosen.size} playlist${chosen.size > 1 ? 's' : ''}` : 'Pick some playlists';
    createBtn.disabled = !chosen.size;
  };
  createBtn.onclick = safe(async () => {
    createBtn.disabled = true;
    let made = 0;
    for (const s of list.filter((x) => chosen.has(x.slug))) {
      await api('POST', '/api/playlists', s);
      made++;
    }
    toast(`${made} playlist${made > 1 ? 's' : ''} created`);
    location.hash = '#/';
  });
  render(
    h('div', {class: 'label'}, 'Suggest playlists'),
    h('h1', {}, 'One playlist per Topic'),
    h('p', {class: 'muted'}, 'Built from the taxonomy: format News (the only defined flow), Explained as the lead Cause, a section, causes and audiences that fit the Topic. Ticked ones are recommended because your videos already cover that Topic without a playlist of its own. You can edit every decision after creating.'),
    h('div', {class: 'grid'}, list.map((s) => {
      const box = h('input', {type: 'checkbox', class: 'tick', checked: chosen.has(s.slug)});
      const card = h('label', {class: 'card suggest' + (chosen.has(s.slug) ? ' on' : '')},
        box,
        s.recommended ? h('div', {class: 'rec'}, `RECOMMENDED · USED BY ${s.usedBy.join(', ')}`) : s.covered.length ? h('div', {class: 'label'}, `Covered by ${s.covered.join(', ')}`) : h('div', {class: 'label'}, `Code ${s.codePrefix}01`),
        h('h3', {style: 'margin:8px 34px 6px 0;font-size:17px'}, s.name),
        h('div', {class: 'muted', style: 'font-size:13px'}, `${s.defaults.section.values[0]} · ${s.defaults.cause.values.join(', ')}`),
        h('div', {class: 'muted', style: 'font-size:13px'}, `For ${s.defaults.audience.values.join(', ')}`),
        h('div', {class: 'tags', style: 'margin-top:8px'}, s.hashtags.slice(0, 5).join(' ')),
      );
      box.onchange = () => {
        box.checked ? chosen.add(s.slug) : chosen.delete(s.slug);
        card.classList.toggle('on', box.checked);
        sync();
      };
      return card;
    })),
    h('div', {class: 'sticky-save'}, h('div', {class: 'inner'}, count, h('span', {class: 'grow'}), createBtn)),
  );
  sync();
}

// ---------- playlist page ----------
async function playlistPage(slug, tab) {
  const p = await api('GET', `/api/playlists/${slug}`);
  const tabs = h('div', {class: 'tabs'},
    h('button', {class: tab === 'videos' ? 'on' : '', onclick: () => (location.hash = `#/p/${slug}`)}, `Videos (${p.videos.length})`),
    h('button', {class: tab === 'decisions' ? 'on' : '', onclick: () => (location.hash = `#/p/${slug}/decisions`)}, 'Playlist decisions'),
  );
  render(
    h('div', {class: 'row'},
      h('div', {class: 'grow'},
        h('div', {class: 'row'}, h('span', {class: 'badge'}, p.kit && p.kit !== 'news' ? p.kitName : p.format), p.flow !== 'defined' ? h('span', {class: 'badge warn'}, `${p.format} flow not yet defined`) : null, h('span', {class: 'label'}, `playlists/${p.slug}`)),
        h('h1', {style: 'margin-top:8px'}, p.name),
        h('p', {class: 'muted', style: 'margin:4px 0 0'}, p.purpose),
        !p.nameField ? h('p', {class: 'problems'}, '"' + p.name + '" is not a taxonomy value. Playlist names always come from the taxonomy: press Rename and pick one.') : null,
      ),
      h('button', {onclick: () => renamePlaylistDialog(p)}, 'Rename'),
      h('button', {class: 'danger', onclick: safe(() => deletePlaylist(p))}, 'Delete'),
      h('button', {class: 'primary', onclick: () => addVideoDialog(slug)}, '+ Add video'),
    ),
    tabs,
    tab === 'decisions' ? playlistForm(p, true) : videoList(p),
  );
}

function videoList(p) {
  if (!p.videos.length) return h('div', {class: 'card'}, h('p', {}, 'No videos in this playlist yet.'), h('button', {class: 'primary', onclick: () => addVideoDialog(p.slug)}, '+ Add video'));
  return h('table', {class: 'list'},
    h('thead', {}, h('tr', {}, h('th', {}, 'Code'), h('th', {}, 'Title'), h('th', {}, 'Label · Topic'), h('th', {}, 'Process'), h('th', {}, 'Status'), h('th', {}, ''))),
    h('tbody', {}, p.videos.map((v) => {
      const next = v.gates.find((g) => g.status === 'todo' || g.status === 'warn');
      const row = p.rows[v.code];
      return h('tr', {},
        h('td', {class: 'mono muted'}, v.code),
        h('td', {}, h('a', {class: 'title', href: `#/p/${p.slug}/v/${v.folder}`}, v.title), h('div', {class: 'muted mono', style: 'font-size:12px'}, v.folder)),
        h('td', {}, (v.card?.label || []).map((l) => h('span', {class: 'badge', style: 'margin-right:6px'}, `${l} News`)), h('span', {class: 'muted'}, (v.card?.topic || []).join(', '))),
        h('td', {}, gateBars(v.gates), h('div', {class: 'muted', style: 'font-size:12px'}, next ? `Next: ${next.name}` : 'All gates passed')),
        h('td', {class: 'muted', style: 'font-size:13px;max-width:260px'}, row?.status || ''),
        h('td', {style: 'text-align:right'},
          h('a', {class: 'btn', href: `#/p/${p.slug}/v/${v.folder}`}, 'Open'), ' ',
          h('button', {class: 'link', onclick: () => renameVideoDialog(p.slug, v)}, 'Rename'),
          h('button', {class: 'link danger', onclick: safe(() => deleteVideo(p.slug, v))}, 'Delete'),
        ),
      );
    })),
  );
}

function renamePlaylistDialog(p) {
  const dlg = $('#dlg');
  let name = p.nameField ? p.name : '';
  const folder = h('p', {class: 'mono muted'}, `playlists/${p.slug}/`);
  const picker = namePicker(p.name, (v) => ((name = v), (folder.textContent = `playlists/${p.slug}/ → playlists/${kebab(v)}/`)));
  dlg.replaceChildren(
    h('h2', {}, 'Rename playlist'),
    h('p', {class: 'muted'}, 'Names come from our taxonomy (a Topic first). The folder follows the name; videos inside move with it.'),
    h('p', {class: 'label'}, 'Name'), picker,
    h('p', {class: 'label'}, 'Folder'), folder,
    h('div', {class: 'row', style: 'margin-top:18px;justify-content:flex-end'},
      h('button', {onclick: () => dlg.close()}, 'Cancel'),
      h('button', {class: 'primary', onclick: safe(async () => {
        const out = await api('POST', `/api/playlists/${p.slug}/rename`, {name});
        dlg.close();
        toast('Renamed');
        location.hash = `#/p/${out.slug}`;
        route();
      })}, 'Save'),
    ),
  );
  dlg.showModal();
}

async function deletePlaylist(p) {
  if (!confirm(`Move "${p.name}" and its ${p.videos.length} video(s) to archive/? Nothing is erased; you can move it back.`)) return;
  const out = await api('DELETE', `/api/playlists/${p.slug}`);
  toast(`Moved to ${out.archivedTo}`);
  location.hash = '#/';
}

function renameVideoDialog(slug, v) {
  const dlg = $('#dlg');
  const title = h('input', {type: 'text', value: v.title});
  const folder = h('input', {type: 'text', value: v.slug});
  dlg.replaceChildren(
    h('h2', {}, `Rename ${v.code}`),
    h('p', {class: 'label'}, 'Title'), title,
    h('p', {class: 'label'}, `Folder (${v.code}-…)`), folder,
    h('p', {class: 'muted', style: 'font-size:13px'}, 'The code stays the same. Changing the folder name renames the folder in the playlist.'),
    h('div', {class: 'row', style: 'margin-top:18px;justify-content:flex-end'},
      h('button', {onclick: () => dlg.close()}, 'Cancel'),
      h('button', {class: 'primary', onclick: safe(async () => {
        const out = await api('POST', `/api/playlists/${slug}/videos/${v.folder}/rename`, {title: title.value, slug: folder.value.trim()});
        dlg.close();
        toast('Renamed');
        if (location.hash.includes('/v/')) location.hash = `#/p/${slug}/v/${out.folder}`;
        route();
      })}, 'Save'),
    ),
  );
  dlg.showModal();
}

async function deleteVideo(slug, v) {
  if (!confirm(`Move ${v.code} "${v.title}" to archive/? Nothing is erased; you can move it back.`)) return;
  const out = await api('DELETE', `/api/playlists/${slug}/videos/${v.folder}`);
  toast(`Moved to ${out.archivedTo}`);
  location.hash = `#/p/${slug}`;
  route();
}

// ---------- playlist decisions (create + edit) ----------
function playlistForm(existing, embedded) {
  const p = structuredClone(existing || {name: '', purpose: '', format: 'News', codePrefix: '', defaults: {}, instructions: [], production: structuredClone(STATE.production)});
  for (const f of DEFAULT_FIELDS) p.defaults[f] = p.defaults[f] || {values: [], note: ''};
  const stdBox = h('div');
  const tagBox = h('div', {class: 'tags'});
  const refresh = safe(async () => {
    const card = {format: [p.format], kit: p.kit};
    for (const f of DEFAULT_FIELDS) card[f] = p.defaults[f].values;
    const out = await api('POST', '/api/preview-card', card);
    tagBox.textContent = out.hashtags.join(' ') || 'Pick Topics and Causes to get hashtags.';
    stdBox.replaceChildren(...out.standards.map((s) => h('div', {class: 'std'}, h('b', {}, s.name), h('span', {class: 'muted'}, s.rule))));
  });
  const text = (key, ph) => {
    const el = h('input', {type: 'text', value: p[key] || '', placeholder: ph});
    el.oninput = () => (p[key] = el.value);
    return el;
  };
  const purposeEl = text('purpose', 'What this playlist gives the viewer');
  const formatSel = h('select', {}, values('format').map((v) => h('option', {value: v, selected: v === p.format}, v + (tax().formats[v]?.flow === 'defined' ? '' : ' (flow not yet defined)'))));
  formatSel.onchange = () => ((p.format = formatSel.value), refresh());
  // Video kit: News (the default flow) or a ready-made flow such as Remote Documentary, which needs its hosts
  p.kit = p.kit || 'news';
  p.hosts = Array.isArray(p.hosts) ? p.hosts : [];
  const kits = STATE.kits || [];
  const hostBox = h('div');
  const drawHosts = () => {
    const kit = kits.find((k) => k.id === p.kit);
    if (!kit?.hosts) return hostBox.replaceChildren();
    if (!p.hosts.length) p.hosts.push({name: STATE.brand?.presenter?.name || '', gender: ''});
    const max = kit.maxHosts || 3;
    hostBox.replaceChildren(h('div', {class: 'field'}, h('div', {class: 'label'}, kit.edit ? 'Speakers' : 'Hosts', h('div', {class: 'rule'}, kit.edit ? `1 to ${max} people who speak in the videos; names and genders shape who says what` : '1 to 3 people on camera; names and genders shape who says what')), h('div', {},
      ...p.hosts.map((x, i) => {
        const name = h('input', {type: 'text', value: x.name, placeholder: `Host ${i + 1} name`});
        name.oninput = () => (x.name = name.value);
        const gender = h('select', {}, [['', 'Gender…'], ['female', 'Female'], ['male', 'Male']].map(([v, l]) => h('option', {value: v, selected: x.gender === v}, l)));
        gender.onchange = () => (x.gender = gender.value);
        return h('div', {style: 'display:grid;grid-template-columns:1fr 160px 90px;gap:8px;align-items:center;margin-bottom:6px'}, name, gender, p.hosts.length > 1 ? h('button', {type: 'button', onclick: () => (p.hosts.splice(i, 1), drawHosts())}, 'Remove') : h('span'));
      }),
      p.hosts.length < max ? h('button', {type: 'button', onclick: () => (p.hosts.push({name: '', gender: ''}), drawHosts())}, kit.edit ? '+ Add a speaker' : '+ Add a host') : null,
    )));
  };
  const kitSel = h('select', {}, kits.map((k) => h('option', {value: k.id, selected: k.id === p.kit}, k.name)));
  const kitAbout = h('div', {class: 'muted', style: 'margin-top:6px'});
  const showKit = () => (kitAbout.textContent = kits.find((k) => k.id === p.kit)?.about || '');
  kitSel.onchange = () => ((p.kit = kitSel.value), showKit(), drawHosts(), refresh());
  showKit();
  drawHosts();
  const field = (label, rule, ...kids) => h('div', {class: 'field'}, h('div', {class: 'label'}, label, rule ? h('div', {class: 'rule'}, rule) : null), h('div', {}, ...kids));

  const instr = h('textarea', {placeholder: 'One instruction per line, e.g. "Always show the PTA or SBP circular on screen when it exists."', style: 'min-height:110px'});
  instr.value = (p.instructions || []).join('\n');
  instr.oninput = () => (p.instructions = instr.value.split('\n'));

  const prod = p.production;
  const sel = (key, opts) => {
    const el = h('select', {}, opts.map(([v, l]) => h('option', {value: v, selected: String(prod[key]) === String(v)}, l)));
    el.onchange = () => (prod[key] = el.value);
    return el;
  };
  const bedSel = sel('bed', STATE.beds.length ? STATE.beds.map((b) => [b.id, `${b.id.toUpperCase()} · ${b.name}${b.id === 'a' ? ' (default)' : ''}`]) : [['a', 'A · Urgent Breaking (default)']]);
  const bedPlay = h('button', {type: 'button', onclick: () => {
    const b = STATE.beds.find((x) => x.id === prod.bed);
    if (!b) return;
    bedPlay.audio?.pause();
    bedPlay.audio = new Audio('/ws/' + b.mp3);
    bedPlay.audio.onerror = () => (bedPlay.audio.src = '/ws/' + b.file);
    bedPlay.audio.play();
    setTimeout(() => bedPlay.audio?.pause(), 12000);
  }}, '▶ Listen');
  const fx = h('input', {type: 'number', min: 0, max: 1, step: 0.05, value: prod.fx, style: 'width:100px'});
  fx.oninput = () => (prod.fx = Number(fx.value));
  const langs = (key, list) => {
    const box = h('div', {class: 'chips'});
    const draw = () => box.replaceChildren(...list.map(([code, name]) => h('button', {type: 'button', class: 'chip' + (prod[key].includes(code) ? ' on' : ''), onclick: () => {
      prod[key] = prod[key].includes(code) ? prod[key].filter((c) => c !== code) : [...prod[key], code];
      draw();
    }}, name)));
    draw();
    return box;
  };
  const DUBS = [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['hi', 'Hindi'], ['ar', 'Arabic'], ['de', 'German'], ['es', 'Spanish'], ['fr', 'French'], ['ps', 'Pashto'], ['bn', 'Bengali'], ['tr', 'Turkish'], ['id', 'Indonesian'], ['pt-BR', 'Portuguese (BR)'], ['it', 'Italian']];

  const save = h('button', {class: 'primary big', onclick: safe(async () => {
    const body = {...p, instructions: (p.instructions || []).filter((s) => s.trim()), hosts: (p.hosts || []).filter((x) => x.name.trim())};
    if (existing) {
      await api('PUT', `/api/playlists/${existing.slug}`, body);
      toast('Saved. Every video in this playlist uses these decisions.');
      route();
    } else {
      const out = await api('POST', '/api/playlists', body);
      toast('Playlist created');
      location.hash = `#/p/${out.slug}`;
    }
  })}, existing ? 'Save decisions' : 'Create playlist');

  const form = h('div', {},
    !embedded ? h('div', {}, h('div', {class: 'label'}, 'New playlist'), h('h1', {}, 'Playlist decisions'), h('p', {class: 'muted'}, 'These decisions pass to every video in the playlist. A Format whose flow is not yet defined can be saved as a draft, but its videos cannot be produced until the flow is defined with you (BRAND-GUIDE A3).')) : null,
    h('div', {class: 'card'},
      h('h2', {}, 'Basics'),
      field('Name', 'from the taxonomy, a Topic first', existing ? h('div', {class: 'row'}, h('b', {}, p.name), h('span', {class: 'muted'}, 'Use Rename at the top to change it.')) : namePicker(p.name, (v) => {
        p.name = v;
        if (!p.purpose) purposeEl.value = p.purpose = `${v} news for Pakistan, explained: what happened, what it means, and what you can do.`;
      })),
      field('Purpose', 'one line', purposeEl),
      kits.length > 1 ? field('Video kit', 'a ready-made flow for every video here', kitSel, kitAbout) : null,
      hostBox,
      field('Format', 'sets the structure', formatSel),
      field('Code prefix', 'letters; videos get 01, 02 …', text('codePrefix', 'e.g. C')),
    ),
    h('div', {class: 'card', style: 'margin-top:14px'},
      h('h2', {}, 'Taxonomy defaults'),
      h('p', {class: 'muted'}, 'Pre-filled on every new video\'s taxonomy card. The first Cause you pick is the lead (shown on the thumbnail).'),
      DEFAULT_FIELDS.map((f) => {
        const note = h('input', {type: 'text', class: 'note', value: p.defaults[f].note || '', placeholder: 'Rule in words (optional), e.g. "per piece"'});
        note.oninput = () => (p.defaults[f].note = note.value);
        return field(fieldLabel(f), RULE_TEXT[tax().fields[f].rule], chipPicker(f, p.defaults[f].values, refresh, {leadFirst: f === 'cause'}), note);
      }),
      field('Hashtags', 'from these defaults', tagBox),
    ),
    h('div', {class: 'card', style: 'margin-top:14px'},
      h('h2', {}, 'Standing instructions'),
      h('p', {class: 'muted'}, 'Passed to every plan, script and description in this playlist. The standards below are added automatically from the defaults; more apply per video from its own card.'),
      instr,
      h('h3', {style: 'margin-top:16px'}, 'Standards every video here must pass'),
      stdBox,
    ),
    h('div', {class: 'card', style: 'margin-top:14px'},
      h('h2', {}, 'Production defaults'),
      field('News bed', 'music under every video', h('div', {class: 'row'}, h('div', {class: 'grow'}, bedSel), bedPlay)),
      field('Theme', 'look of every video here', (() => {
        const el = h('select', {}, h('option', {value: ''}, 'Brand default'));
        api('GET', '/api/themes').then((t) => el.append(...t.themes.map((th) => h('option', {value: th.id, selected: prod.theme === th.id}, th.name))));
        el.onchange = () => (prod.theme = el.value || undefined);
        return el;
      })()),
      field('SFX + music under voice', '0 to 1 (0.6 = default)', fx),
      field('Preview', 'for your approval', sel('preview', [['540p', '540p (half of 1080p)'], ['720p', '720p']])),
      field('Final video', null, sel('finalVideo', [['1080p', '1080p (default)'], ['2k', '2K (1440p)'], ['4k', '4K (2160p)']])),
      field('Final thumbnail', null, sel('finalThumb', [['1080p', '1080p (default)'], ['2k', '2K'], ['4k', '4K']])),
      field('Subtitles', 'SRT files', langs('subtitles', [['ur-Latn', 'Roman Urdu'], ['ur-Arab', 'Urdu (script)'], ...DUBS])),
      field('Dubs', 'AI voices fitted to your timing', langs('dubs', DUBS)),
    ),
    h('div', {class: 'sticky-save'}, h('div', {class: 'inner'}, h('span', {class: 'muted'}, existing ? `Writes playlists/${existing.slug}/PLAYLIST.md and playlist.json` : 'Creates playlists/<name>/PLAYLIST.md (folder = the name in kebab case)'), h('span', {class: 'grow'}), save)),
  );
  refresh();
  if (!embedded) render(form);
  return form;
}

// ---------- video page ----------
async function videoPage(slug, folder) {
  const [p, v] = await Promise.all([api('GET', `/api/playlists/${slug}`), api('GET', `/api/playlists/${slug}/videos/${folder}`)]);
  const card = structuredClone(v.card || {notes: {}});
  for (const f of CARD_FIELDS) {
    // a new card starts from the playlist's defaults
    card[f] = card[f] || (f === 'format' ? [p.format] : [...(p.defaults[f]?.values || [])]);
  }
  const probBox = h('ul', {class: 'problems'});
  const stdBox = h('div');
  const tagBox = h('div', {class: 'tags'});
  const refresh = safe(async () => {
    const out = await api('POST', '/api/preview-card', card);
    probBox.replaceChildren(...out.problems.map((x) => h('li', {}, x)));
    tagBox.textContent = out.hashtags.join(' ');
    stdBox.replaceChildren(...out.standards.map((s) => {
      const row = v.check?.rows.find((r) => r.standard.toLowerCase().startsWith(s.name.toLowerCase().split(' ')[0]));
      return h('div', {class: 'std'}, h('b', {}, s.name), h('span', {class: 'grow muted'}, s.rule), row ? h('span', {class: 'badge ' + (/pass/i.test(row.result) ? 'dark' : 'warn')}, row.result) : h('span', {class: 'badge dark'}, 'to check'));
    }));
  });
  const files = Object.entries(v.files).filter(([, list]) => list.length);
  render(
    h('a', {href: `#/p/${slug}`, class: 'muted', style: 'text-decoration:none'}, `← ${p.name}`),
    h('div', {class: 'row', style: 'margin-top:10px'},
      h('div', {class: 'grow'},
        h('div', {class: 'row'}, (card.label || []).map((l) => h('span', {class: 'badge'}, `${l} News`)), h('span', {class: 'dot'}), h('span', {class: 'label', style: 'color:var(--white)'}, (card.topic || [])[0] || 'no topic'), h('span', {class: 'label'}, v.code)),
        h('h1', {style: 'margin-top:8px'}, v.title),
        h('div', {class: 'muted mono', style: 'font-size:12px'}, `playlists/${slug}/${v.folder}`),
      ),
      h('button', {onclick: () => renameVideoDialog(slug, v)}, 'Rename'),
      h('button', {class: 'danger', onclick: safe(() => deleteVideo(slug, v))}, 'Delete'),
    ),
    v.setup && !v.state?.plan?.approved ? videoSetupPanel(slug, p, v) : null,
    v.state?.template === 'edit' ? assetsPanel(slug, v) : null,
    v.state?.template === 'edit' ? storyPanel(slug, v) : null,
    v.state?.template === 'graphics' ? planPanel(slug, v) : null,
    v.setup?.kit && v.setup.kit !== 'news' && v.state?.plan?.approved ? footagePanel(slug, v) : null,
    v.state?.template === 'graphics' && v.state?.plan?.approved ? mediaPanel(slug, v) : null,
    v.state?.template === 'graphics' && v.state?.plan?.approved ? previewPanel(slug, v) : null,
    v.state?.template === 'graphics' && v.state?.preview?.approved ? recordPanel(slug, v) : null,
    v.state?.template === 'graphics' && v.state?.preview?.approved ? finishPanel(slug, v) : null,
    h('div', {class: 'card', style: 'margin-top:18px'},
      h('h2', {}, 'Process'),
      h('p', {class: 'muted'}, 'The 8 gates every piece passes (BRAND-GUIDE A3). Read from the folder; nothing is marked done by hand.'),
      v.gates.map((g) => h('div', {class: 'gate ' + g.status}, h('span', {class: 'n'}, g.id), h('b', {}, g.name), h('span', {class: 'd muted'}, g.detail))),
      p.rows[v.code]?.status ? h('p', {style: 'margin-top:12px'}, h('span', {class: 'label'}, 'Status · '), p.rows[v.code].status) : null,
    ),
    v.state?.template === 'graphics' && !v.state?.plan?.approved
      ? h('div', {class: 'card', style: 'margin-top:14px'}, h('h2', {}, 'Taxonomy card'), h('p', {class: 'muted'}, 'The plan proposes the card from your concept and the playlist defaults. Approving the plan writes it here; you can still change it after.'))
      : h('div', {class: 'card', style: 'margin-top:14px'},
      h('div', {class: 'row'}, h('h2', {class: 'grow'}, 'Taxonomy card'), card.date ? h('span', {class: 'label'}, card.date) : null),
      h('p', {class: 'muted'}, v.card ? 'Change what is wrong and save; it is written into the README.' : 'Pre-filled from the playlist defaults. Check it and save.'),
      probBox,
      CARD_FIELDS.map((f) => h('div', {class: 'field'}, h('div', {class: 'label'}, fieldLabel(f), h('div', {class: 'rule'}, RULE_TEXT[tax().fields[f].rule])), h('div', {}, chipPicker(f, card[f], refresh, {leadFirst: f === 'cause'}), card.notes?.[f] ? h('div', {class: 'muted note'}, `Note: ${card.notes[f]}`) : null))),
      h('div', {class: 'field'}, h('div', {class: 'label'}, 'Hashtags'), tagBox),
      h('div', {class: 'row', style: 'margin-top:14px;justify-content:flex-end'}, h('button', {class: 'primary', onclick: safe(async () => {
        await api('PUT', `/api/playlists/${slug}/videos/${folder}/card`, card);
        toast('Card saved to README.md');
        route();
      })}, 'Save card')),
    ),
    h('div', {class: 'card', style: 'margin-top:14px'},
      h('h2', {}, 'Standards for this video'),
      h('p', {class: 'muted'}, v.check?.ownerVerdict ? `Owner's verdict: ${v.check.ownerVerdict}` : 'From the card. Publishing is blocked until each one is confirmed.'),
      stdBox,
    ),
    files.length
      ? h('div', {class: 'card', style: 'margin-top:14px'}, h('h2', {}, 'Files'), files.map(([k, list]) => h('div', {class: 'std'}, h('b', {}, k + '/'), h('span', {}, list.map((f, i) => [i ? ', ' : null, h('a', {href: `/ws/playlists/${slug}/${v.folder}/${k}/${f}`, target: '_blank'}, f)])))))
      : null,
  );
  refresh();
}

// ---------- hashtags per taxonomy value ----------
function hashtagsPage() {
  const t = tax();
  render(
    h('div', {class: 'label'}, 'Taxonomy'),
    h('h1', {}, 'Hashtags'),
    h('p', {class: 'muted'}, 'Every description gets hashtags from its taxonomy card, in this order: Topic, Breakout, News label, Cause, Region, Industry, Audience. Edit any hashtag; leave it empty to never use one for that value. Saved in brand/taxonomy.json.'),
    ...t.order.map((f) =>
      h('div', {class: 'card', style: 'margin-top:14px'},
        h('h2', {}, t.fields[f].label),
        h('table', {class: 'list'}, h('tbody', {}, t.fields[f].values.map((v) => {
          const input = h('input', {type: 'text', value: v.hashtag, placeholder: 'no hashtag', style: 'max-width:280px'});
          input.onchange = safe(async () => {
            await api('PUT', '/api/taxonomy/hashtag', {field: f, value: v.value, hashtag: input.value});
            toast(`${v.value}: ${input.value || 'no hashtag'}`);
          });
          return h('tr', {}, h('td', {style: 'width:240px'}, f === 'label' ? `${v.value} News` : v.value), h('td', {}, input));
        }))),
      ),
    ),
  );
}

// ---------- what one video sets for itself: kind of video, format, speakers ----------
// The playlist gives the defaults; a video may differ (a two-host episode, an analysis in a news playlist).
const kitById = (id) => (STATE.kits || []).find((k) => k.id === id) || {id: 'news', name: 'News'};
const flowOf = (kit, format) => (kit !== 'news' || STATE.taxonomy?.formats?.[format]?.flow === 'defined' ? 'defined' : 'not yet defined');

/** The playlist as this new video sees it, with what the creator changed for it. */
function withSetup(p, over) {
  const kit = over.kit || p.kit;
  const format = over.format || p.format;
  const hosts = over.hosts || p.hosts || [];
  return {...p, kit, kitName: kitById(kit).name, format, hosts, flow: flowOf(kit, format)};
}

/** Controls for kind of video, format and hosts. `cur` is the effective setup; `change(patch)` applies a change.
 * `lockEdit`: an existing video cannot switch between an edit of own footage and a planned video. */
function setupFields(p, cur, change, {lockEdit = false} = {}) {
  const kits = (STATE.kits || []).filter((k) => !lockEdit || Boolean(k.edit) === Boolean(kitById(cur.kit).edit));
  const kitSel = h('select', {}, kits.map((k) => h('option', {value: k.id, selected: k.id === cur.kit}, k.name + (k.id === p.kit ? ' (playlist default)' : ''))));
  kitSel.onchange = () => change({kit: kitSel.value});
  const formats = (STATE.taxonomy?.fields?.format?.values || []).map((x) => x.value);
  const fmtSel = h('select', {}, formats.map((f) => h('option', {value: f, selected: f === cur.format}, f + (f === p.format ? ' (playlist default)' : '') + (flowOf('news', f) === 'defined' ? '' : ' · flow not defined'))));
  fmtSel.onchange = () => change({format: fmtSel.value});
  const kit = kitById(cur.kit);
  const hosts = (cur.hosts || []).map((x) => ({...x}));
  const hostBox = h('div');
  const drawHosts = () => {
    const max = kit.maxHosts || 3;
    hostBox.replaceChildren(
      ...hosts.map((x, i) => {
        const name = h('input', {type: 'text', value: x.name, placeholder: 'Name'});
        name.onchange = () => ((x.name = name.value), change({hosts: hosts.filter((y) => y.name.trim())}));
        const gender = h('select', {}, [['', 'Gender'], ['female', 'Female'], ['male', 'Male']].map(([v, l]) => h('option', {value: v, selected: x.gender === v}, l)));
        gender.onchange = () => ((x.gender = gender.value), change({hosts: hosts.filter((y) => y.name.trim())}));
        return h('div', {style: 'display:grid;grid-template-columns:1fr 140px 90px;gap:8px;align-items:center;margin-bottom:6px'}, name, gender,
          hosts.length > 1 ? h('button', {type: 'button', onclick: () => (hosts.splice(i, 1), change({hosts: hosts.filter((y) => y.name.trim())}))}, 'Remove') : h('span'));
      }),
      ...(hosts.length < max ? [h('button', {type: 'button', onclick: () => (hosts.push({name: '', gender: ''}), drawHosts())}, kit.edit ? '+ Add a speaker' : '+ Add a host')] : []),
    );
  };
  drawHosts();
  return [
    h('div', {class: 'field'}, h('div', {class: 'label'}, 'Kind of video', h('div', {class: 'rule'}, 'the playlist\'s, or one for this video')), h('div', {}, kitSel, h('div', {class: 'muted', style: 'font-size:13px;margin-top:4px'}, kit.about || ''))),
    cur.kit === 'news' ? h('div', {class: 'field'}, h('div', {class: 'label'}, 'Format', h('div', {class: 'rule'}, 'its flow decides the story shape')), fmtSel) : null,
    kit.hosts ? h('div', {class: 'field'}, h('div', {class: 'label'}, kit.edit ? 'Speakers' : 'Hosts', h('div', {class: 'rule'}, 'names and genders shape the script and the dub voices')), hostBox) : null,
  ];
}

// ---------- Phase 2: new graphics-driven video ----------
async function newVideoPage(slug, over = {}, base = null) {
  const playlist = base || await api('GET', `/api/playlists/${slug}`);
  const p = withSetup(playlist, over);
  const again = (patch) => newVideoPage(slug, {...over, ...patch}, playlist);
  const setup = () => setupFields(playlist, p, again);
  const s = await api('GET', '/api/settings');
  if (kitById(p.kit).edit) return newEditPage(slug, p, over, setup);
  const kit = p.kit && p.kit !== 'news'; // a kit from the app (e.g. Remote Documentary: Travel and Places)
  const title = h('input', {type: 'text', placeholder: kit ? 'e.g. Istanbul, Hunza Valley, Bali' : 'e.g. PTA phone tax explained'});
  const concept = h('textarea', {style: 'min-height:160px', placeholder: kit
    ? 'Your idea or your own plan, as much as you have: the angle, chapters, places and sights, a route ("Lahore → Istanbul by air, ferry to Kadıköy"), maps you want ("atlas map of Sultanahmet, Galata, Kadıköy"), prices you know, lines you want said. Everything here is kept; the rest is researched and added. Paste links too.'
    : 'What happened, why it matters, the angle you want, anything you already know. Paste links too.'});
  const links = h('textarea', {style: 'min-height:60px', placeholder: 'Links (one per line), optional'});
  let pdf = null;
  const fileName = h('span', {class: 'muted'}, 'No PDF chosen');
  const file = h('input', {type: 'file', accept: 'application/pdf', style: 'display:none', onchange: () => {
    const f = file.files[0];
    if (!f) return;
    if (f.size > 45 * 1024 * 1024) return toast('PDF is too large (max 45 MB)', true);
    const r = new FileReader();
    r.onload = () => {
      pdf = {name: f.name, data: r.result};
      fileName.textContent = `${f.name} · ${(f.size / 1024 / 1024).toFixed(1)} MB`;
      if (!title.value) title.value = f.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
    };
    r.readAsDataURL(f);
  }});
  const drop = h('div', {class: 'card', style: 'border-style:dashed;text-align:center;cursor:pointer;padding:26px', onclick: () => file.click()},
    h('div', {style: 'font-size:17px;font-weight:600'}, 'Concept PDF (recommended)'),
    h('div', {class: 'muted'}, 'Click to choose, or drop it here. Sources, screenshots and notes inside it are used in the plan.'),
    h('div', {style: 'margin-top:8px'}, fileName), file);
  drop.ondragover = (e) => e.preventDefault();
  drop.ondrop = (e) => {
    e.preventDefault();
    const dt = new DataTransfer();
    dt.items.add(e.dataTransfer.files[0]);
    file.files = dt.files;
    file.onchange();
  };
  // with the creator on camera, or graphics only (the brand may fix it for every video)
  const rule = STATE.brand?.face || 'ask';
  let face = rule === 'always';
  const faceBox = h('div', {class: 'row'});
  // with the face: how much of the video shows you, and how long each time before the visuals take over
  let faceAmount = 'balanced';
  let faceSeconds = 6;
  const pills = (opts, cur, pick) => h('div', {class: 'row', style: 'gap:6px'}, ...opts.map(([v, l]) => h('button', {class: cur === v ? 'primary' : '', onclick: () => (pick(v), drawFace())}, l)));
  const custom = h('input', {type: 'number', min: 1, max: 30, step: 0.5, placeholder: 's', style: 'width:80px'});
  custom.oninput = () => (faceSeconds = Number(custom.value) || 0);
  const drawFace = () => faceBox.replaceChildren(
    ...[[true, 'With my face', 'You appear on camera at chosen moments and speak the script.'], [false, 'Graphics only', 'Graphics carry the video; you record your voice.']].map(([val, name, about]) =>
      h('div', {class: 'card' + (rule === 'ask' ? ' click' : ''), style: `flex:1;min-width:240px;padding:14px;${face === val ? 'outline:2px solid var(--cyan)' : 'opacity:.6'}`, onclick: () => rule === 'ask' && ((face = val), drawFace())}, h('b', {}, name), h('div', {class: 'muted', style: 'font-size:13px'}, about))),
    face ? h('div', {style: 'flex-basis:100%;margin-top:6px'},
      h('div', {class: 'muted', style: 'font-size:13px;margin-bottom:6px'}, 'How much should the video show you? The plan places you in varied styles (full, side, split, circle, corner, TV, phone) to match.'),
      pills([['little', 'A little (~15%)'], ['balanced', 'Balanced (~30%)'], ['lots', 'A lot (~55%)']], faceAmount, (v) => (faceAmount = v)),
      h('div', {class: 'muted', style: 'font-size:13px;margin:12px 0 6px'}, 'How long on camera each time? Then the visuals take the screen and you read the rest of the line off camera.'),
      h('div', {class: 'row', style: 'gap:6px'}, pills([[3, '3 s'], [6, '6 s'], [9, '9 s'], [0, 'Whole line']], [3, 6, 9, 0].includes(faceSeconds) && !custom.value ? faceSeconds : null, (v) => ((faceSeconds = v), (custom.value = ''))), h('span', {class: 'muted'}, 'or'), custom, h('span', {class: 'muted'}, 'seconds')))
      : null);
  drawFace();
  // kit videos: how long (the destination decides within it); the hosts are the playlist's
  let length = 'standard';
  const lengthBox = h('div', {class: 'row', style: 'gap:6px'});
  const drawLength = () => lengthBox.replaceChildren(...Object.entries(STATE.lengths || {short: [12, 16], standard: [18, 24], long: [25, 30]}).map(([k, [a, b]]) => h('button', {class: length === k ? 'primary' : '', onclick: () => ((length = k), drawLength())}, `${k[0].toUpperCase() + k.slice(1)} · ${a} to ${b} min`)));
  drawLength();
  const go = h('button', {class: 'primary big', onclick: safe(async () => {
    go.disabled = true;
    go.textContent = 'Creating…';
    try {
      const v = await api('POST', `/api/playlists/${slug}/videos`, {title: title.value, concept: concept.value, links: links.value, pdf, face, faceAmount, faceSeconds, length, ...over});
      await api('POST', `/api/playlists/${slug}/videos/${v.folder}/plan`, {});
      location.hash = `#/p/${slug}/v/${v.folder}`;
    } finally {
      go.disabled = false;
      go.textContent = 'Create and make the plan';
    }
  })}, 'Create and make the plan');
  render(
    h('a', {href: `#/p/${slug}`, class: 'muted', style: 'text-decoration:none'}, `← ${p.name}`),
    h('div', {class: 'label', style: 'margin-top:10px'}, `New video · ${kit ? p.kitName : p.format}`),
    h('h1', {}, kit ? 'Which destination?' : 'What is the video about?'),
    p.flow !== 'defined' ? h('p', {class: 'problems'}, `The ${p.format} flow is not defined yet, so a video cannot be made in it yet. Pick another format, or define the flow with Claude first (BRAND-GUIDE A3).`) : null,
    h('div', {class: 'card', style: 'margin-top:14px'},
      ...setup(),
      h('div', {class: 'field'}, h('div', {class: 'label'}, kit ? 'Destination' : 'Name'), title),
      ...(kit ? [
        h('div', {class: 'field'}, h('div', {class: 'label'}, 'Length', h('div', {class: 'rule'}, 'the destination decides within it')), lengthBox),
      ] : []),
      h('div', {class: 'field'}, h('div', {class: 'label'}, kit ? 'Your plan or idea' : 'Concept', h('div', {class: 'rule'}, kit ? 'optional: anything from one line to a full plan; it is kept and built out' : 'text, a PDF, or both')), h('div', {}, drop, h('div', {style: 'margin-top:12px'}, concept))),
      h('div', {class: 'field'}, h('div', {class: 'label'}, 'Links'), links),
      kit ? null : h('div', {class: 'field'}, h('div', {class: 'label'}, 'On camera', h('div', {class: 'rule'}, rule === 'ask' ? 'pick one' : 'set for every video on the Brand page')), faceBox),
    ),
    h('p', {class: 'muted'}, s.hasKey
      ? kit ? `Next: Claude (${s.model}) researches the destination (official tourism, advisories, climate, prices), writes the script for your hosts turn by turn, and plans every scene: footage shots with search words, maps, weather, budgets, phrases, manners and the verdict, plus your studio moments. It takes a few minutes.` : `Next: Claude (${s.model}) researches the latest facts, checks the standards for this playlist and writes the plan PDF: scenes with sources, voice-over script and captions with timings. It takes a few minutes.`
      : 'No API key is set, so Content Studio writes a brief for Claude in the project and imports the plan when it is ready. Add a key in Settings for one-click plans.'),
    h('div', {class: 'sticky-save'}, h('div', {class: 'inner'}, h('span', {class: 'muted'}, `Creates playlists/${slug}/<code>-<name>/`), h('span', {class: 'grow'}), go)),
  );
}

// New edited video (Travel Video Editing kit): a name, the story (now or later), then the footage on the video page.
function newEditPage(slug, p, over = {}, setup = () => []) {
  const title = h('input', {type: 'text', placeholder: 'e.g. Hunza road trip, Skardu in winter, Lahore food walk'});
  const story = h('textarea', {style: 'min-height:180px', placeholder: 'Optional now, you can tell it after adding the footage. What happened, in order; the moments that matter; who you met; what the viewer should feel; the hook you want; what to generate (a map of the drive, the costs, a reference to a news story); clips that must stay as they are (a talk with locals); where you want to speak to the camera.'});
  const go = h('button', {class: 'primary big', onclick: safe(async () => {
    go.disabled = true;
    try {
      const v = await api('POST', `/api/playlists/${slug}/videos`, {title: title.value, concept: story.value, ...over});
      location.hash = `#/p/${slug}/v/${v.folder}`;
    } finally {
      go.disabled = false;
    }
  })}, 'Create and add the footage');
  render(
    h('a', {href: `#/p/${slug}`, class: 'muted', style: 'text-decoration:none'}, `← ${p.name}`),
    h('div', {class: 'label', style: 'margin-top:10px'}, `New video · ${p.kitName}`),
    h('h1', {}, 'Which trip?'),
    h('div', {class: 'card', style: 'margin-top:14px'},
      ...setup(),
      h('div', {class: 'field'}, h('div', {class: 'label'}, 'Trip'), title),
      h('div', {class: 'field'}, h('div', {class: 'label'}, 'The story', h('div', {class: 'rule'}, 'optional now; one line or a full outline')), story)),
    h('p', {class: 'muted'}, 'Next: add your clips, photos, voice notes and music. Content Studio makes light working copies, stills and waveforms of each, so even 4K files edit smoothly. Your originals are never changed.'),
    h('div', {class: 'sticky-save'}, h('div', {class: 'inner'}, h('span', {class: 'muted'}, `Creates playlists/${slug}/<code>-<name>/raw/`), h('span', {class: 'grow'}), go)),
  );
}

// What this video sets for itself (kind, format, speakers), changeable until its plan is approved.
function videoSetupPanel(slug, p, v) {
  const box = h('div', {class: 'card', style: 'margin-top:18px'});
  const draw = (cur) => {
    const own = cur.own || {};
    const summary = [cur.kitName, cur.kit === 'news' ? cur.format : null, cur.hosts?.length && kitById(cur.kit).hosts ? cur.hosts.map((x) => x.name).join(', ') : null].filter(Boolean).join(' · ');
    const differs = own.kit || own.format || own.hosts;
    box.replaceChildren(...[
      h('div', {class: 'row'}, h('h2', {class: 'grow'}, 'This video'), differs ? h('button', {onclick: safe(async () => draw(await api('PUT', `/api/playlists/${slug}/videos/${v.folder}/setup`, {kit: null, format: null, hosts: null})))}, 'Back to the playlist\'s') : null),
      h('p', {class: 'muted'}, `${summary}. ${differs ? 'Set for this video; the playlist\'s defaults stay as they are.' : 'The playlist\'s defaults. Change them here when this video is different.'}`),
      ...setupFields(p, cur, safe(async (patch) => draw(await api('PUT', `/api/playlists/${slug}/videos/${v.folder}/setup`, patch))), {lockEdit: true}),
      cur.flow !== 'defined' ? h('p', {class: 'problems'}, `The ${cur.format} flow is not defined yet, so this video cannot be planned in it.`) : null,
    ].filter(Boolean));
  };
  draw(v.setup);
  return box;
}

// Assets of an edited video: the originals in raw/ with their working copies, stills, waveform and sound.
function assetsPanel(slug, v) {
  const base = `/api/playlists/${slug}/videos/${v.folder}/assets`;
  const box = h('div', {class: 'card', style: 'margin-top:18px'}, h('h2', {}, 'Footage and files'), h('p', {class: 'muted'}, 'Loading…'));
  const ws = (f) => `/ws/playlists/${slug}/${v.folder}/${f}`;
  let timer = null;
  const pick = h('input', {type: 'file', multiple: true, accept: 'video/*,audio/*,image/*,.heic,.mts', style: 'display:none'});
  const progress = h('span', {class: 'muted'});
  const sendFiles = async (files) => {
    for (const [i, f] of [...files].entries()) {
      progress.textContent = `Uploading ${i + 1} of ${files.length}: ${f.name}`;
      await new Promise((resolve, reject) => {
        const x = new XMLHttpRequest();
        x.open('POST', `${base}/upload?name=${encodeURIComponent(f.name)}`);
        x.setRequestHeader('Content-Type', 'application/octet-stream');
        x.upload.onprogress = (e) => e.lengthComputable && (progress.textContent = `Uploading ${i + 1} of ${files.length}: ${f.name} · ${Math.round((e.loaded / e.total) * 100)}%`);
        x.onload = () => (x.status < 300 ? resolve() : reject(new Error(JSON.parse(x.responseText || '{}').error || `Upload failed (${x.status})`)));
        x.onerror = () => reject(new Error('Upload failed'));
        x.send(f);
      });
    }
    progress.textContent = '';
    draw(await api('POST', `${base}/process`));
  };
  pick.onchange = safe(() => sendFiles(pick.files));
  const fmt = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)}m ${String(Math.round(sec % 60)).padStart(2, '0')}s` : `${Math.round(sec * 10) / 10}s`);
  const mb = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
  const share = (ranges, dur) => (dur ? Math.round((100 * (ranges || []).reduce((n, [a, b]) => n + b - a, 0)) / dur) : 0);
  const card = (a) => h('div', {class: 'card', style: 'padding:10px'},
    a.ready && a.stills?.length ? h('div', {style: 'display:flex;gap:3px;overflow-x:auto'}, ...a.stills.slice(0, 8).map((st) => h('img', {src: ws(st.file), title: fmt(st.t), style: 'height:62px;border-radius:4px'}))) : h('div', {class: 'muted', style: 'height:62px;display:flex;align-items:center'}, a.error && !a.ready ? `Could not read it: ${a.error}` : a.kind === 'audio' && a.ready ? '♪ audio' : 'Not processed yet'),
    h('b', {style: 'display:block;margin-top:6px;word-break:break-all'}, a.file),
    h('div', {class: 'row', style: 'margin-top:4px;flex-wrap:wrap;gap:6px'},
      h('span', {class: 'badge dark'}, a.kind),
      a.dur ? h('span', {class: 'label'}, fmt(a.dur)) : null,
      a.transcript ? h('span', {class: 'badge', title: 'What is said is written down'}, 'words') : null,
      a.w ? h('span', {class: 'label'}, `${a.w}×${a.h}${a.fps ? ` · ${Math.round(a.fps)} fps` : ''}${a.hdr ? ' · HDR' : ''}`) : null,
      h('span', {class: 'label'}, mb(a.size))),
    a.ready ? h('div', {class: 'muted', style: 'font-size:12px;margin-top:4px'},
      [a.kind !== 'image' ? (a.audio === false ? 'no sound' : `sound in ${share(a.sound, a.dur)}%`) : null, a.dark?.length ? `${a.dark.length} dark part${a.dark.length > 1 ? 's' : ''}` : null, a.stills?.length > 1 ? `${a.stills.length} scenes` : null, a.created ? `recorded ${new Date(a.created).toLocaleString()}` : null, a.place ? `at ${a.place.lat.toFixed(3)}, ${a.place.lon.toFixed(3)}` : null].filter(Boolean).join(' · ')) : null,
    a.ready && a.kind === 'video' ? h('video', {controls: true, preload: 'none', src: ws(a.proxy), poster: a.stills?.[0] ? ws(a.stills[0].file) : undefined, style: 'width:100%;margin-top:6px;border-radius:6px'}) : null,
    a.ready && a.kind === 'audio' ? h('audio', {controls: true, preload: 'none', src: ws(a.proxy), style: 'width:100%;margin-top:6px'}) : null);
  const draw = (st) => {
    if (!document.body.contains(box) && timer) return clearInterval(timer);
    const running = st.job?.status === 'running';
    const busy = running || st.speech?.job?.status === 'running';
    if (busy) timer = timer || setInterval(() => api('GET', base).then(draw).catch(() => {}), 2500);
    else if (timer) (clearInterval(timer), (timer = null));
    const counts = ['video', 'image', 'audio'].map((k) => [k, st.assets.filter((a) => a.kind === k)]).filter(([, l]) => l.length);
    const total = st.assets.reduce((n, a) => n + (a.dur || 0), 0);
    box.replaceChildren(...[
      h('div', {class: 'row'}, h('h2', {class: 'grow'}, 'Footage and files'),
        st.assets.length ? h('span', {class: 'label'}, [...counts.map(([k, l]) => `${l.length} ${k === 'image' ? 'photo' : k}${l.length > 1 ? 's' : ''}`), total ? fmt(total) : null].filter(Boolean).join(' · ')) : null),
      h('p', {class: 'muted'}, `Add everything from the trip: clips (phone, camera, drone), photos, voice notes, music. Upload here, or copy them into ${st.raw}/ (folders inside are fine) and press "Read new files". Originals are never changed; light working copies, a still at every scene change and the waveform are made for editing.`),
      h('div', {class: 'row', style: 'gap:8px;flex-wrap:wrap'},
        h('button', {class: 'primary', disabled: running, onclick: () => pick.click()}, 'Upload files'),
        st.assets.some((a) => a.ready) ? h('a', {class: 'btn primary', href: `#/p/${slug}/v/${v.folder}/edit`}, 'Open the editor') : null,
        h('button', {disabled: running || !st.waiting, onclick: safe(async () => draw(await api('POST', `${base}/process`)))}, st.waiting ? `Read new files (${st.waiting})` : 'All files read'),
        ...[running ? h('span', {class: 'muted'}, `Working ${st.job.done + 1} of ${st.job.total}: ${st.job.current} · ${st.job.stage || ''}`) : null, progress, pick].filter(Boolean)),
      st.job?.status === 'error' ? h('p', {class: 'muted', style: 'color:var(--danger)'}, st.job.error) : null,
      speechRow(st),
      st.assets.length ? h('div', {class: 'grid', style: 'margin-top:12px;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));align-items:start'}, ...st.assets.map(card)) : h('p', {class: 'muted', style: 'margin-top:12px'}, 'No files yet.'),
    ].filter(Boolean));
  };
  // what is said in the clips (speech to text, set up once in Settings)
  const speechRow = (st) => {
    const sp = st.speech || {};
    const listening = sp.job?.status === 'running';
    const said = st.assets.filter((a) => a.transcript).length;
    if (!sp.ready) return h('p', {class: 'muted', style: 'margin-top:8px'}, 'So Claude knows what is said in each clip, install speech to text once in ', h('a', {href: '#/settings'}, 'Settings'), '.');
    return h('div', {class: 'row', style: 'gap:8px;margin-top:8px;flex-wrap:wrap'},
      h('span', {class: 'muted'}, listening ? `Listening ${sp.job.done + 1} of ${sp.job.total}: ${sp.job.current || ''}` : `What is said: ${said} clip${said === 1 ? '' : 's'} done${sp.waiting ? `, ${sp.waiting} to go` : ''}`),
      sp.waiting && !listening ? h('button', {onclick: safe(async () => draw(await api('POST', `${base}/transcribe`, {})))}, 'Listen to the clips') : null,
      sp.job?.status === 'error' ? h('span', {class: 'muted', style: 'color:var(--danger)'}, sp.job.error) : null);
  };
  box.ondragover = (e) => e.preventDefault();
  box.ondrop = safe((e) => (e.preventDefault(), sendFiles(e.dataTransfer.files)));
  api('GET', base).then(draw).catch((e) => toast(e.message, true));
  return box;
}

// The story of an edited video and Claude's first cut: Claude reads the story and the footage log and puts a cut
// on the timeline (with an API key), or writes a brief for a project thread (without one).
function storyPanel(slug, v) {
  const base = `/api/playlists/${slug}/videos/${v.folder}`;
  const box = h('div', {class: 'card', style: 'margin-top:14px'}, h('h2', {}, 'Story and first cut'), h('p', {class: 'muted'}, 'Loading…'));
  const text = h('textarea', {style: 'min-height:170px', placeholder: 'Tell the story of the trip: what happened, in order; the moments that matter and who you met; what the viewer should feel; the hook you want; which clips must stay as they are (a talk with locals); where you want to speak to the camera; what to show as a graphic (the drive on a map, the costs, a news story to reference). One line works too; Claude finds the rest in the footage.'});
  let timer = null;
  let loaded = false;
  const draw = (st) => {
    if (!document.body.contains(box) && timer) return clearInterval(timer);
    const running = st.job?.status === 'running';
    if (running) timer = timer || setInterval(() => api('GET', `${base}/cut`).then(draw).catch(() => {}), 2500);
    else if (timer) (clearInterval(timer), (timer = null));
    if (!loaded) ((text.value = st.story), (loaded = true));
    const saveStory = () => api('PUT', `${base}/story`, {story: text.value});
    box.replaceChildren(...[
      h('h2', {}, 'Story and first cut'),
      h('p', {class: 'muted'}, 'Claude reads your story with what is said and seen in every clip, and puts a first cut on the timeline: the hook, the scenes, real moments with their own sound, voice-over lines for each speaker, pieces to camera to record, graphics with their facts, and spaces for clips still missing. You change anything after.'),
      text,
      h('div', {class: 'row', style: 'margin-top:10px;gap:8px;flex-wrap:wrap'},
        h('button', {disabled: running, onclick: safe(async () => (await saveStory(), toast('Story saved')))}, 'Save story'),
        h('button', {class: 'primary', disabled: running, onclick: safe(async () => {
          await saveStory();
          draw(await api('POST', `${base}/cut`));
        })}, st.cut ? 'Make a new cut' : 'Make the first cut'),
        st.handoff ? h('button', {onclick: safe(async () => (draw(await api('POST', `${base}/cut/import`)), toast('The cut is on the timeline')))}, 'Check for the cut') : null,
        st.cut ? h('a', {class: 'btn', href: `#/p/${slug}/v/${v.folder}/edit`}, 'Open the editor') : null),
      running ? h('div', {class: 'working', style: 'margin-top:10px'}, h('span', {class: 'spin'}), h('div', {}, h('b', {}, 'Claude is cutting the video…'), h('ul', {class: 'log'}, ...(st.job.log || []).map((l) => h('li', {}, l))))) : null,
      st.job?.status === 'error' ? h('p', {class: 'muted', style: 'color:var(--danger)'}, st.job.error) : null,
      !st.hasKey && st.handoff ? h('p', {class: 'muted', style: 'margin-top:10px'}, 'No API key is set, so the brief is in ', h('span', {class: 'mono'}, `${v.folder}/edit/brief.md`), '. Paste this in the project chat: ', h('span', {class: 'mono'}, `Please open a new thread for this cut: ${v.code} ${v.title}. Follow playlists/${slug}/${v.folder}/edit/brief.md`), ', then press "Check for the cut" when it says the file is written.') : null,
      st.cut ? h('div', {style: 'margin-top:12px'},
        h('b', {}, st.cut.title || 'The cut'), h('p', {class: 'muted', style: 'margin:4px 0'}, st.cut.summary || ''),
        st.cut.music ? h('p', {class: 'muted', style: 'margin:4px 0'}, `Music: ${st.cut.music.mood}${st.cut.music.where ? ` · ${st.cut.music.where}` : ''}`) : null,
        st.cut.questions?.length ? h('div', {}, h('div', {class: 'label', style: 'margin-top:8px'}, 'Questions for you'), h('ul', {}, ...st.cut.questions.map((q) => h('li', {}, q)))) : null,
        st.cut.cuts?.length ? h('div', {}, h('div', {class: 'label', style: 'margin-top:8px'}, 'Left out'), h('ul', {class: 'muted'}, ...st.cut.cuts.map((q) => h('li', {}, q)))) : null) : null,
    ].filter(Boolean));
  };
  api('GET', `${base}/cut`).then(draw).catch((e) => toast(e.message, true));
  return box;
}

const PIPELINE = [['Concept', 1], ['Plan', 2], ['Preview', 3], ['Record', 4], ['Finish', 5], ['Derived', 6]];

function planPanel(slug, v) {
  const box = h('div', {class: 'card', style: 'margin-top:18px'});
  const base = `/api/playlists/${slug}/videos/${v.folder}/plan`;
  let timer = null;
  const draw = async () => {
    const st = await api('GET', base);
    if (!document.body.contains(box) && timer) return clearInterval(timer);
    const stepState = (n) => (n === 1 ? 'done' : n === 2 ? (st.approved ? 'done' : 'now') : n === 3 ? (v.state?.preview?.approved ? 'done' : st.approved ? 'now' : 'later') : n === 4 && v.state?.preview?.approved ? 'now' : 'later');
    const steps = h('div', {class: 'pipeline'}, PIPELINE.map(([name, n]) => h('div', {class: 'step ' + stepState(n)}, h('span', {class: 'n'}, n), name, n > 4 ? h('small', {}, `Phase ${n}`) : null)));
    const kids = [steps];
    const job = st.job;
    if (job?.status === 'running') {
      kids.push(h('div', {class: 'working'}, h('span', {class: 'spin'}), h('div', {}, h('b', {}, `Claude is making the plan${st.current ? ` v${st.current + 1}` : ''}…`), h('div', {class: 'muted'}, `Started ${new Date(job.started).toLocaleTimeString()}. You can leave this page; it keeps going.`), h('ul', {class: 'log'}, (job.log || []).map((l) => h('li', {}, l))))));
      timer = timer || setInterval(() => draw().catch(() => {}), 3000);
    } else if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (job?.status === 'error') kids.push(h('div', {class: 'problems', style: 'margin:12px 0'}, `Plan failed: ${job.error}`), h('button', {class: 'primary', onclick: safe(async () => (await api('POST', base, {}), draw()))}, 'Try again'));
    if (job?.status === 'handoff' && (!st.plan || st.versions.slice(-1)[0] === st.current)) {
      const ask = `Please open a new thread for this video plan: ${v.code} "${v.title}". Follow playlists/${slug}/${v.folder}/plan/brief.md and keep all talk about this plan in that thread.`;
      kids.push(h('div', {class: 'handoff'},
        h('b', {}, 'Waiting for Claude in the project'),
        h('p', {class: 'muted'}, 'No API key is set, so the brief is written to the video\'s plan folder. Paste this in the project chat (not in a tool thread). Claude opens a separate thread just for this video\'s plan, so plan questions and changes stay there. When Claude says the plan is written, press Check for plan:'),
        h('div', {class: 'row'}, h('code', {class: 'grow'}, ask), h('button', {onclick: () => (navigator.clipboard?.writeText(ask), toast('Copied'))}, 'Copy')),
        h('div', {class: 'row', style: 'margin-top:12px'}, h('button', {class: 'primary', onclick: safe(async () => (await api('POST', `${base}/import`), toast('Plan imported'), route()))}, 'Check for plan'), h('a', {class: 'btn', href: '#/settings'}, 'Add an API key instead')),
      ));
    }
    if (!st.plan && !job) kids.push(h('button', {class: 'primary big', onclick: safe(async () => (await api('POST', base, {}), draw()))}, 'Make the plan'));
    if (st.plan) kids.push(planView(slug, v, st, base, draw));
    box.replaceChildren(...kids);
  };
  draw().catch((e) => toast(e.message, true));
  return box;
}

function planView(slug, v, st, base, redraw) {
  const p = st.plan;
  const folder = `/ws/playlists/${slug}/${v.folder}/plan/`;
  const missing = (p.meta.requiredStandards || []).filter((n) => !p.standards.some((s) => s.name === n));
  const feedback = h('textarea', {placeholder: 'What should change? e.g. "Open with the Pakistan angle; drop the map; add the PTA statement of 20 Oct."'});
  const busy = st.job?.status === 'running';
  const urdu = (p.thumbnail.urduLine || '').split('\n').map((line) => h('div', {}, ...line.split(/(\[\[[^\]]+\]\])/).map((part) => (part.startsWith('[[') ? h('u', {}, part.slice(2, -2)) : part))));
  return h('div', {},
    h('div', {class: 'row', style: 'margin:16px 0 6px'},
      h('h2', {class: 'grow'}, `Plan v${st.current}`, st.approved?.version === st.current ? h('span', {class: 'badge', style: 'margin-left:10px;background:var(--green);color:#000'}, `Approved ${st.approved.at}`) : null),
      st.pdf ? h('a', {class: 'btn primary', href: folder + st.pdf, target: '_blank'}, 'Open plan PDF') : h('button', {onclick: safe(async () => (await api('POST', `${base}/pdf`), redraw()))}, 'Make PDF'),
      st.versions.length > 1 ? h('span', {class: 'muted'}, `${st.versions.length} versions kept`) : null,
    ),
    h('p', {class: 'vo'}, p.titleRoman),
    h('p', {class: 'muted'}, p.summary),
    h('div', {class: 'row', style: 'gap:18px;margin:8px 0 14px'},
      ...[['As of', p.asOf], ['Label', p.newsLabel ? `${p.newsLabel} News` : 'none'], ['Length', clockOf(p.duration)], ['Scenes', p.scenes.length], ['Sources', p.sources.length], ['By', p.meta.by === 'api' ? 'Claude (API)' : 'Claude (brief)']].map(([k, val]) => h('div', {}, h('div', {class: 'label'}, k), h('div', {style: 'font-weight:600'}, val))),
    ),
    missing.length ? h('p', {class: 'problems'}, `Standards the card needs but the plan does not address: ${missing.join(', ')}.`) : null,
    p.openQuestions?.length ? h('div', {class: 'handoff'}, h('b', {}, 'Open questions'), h('ul', {}, p.openQuestions.map((q) => h('li', {}, q)))) : null,
    h('table', {class: 'list', style: 'margin-top:10px'},
      h('thead', {}, h('tr', {}, h('th', {}, 'Time'), h('th', {}, 'Scene'), h('th', {}, 'First line'), h('th', {}, 'Lines'))),
      h('tbody', {}, p.scenes.map((s) => h('tr', {}, h('td', {class: 'mono muted'}, clockOf(s.start)), h('td', {}, h('b', {}, s.title), h('div', {class: 'label'}, s.kind)), h('td', {class: 'muted', style: 'font-size:13px'}, s.lines[0]?.vo), h('td', {class: 'mono'}, s.lines.length)))),
    ),
    h('div', {class: 'grid', style: 'margin-top:14px'},
      h('div', {class: 'card'}, h('div', {class: 'label'}, 'Proposed card'), ['topic', 'section', 'region', 'cause', 'audience', 'industry', 'breakout'].map((f) => {
        const val = [].concat(p.card[f] || []);
        return val.length ? h('div', {style: 'margin-top:6px'}, h('span', {class: 'muted'}, fieldLabel(f) + ': '), val.join(', ')) : null;
      }), h('div', {class: 'tags', style: 'margin-top:10px'}, (p.meta.hashtags || []).join(' '))),
      h('div', {class: 'card'}, h('div', {class: 'label'}, 'Thumbnail'), h('div', {style: 'font:800 30px Geist;margin-top:6px'}, p.thumbnail.jargonTitle), h('div', {class: 'urdu'}, urdu),
        ...(p.thumbnail.lines || []).map((l) => h('div', {style: 'margin-top:6px;white-space:pre-line'}, h('span', {class: 'muted'}, `${l.lang}: `), l.text.replace(/\[\[|\]\]/g, ''))),
        stampPicker(slug, v, v.state?.thumbStamp || {mode: 'plan', text: ''}, p.thumbnail.stamp),
        themePicker(slug, v, v.state?.theme, Boolean(v.state?.preview?.approved))),
    ),
    h('div', {class: 'card', style: 'margin-top:14px'},
      h('div', {class: 'row'},
        h('button', {class: 'primary big', disabled: busy || st.approved?.version === st.current, onclick: safe(async () => {
          await api('POST', `${base}/approve`);
          toast('Plan approved. The preview is being made.');
          route();
        })}, st.approved?.version === st.current ? 'Approved' : 'Approve plan'),
        h('span', {class: 'muted grow'}, 'Approving writes the taxonomy card and standards list into the README and a YouTube draft with sources, then starts the 540p preview and sample thumbnail.'),
      ),
      h('div', {style: 'margin-top:14px'}, h('div', {class: 'label'}, 'Or request changes'), feedback,
        h('div', {class: 'row', style: 'margin-top:8px;justify-content:flex-end'}, h('button', {disabled: busy, onclick: safe(async () => {
          if (!feedback.value.trim()) return toast('Write what should change', true);
          await api('POST', base, {feedback: feedback.value});
          toast(`Making v${st.versions.slice(-1)[0] + 1}…`);
          redraw();
        })}, 'Make a new version'))),
    ),
  );
}
// ---------- preview (Phase 3) ----------
const STAGE = {install: 'Installing the video tools (first time only)…', bundle: 'Preparing the scenes…', thumbnail: 'Drawing the sample thumbnail…', stills: 'Drawing stills…', video: 'Rendering the 540p preview'};

/** The preview video with its script beside it (captions are not burnt into videos): the line being
 * said is highlighted as it plays, and a click on a line jumps there. */
function previewVideo(src, made) {
  const video = h('video', {src, controls: true, preload: 'metadata', style: 'width:100%;margin-top:6px;border-radius:10px;background:#000'});
  const lines = (made.script || []).map((l) => h('div', {class: 'scriptline', style: 'padding:6px 10px;border-radius:8px;cursor:pointer', onclick: () => ((video.currentTime = l.start), video.play())}, h('span', {class: 'muted', style: 'font-family:monospace;margin-right:8px'}, clockOf(l.start)), l.vo));
  video.ontimeupdate = () => {
    const t = video.currentTime;
    (made.script || []).forEach((l, i) => {
      const on = t >= l.start && t < l.end;
      lines[i].style.background = on ? 'rgba(52,214,224,0.15)' : '';
      if (on && lines[i].dataset.on !== '1') lines[i].scrollIntoView({block: 'nearest'});
      lines[i].dataset.on = on ? '1' : '';
    });
  };
  return h('div', {}, h('div', {class: 'label'}, `Video · ${clockOf(made.duration)} · 960×540`), video,
    lines.length ? h('div', {style: 'max-height:220px;overflow:auto;margin-top:8px;font-size:14px'}, ...lines) : null);
}

/** Thumbnail stamp for this video: the plan's suggestion, the creator's own words, or none. */
function stampPicker(slug, v, choice, suggested, onSaved) {
  const base = `/api/playlists/${slug}/videos/${v.folder}/preview/stamp`;
  if (STATE.brand?.thumbnail?.stamp === 'none') return h('p', {class: 'muted'}, 'Thumbnail stamp: none (brand setting).');
  const mode = h('select', {},
    h('option', {value: 'plan', selected: choice.mode === 'plan'}, suggested ? `Suggested: ${suggested}` : 'Suggested: none'),
    h('option', {value: 'custom', selected: choice.mode === 'custom'}, 'My own words…'),
    h('option', {value: 'none', selected: choice.mode === 'none'}, 'No stamp'));
  const text = h('input', {value: choice.text || '', placeholder: 'e.g. UPDATE NOW · STAY SAFE', style: choice.mode === 'custom' ? '' : 'display:none'});
  mode.onchange = () => (text.style.display = mode.value === 'custom' ? '' : 'none');
  return h('div', {class: 'row', style: 'margin-top:8px;align-items:center;gap:8px'},
    h('span', {class: 'label', style: 'margin:0'}, 'Thumbnail stamp'), mode, text,
    h('button', {onclick: safe(async () => {
      await api('PUT', base, {mode: mode.value, text: text.value});
      toast(mode.value === 'none' ? 'No stamp on this thumbnail' : 'Stamp saved');
      onSaved && onSaved();
    })}, 'Save'));
}

function previewPanel(slug, v) {
  const box = h('div', {class: 'card', style: 'margin-top:18px'});
  const base = `/api/playlists/${slug}/videos/${v.folder}/preview`;
  const folder = `/ws/playlists/${slug}/${v.folder}/preview/`;
  let timer = null;
  const draw = async () => {
    const st = await api('GET', base);
    if (!document.body.contains(box) && timer) return clearInterval(timer);
    const job = st.job;
    const running = job?.status === 'running';
    if (running) timer = timer || setInterval(() => draw().catch(() => {}), 2000);
    else if (timer) (clearInterval(timer), (timer = null));
    const approved = st.approved && st.approved.version === st.current;
    const kids = [h('div', {class: 'row'},
      h('h2', {class: 'grow'}, st.current ? `Preview v${st.current}` : 'Preview', approved ? h('span', {class: 'badge', style: 'margin-left:10px;background:var(--green);color:#000'}, `Approved ${st.approved.at}`) : null),
      st.versions.length > 1 ? h('span', {class: 'muted'}, `${st.versions.length} versions kept`) : null)];
    kids.push(h('p', {class: 'muted'}, 'A 540p video built from the approved plan in your brand\'s look, and a sample thumbnail. The script runs beside the video (no captions are burnt in; your voice comes at Record). Nothing final is made before you approve them.'));
    if (running) {
      const pct = job.stage === 'video' ? ` ${Math.round((job.progress || 0) * 100)}%` : '';
      kids.push(h('div', {class: 'working'}, h('span', {class: 'spin'}), h('div', {}, h('b', {}, (STAGE[job.stage] || 'Working…') + pct), h('div', {class: 'muted'}, `Started ${new Date(job.started).toLocaleTimeString()}. You can leave this page; it keeps going.`))));
    }
    if (job?.status === 'error') kids.push(h('div', {class: 'problems', style: 'margin:12px 0;white-space:pre-wrap'}, `Preview failed: ${job.error}`));
    if (st.stale && !running) kids.push(h('p', {class: 'problems'}, `This preview is from plan v${st.made.planVersion}; the approved plan is v${st.planApproved}. Make a new preview.`));
    if (st.video || st.thumb) {
      kids.push(h('div', {class: 'grid', style: 'margin-top:12px;grid-template-columns:repeat(auto-fill,minmax(420px,1fr))'},
        st.video ? previewVideo(folder + st.video, st.made) : null,
        st.thumb ? h('div', {}, h('div', {class: 'label'}, `Sample thumbnail${st.made?.thumbs ? ` · ${st.made.props?.lang || ''}` : ''} · 1920×1080`), h('a', {href: folder + st.thumb, target: '_blank'}, h('img', {src: folder + st.thumb, style: 'width:100%;margin-top:6px;border-radius:10px'}))) : null,
        // one more thumbnail per dub language
        ...Object.entries(st.made?.thumbs || {}).map(([lang, f]) => h('div', {}, h('div', {class: 'label'}, `Thumbnail · ${lang}`), h('a', {href: folder + f, target: '_blank'}, h('img', {src: folder + f, style: 'width:100%;margin-top:6px;border-radius:10px'}))))));
    }
    if (!running) kids.push(stampPicker(slug, v, st.stamp, st.planStamp, () => toast('Press "Make it again" to see it on the thumbnail')));
    if (!running) kids.push(themePicker(slug, v, st.theme, Boolean(approved), () => toast('Press "Make it again" to see the new theme')));
    if (st.made?.direction?.summary) kids.push(h('p', {class: 'muted', style: 'margin-top:8px'}, `Added on its own from the plan's sources and script: ${st.made.direction.summary}.`));
    const feedback = h('textarea', {placeholder: 'What should change? e.g. "Timeline: add 22 Oct advisory. Thumbnail stamp: PATCH NOW · 22 OCT."'});
    const actions = h('div', {class: 'row', style: 'margin-top:14px'});
    if (st.current && !running && !st.stale) {
      actions.append(h('button', {class: 'primary big', disabled: approved, onclick: safe(async () => {
        await api('POST', `${base}/approve`);
        toast('Preview approved. Recording is next.');
        route();
      })}, approved ? 'Approved' : 'Approve preview and thumbnail'));
    }
    if (!running) actions.append(h('button', {onclick: safe(async () => (await api('POST', base, {}), draw()))}, st.current ? 'Make it again' : 'Make preview'));
    kids.push(actions);
    if (st.current && !running) {
      kids.push(h('div', {style: 'margin-top:14px'}, h('div', {class: 'label'}, 'Or ask for changes'), feedback,
        h('div', {class: 'row', style: 'margin-top:8px;justify-content:flex-end'},
          h('span', {class: 'muted grow', style: 'font-size:13px'}, 'Changes go into a new plan version (script, graphics or thumbnail). Approve it and the preview is made again.'),
          h('button', {onclick: safe(async () => {
            if (!feedback.value.trim()) return toast('Write what should change', true);
            await api('POST', `/api/playlists/${slug}/videos/${v.folder}/plan`, {feedback: `Preview v${st.current} feedback: ${feedback.value}`});
            toast('Making a new plan version…');
            route();
          })}, 'Send changes'))));
    }
    box.replaceChildren(...kids);
  };
  draw().catch((e) => toast(e.message, true));
  return box;
}

/** Recording: progress per language, and the way into the recording page. */
function recordPanel(slug, v) {
  const box = h('div', {class: 'card', style: 'margin-top:18px'}, h('h2', {}, 'Record'), h('p', {class: 'muted'}, 'Loading…'));
  api('GET', `/api/playlists/${slug}/videos/${v.folder}/record`).then((st) => {
    const rows = st.langs.map((l, i) => {
      const c = st.check[l];
      return h('div', {class: 'std'}, h('b', {}, i ? `Dub · ${l}` : `Voice · ${l}`), h('span', {class: 'grow muted'}, `${c.done} / ${c.total} lines${c.silent.length ? ` · ${c.silent.length} silent` : ''}`), h('span', {class: 'badge ' + (c.complete ? '' : 'dark')}, c.complete ? 'done' : 'to record'));
    });
    box.replaceChildren(
      h('div', {class: 'row'}, h('h2', {class: 'grow'}, 'Record'), h('span', {class: 'label'}, st.face ? 'with your face' : 'graphics only')),
      h('p', {class: 'muted'}, st.face ? 'Record the script line by line against the approved preview: face lines with your camera, the rest with your voice.' : 'Record the script line by line against the approved preview.'),
      ...rows,
      h('div', {class: 'row', style: 'margin-top:14px'}, h('a', {class: 'btn primary big', href: `#/p/${slug}/v/${v.folder}/record`}, 'Open the recording studio')));
  }).catch((e) => toast(e.message, true));
  return box;
}

// Finish: re-time to the real voices, one voice track + subtitles per language, a check video each.
function finishPanel(slug, v) {
  const base = `/api/playlists/${slug}/videos/${v.folder}/finish`;
  const box = h('div', {class: 'card', style: 'margin-top:14px'}, h('h2', {}, 'Finish'), h('p', {class: 'muted'}, 'Loading…'));
  const file = (f) => `/ws/playlists/${slug}/${v.folder}/${f}?t=${Date.now()}`;
  let timer = null;
  const draw = (st) => {
    if (!document.body.contains(box) && timer) return clearInterval(timer);
    const running = st.job?.status === 'running';
    if (running) timer = timer || setInterval(() => api('GET', base).then(draw).catch(() => {}), 2500);
    else if (timer) (clearInterval(timer), (timer = null));
    const make = h('button', {class: 'primary', onclick: safe(async () => {
      make.disabled = true;
      make.textContent = 'Working…';
      draw(await api('POST', base));
      toast('Voice tracks and subtitles made');
    })}, st.made ? 'Make again (after new takes)' : 'Make voice tracks and subtitles');
    const rows = st.langs.map((l, i) => {
      const busy = running && st.job.lang === l.lang;
      return h('div', {class: 'std', style: 'flex-wrap:wrap'},
        h('b', {}, i ? `Dub · ${l.lang}` : `Voice · ${l.lang}`),
        h('span', {class: 'grow muted'}, l.placed == null ? 'not made yet' : `${l.placed} lines placed${l.missing?.length ? ` · ${l.missing.length} missing` : ''}`),
        l.audio ? h('audio', {controls: true, preload: 'none', src: file(l.audio), style: 'height:32px'}) : null,
        l.srt ? h('a', {href: file(l.srt), target: '_blank'}, 'Subtitles (.srt)') : null,
        l.audio ? h('button', {disabled: running, onclick: safe(async () => draw(await api('POST', `${base}/check`, {lang: l.lang})))}, busy ? `Rendering ${st.job.stage} ${Math.round((st.job.progress || 0) * 100)}%` : l.video ? 'Render check video again' : 'Render check video') : null,
        l.video && !busy ? h('video', {controls: true, preload: 'none', src: file(l.video), style: 'width:100%;max-width:640px;margin-top:8px;border-radius:8px'}) : null,
        l.audio ? finalRow(l, st, running) : null);
    });
    const err = st.job?.status === 'error' ? h('p', {class: 'muted', style: 'color:var(--danger)'}, `${st.job.kind === 'final' ? 'Final video' : 'Check video'} failed: ${st.job.error}`) : null;
    box.replaceChildren(
      h('div', {class: 'row'}, h('h2', {class: 'grow'}, 'Finish'), st.made ? h('span', {class: 'label'}, `${clockOf(st.duration)} · made ${new Date(st.made).toLocaleString()}`) : null),
      h('p', {class: 'muted'}, 'Every line gets as long as its longest language, so the scenes cut where the voices end. Then one full-length voice track and subtitles per language. The check video shows the graphics on the new timing with that voice, the music and sound effects a little lower. The final video adds your camera takes in their slots (a face line without a take shows its graphic) and renders at 1080p, 2K or 4K; 4K takes about four times as long as 1080p.'),
      ...rows,
      ...(err ? [err] : []),
      h('div', {class: 'row', style: 'margin-top:14px'}, make, h('span', {class: 'muted', style: 'font-size:13px'}, 'Lines not recorded yet stay silent and keep the planned length.')));
  };
  // final video per language: pick a size, render; each size made so far is a download link
  const SIZE_NAME = {1080: '1080p (HD)', 1440: '2K (1440p)', 2160: '4K (2160p)'};
  const finalRow = (l, st, running) => {
    const busy = running && st.job.kind === 'final' && st.job.lang === l.lang;
    const size = h('select', {style: 'width:auto', disabled: running}, ...st.sizes.map((x) => h('option', {value: x}, SIZE_NAME[x] || `${x}p`)));
    const made = st.sizes.filter((x) => l.finals?.[x]);
    return h('div', {class: 'row', style: 'width:100%;margin-top:8px;flex-wrap:wrap;gap:8px'},
      h('span', {class: 'muted'}, 'Final video'),
      size,
      h('button', {class: 'primary', disabled: running, onclick: safe(async () => draw(await api('POST', `${base}/final`, {lang: l.lang, size: size.value})))},
        busy ? `Rendering ${SIZE_NAME[st.job.size] || ''} · ${st.job.stage} ${Math.round((st.job.progress || 0) * 100)}%` : 'Render final'),
      ...made.map((x) => h('a', {href: file(l.finals[x]), download: ''}, `Download ${SIZE_NAME[x] || x}`)));
  };
  api('GET', base).then(draw).catch((e) => toast(e.message, true));
  return box;
}

const clockOf = (sec) => `${Math.floor((sec || 0) / 60)}:${String(Math.floor((sec || 0) % 60)).padStart(2, '0')}`;

// ---------- settings ----------
// ---------- themes (server/themes.mjs) ----------
/** Theme cards with reference stills; picking one sets the brand's default (saved with "Save brand"). */
// ---------- cutout styles (server/cutouts.mjs) ----------
/** Every cutout category with a sample still per style; the brand keeps all or some (saved with "Save brand"). */
function cutoutSection(b) {
  const box = h('div', {class: 'card', style: 'margin-top:14px'}, h('h2', {}, 'Cutout styles'), h('p', {class: 'muted'}, 'Loading…'));
  b.cutouts = b.cutouts || {};
  b.cutoutPlace = b.cutoutPlace || {};
  let timer = null;
  let cats = null;
  const draw = async () => {
    const t = await api('GET', '/api/cutouts');
    cats = t.categories;
    if (!document.body.contains(box) && timer) return clearInterval(timer);
    const running = t.job?.status === 'running';
    if (running) timer = timer || setInterval(() => draw().catch(() => {}), 3000);
    else if (timer) (clearInterval(timer), (timer = null));
    paint(running, t.job);
  };
  const paint = (running, job) => {
    const make = h('button', {disabled: running, onclick: safe(async () => (await api('POST', '/api/cutouts/samples', {place: b.cutoutPlace}), draw()))}, running ? `Making sample stills… ${Math.round((job.progress || 0) * 100)}%` : 'Make sample stills');
    const makeTravel = cats.some((c) => c.group === 'travel') && !running ? h('button', {onclick: safe(async () => (await api('POST', '/api/cutouts/samples', {place: b.cutoutPlace, only: ['travel']}), draw()))}, 'Travel samples only') : null;
    let group = null;
    box.replaceChildren(
      h('div', {class: 'row'}, h('h2', {class: 'grow'}, 'Cutout styles'), makeTravel, make),
      h('p', {class: 'muted'}, 'The pre-built looks for reference flashes, people and quotes, source captures, keywords, maps, clip and audio players and photos. Keep the ones that fit your brand; every video rotates through the kept styles, so videos stay consistent. All are drawn in your brand colours and the video\'s theme. Each group takes the full screen for its moment, or sits on one side of the scene if you choose "Over the scene". Sample stills use your default theme and the placement chosen here: make them again after changing either.'),
      ...(job?.status === 'error' ? [h('p', {class: 'muted', style: 'color:var(--danger)'}, job.error)] : []),
      ...cats.map((c) => {
        const all = c.styles.map((x) => x.id);
        const on = b.cutouts[c.id]?.length ? b.cutouts[c.id] : all;
        const set = (ids) => {
          if (!ids.length) return toast('Keep at least one style', true);
          if (ids.length === all.length) delete b.cutouts[c.id];
          else b.cutouts[c.id] = all.filter((x) => ids.includes(x));
          paint(running, job);
        };
        const head = c.group === 'travel' && group !== 'travel'
          ? h('div', {style: 'margin-top:28px;border-top:1px solid var(--line, #333);padding-top:16px'}, h('h2', {}, (group = 'travel') && 'Travel and places graphics'), h('p', {class: 'muted'}, 'Used by the Remote Documentary kit: place labels, maps, routes, weather, prices, phrases, manners and verdicts, in your brand colours. Every video rotates through the kept styles.'))
          : null;
        return h('div', {style: 'margin-top:18px'},
          head,
          h('div', {class: 'row'}, h('b', {class: 'grow'}, c.name),
            c.graphic ? null : h('select', {style: 'width:auto', onchange: (e) => (e.target.value === 'over' ? (b.cutoutPlace[c.id] = 'over') : delete b.cutoutPlace[c.id])},
              ...[['full', 'Full screen'], ['over', 'Over the scene']].map(([v, t]) => h('option', {value: v, selected: (b.cutoutPlace[c.id] || 'full') === v}, t))),
            h('span', {class: 'muted', style: 'font-size:13px'}, `${on.length} of ${all.length} kept`), on.length < all.length ? h('button', {class: 'link', onclick: () => set(all)}, 'Keep all') : null),
          h('div', {class: 'muted', style: 'font-size:13px;margin:2px 0 8px'}, c.about),
          h('div', {class: 'cut-grid'}, c.styles.map((st) => {
            const kept = on.includes(st.id);
            return h('div', {class: 'card click cut' + (kept ? ' on' : ''), onclick: () => set(kept ? on.filter((x) => x !== st.id) : [...on, st.id])},
              st.sample ? h('img', {src: st.sample, loading: 'lazy'}) : h('div', {class: 'cut-empty muted'}, 'No sample yet'),
              h('div', {class: 'row', style: 'margin-top:8px'}, h('b', {class: 'grow'}, st.name), h('span', {class: 'badge ' + (kept ? '' : 'dark')}, kept ? 'Kept' : 'Off')),
              h('div', {class: 'muted', style: 'font-size:12px;margin-top:4px'}, st.about));
          })));
      }),
      h('p', {class: 'muted', style: 'margin-top:12px'}, 'Changes are saved with "Save brand".'));
  };
  draw().catch((e) => toast(e.message, true));
  return box;
}

// ---------- footage slots of a kit video (server/footage.mjs) ----------
function footagePanel(slug, v) {
  const base = `/api/playlists/${slug}/videos/${v.folder}/footage`;
  const box = h('div', {class: 'card', style: 'margin-top:14px'}, h('h2', {}, 'Footage'), h('p', {class: 'muted'}, 'Loading…'));
  let timer = null;
  const search = (site, q) => {
    const w = encodeURIComponent(q);
    return {Pexels: `https://www.pexels.com/search/videos/${w}/`, Pixabay: `https://pixabay.com/videos/search/${w}/`, Storyblocks: `https://www.storyblocks.com/video/search/${w}`}[site];
  };
  const upload = (slot) => {
    const input = h('input', {type: 'file', accept: 'video/*,image/*', hidden: true});
    input.onchange = safe(async () => {
      const f = input.files[0];
      if (!f) return;
      toast(`Uploading ${f.name}…`);
      const res = await fetch(`${base}/${slot}?name=${encodeURIComponent(f.name)}`, {method: 'POST', headers: {'Content-Type': f.type || 'application/octet-stream'}, body: f});
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || res.statusText);
      draw(out);
      toast('Added');
    });
    return h('span', {}, input, h('button', {onclick: () => input.click()}, 'Upload'));
  };
  const draw = (st) => {
    clearTimeout(timer);
    const job = st.job;
    const running = job?.status === 'running';
    if (running && document.body.contains(box)) timer = setTimeout(() => api('GET', base).then(draw).catch(() => {}), 2500);
    const fill = h('button', {class: 'primary', disabled: running || !st.hasPexels || st.filled === st.total, onclick: safe(async () => draw(await api('POST', `${base}/fill`)))}, running ? `Fetching ${job.done}/${job.total}…` : 'Fill empty slots from Pexels');
    let scene = null;
    box.replaceChildren(...[
      h('div', {class: 'row'}, h('h2', {class: 'grow'}, 'Footage'), h('span', {class: 'badge ' + (st.filled === st.total ? 'dark' : 'warn')}, `${st.filled}/${st.total} filled`), fill),
      h('p', {class: 'muted'}, 'Every B-roll shot of the plan has a slot. Upload your own licensed clip or photo for a slot, or fill the empty ones from Pexels (free for commercial use; credits go in the description). Empty slots show as marked placeholders in the preview, so you can review before you have every clip.'),
      !st.hasPexels ? h('p', {class: 'muted', style: 'color:var(--amber)'}, 'To fill from Pexels, add your free Pexels API key in ', h('a', {href: '#/settings'}, 'Settings'), '.') : null,
      job?.status === 'error' ? h('p', {class: 'muted', style: 'color:var(--red)'}, job.error) : null,
      job?.status === 'done' ? h('p', {class: 'muted'}, `Pexels: ${job.done} slots searched. ${job.log.slice(-1)[0] || ''}`) : null,
      st.previewApproved ? h('p', {class: 'muted', style: 'color:var(--amber)'}, 'The preview is already approved: new footage shows in the next preview.') : null,
      ...(st.slots.length ? st.slots.flatMap((x) => {
        const head = x.scene !== scene ? h('h3', {style: 'margin:14px 0 4px'}, (scene = x.scene)) : null;
        const row = h('div', {class: 'std', style: 'flex-wrap:wrap;gap:8px'},
          h('span', {class: 'badge ' + (x.file ? 'dark' : 'warn'), style: 'font-family:var(--mono)'}, x.slot),
          h('span', {style: 'min-width:220px'}, h('b', {}, x.query || '(no search words)'), x.label ? h('div', {class: 'muted', style: 'font-size:12px'}, `${x.tag ? x.tag + ' · ' : ''}${x.label} · ${x.seconds}s`) : h('div', {class: 'muted', style: 'font-size:12px'}, `${x.seconds}s`)),
          h('span', {class: 'grow muted', style: 'font-size:13px'}, x.file ? h('span', {}, h('a', {href: x.url, target: '_blank'}, x.file), x.credit?.source === 'pexels' ? h('span', {}, ' · Pexels, ', h('a', {href: x.credit.page, target: '_blank'}, x.credit.author || 'source')) : ' · yours') : `“${String(x.vo).slice(0, 90)}”`),
          x.query ? h('span', {class: 'muted', style: 'font-size:12px'}, 'Find: ', ...['Pexels', 'Pixabay', 'Storyblocks'].flatMap((site, i) => [i ? ' · ' : null, h('a', {href: search(site, x.query), target: '_blank'}, site)])) : null,
          upload(x.slot),
          x.file ? h('button', {class: 'danger', onclick: safe(async () => confirm(`Remove ${x.file}?`) && draw(await api('DELETE', `${base}/${x.slot}`)))}, 'Remove') : null,
        );
        return [head, row].filter(Boolean);
      }) : [h('p', {class: 'muted'}, 'This plan has no footage shots.')]),
    ].filter(Boolean));
  };
  api('GET', base).then(draw).catch((e) => toast(e.message, true));
  return box;
}

// ---------- the creator's own material for one video (server/media.mjs) ----------
function mediaPanel(slug, v) {
  const base = `/api/playlists/${slug}/videos/${v.folder}/media`;
  const box = h('div', {class: 'card', style: 'margin-top:14px'}, h('h2', {}, 'Your clips, audio and photos'), h('p', {class: 'muted'}, 'Loading…'));
  const input = h('input', {type: 'file', multiple: true, accept: 'video/*,audio/*,image/*', hidden: true});
  const draw = (st) => {
    const KIND = {video: 'Clip', audio: 'Audio', image: 'Photo'};
    box.replaceChildren(
      h('div', {class: 'row'}, h('h2', {class: 'grow'}, 'Your clips, audio and photos'), h('button', {class: 'primary', onclick: () => input.click()}, 'Add files'), input),
      h('p', {class: 'muted'}, 'Name each file by what it shows, with words from the line it belongs to (e.g. karachi-flood-street.mp4, minister-phone-call.m4a). Clips play muted under your voice in the brand\'s clip style; audio plays after its line (your voice pauses for it) in the audio style, with that style\'s sound; photos show in the photo style, and a photo named after a person in a quote becomes their portrait. Add them before the preview is made.'),
      ...(st.previewApproved ? [h('p', {class: 'muted', style: 'color:var(--amber)'}, 'The preview is already approved: new files show in the next preview, and audio clips change the timing.')] : []),
      ...(st.items.length
        ? st.items.map((it) => h('div', {class: 'std', style: 'flex-wrap:wrap'},
          h('span', {class: 'badge dark'}, KIND[it.kind]),
          h('a', {href: it.url, target: '_blank'}, it.name),
          it.dur ? h('span', {class: 'muted'}, clockOf(it.dur)) : null,
          h('span', {class: 'grow muted', style: 'font-size:13px'}, it.line ? `→ ${it.line.scene}: “${String(it.line.vo).replace(/"/g, '').slice(0, 80)}”` : it.kind === 'image' ? 'Not on a line (used as a portrait if it names a quoted person)' : 'No line matches its name: rename it with words from its line'),
          h('button', {class: 'danger', onclick: safe(async () => confirm(`Remove ${it.name}?`) && draw(await api('DELETE', `${base}/${encodeURIComponent(it.name)}`)))}, 'Remove')))
        : [h('p', {class: 'muted'}, 'No files yet. They are optional: without them the video uses graphics and sources only.')]));
  };
  input.onchange = safe(async () => {
    for (const f of input.files) {
      toast(`Uploading ${f.name}…`);
      const res = await fetch(`${base}?name=${encodeURIComponent(f.name)}`, {method: 'POST', headers: {'Content-Type': f.type || 'application/octet-stream'}, body: f});
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || res.statusText);
      draw(out);
    }
    input.value = '';
    toast('Added');
  });
  api('GET', base).then(draw).catch((e) => toast(e.message, true));
  return box;
}

function themeSection(b) {
  const box = h('div', {class: 'card', style: 'margin-top:14px'}, h('h2', {}, 'Theme'), h('p', {class: 'muted'}, 'Loading themes…'));
  b.theme = b.theme || {default: 'dark'};
  if (b.scheme === 'light' && b.theme.default === 'dark') b.theme.default = 'light';
  let timer = null;
  const draw = async () => {
    const t = await api('GET', '/api/themes');
    if (!document.body.contains(box) && timer) return clearInterval(timer);
    const running = t.samples?.status === 'running';
    if (running) timer = timer || setInterval(() => draw().catch(() => {}), 2500);
    else if (timer) (clearInterval(timer), (timer = null));
    const cards = t.themes.map((th) => {
      const on = b.theme.default === th.id;
      const newer = th.builtin && th.stored.length && th.builtinVersion && !th.stored.includes(th.builtinVersion);
      return h('div', {class: 'card click', style: `padding:12px;${on ? 'outline:2px solid var(--cyan)' : ''}`, onclick: () => ((b.theme.default = th.id), (b.scheme = ''), draw())},
        h('div', {class: 'row'}, h('b', {class: 'grow'}, th.name), on ? h('span', {class: 'badge'}, 'Default') : null),
        h('div', {class: 'muted', style: 'font-size:13px;margin:4px 0 8px'}, th.about),
        th.stills.length
          ? h('div', {class: 'grid', style: 'grid-template-columns:repeat(3,1fr);gap:4px'}, ...th.stills.slice(0, 6).map((src) => h('a', {href: `/ws/${src}`, target: '_blank', onclick: (e) => e.stopPropagation()}, h('img', {src: `/ws/${src}?${Date.now()}`, style: 'width:100%;border-radius:4px;display:block'}))))
          : h('div', {class: 'muted', style: 'font-size:12px'}, 'No sample stills yet.'),
        ...Object.entries(th.tuned || {}).map(([k, hex]) => h('div', {class: 'muted', style: 'font-size:12px;margin-top:6px'},
          h('span', {style: `display:inline-block;width:10px;height:10px;border-radius:2px;vertical-align:middle;background:${t.colors[k]}`}), ' → ',
          h('span', {style: `display:inline-block;width:10px;height:10px;border-radius:2px;vertical-align:middle;background:${hex}`}),
          ` Your ${k} colour is shown as ${hex} here so it reads on this canvas.`)),
        h('div', {class: 'muted', style: 'font-size:12px;margin-top:6px'}, th.stored.length ? `Stored in brand/themes/${th.id}/ (v${th.stored.join(', v')})` : 'Not stored yet: stored when first used.'),
        newer ? h('button', {style: 'margin-top:6px', onclick: safe(async (e) => {
          e.stopPropagation();
          const r = await api('POST', `/api/themes/${th.id}/update`);
          toast(`Stored ${th.name} v${r.version}. Videos made before keep their version.`);
          draw();
        })}, 'Store the newer version') : null);
    });
    box.replaceChildren(
      h('h2', {}, 'Theme'),
      h('p', {class: 'muted'}, 'The look of the canvas, texture, fonts, screen effect and cuts, over your brand colours. Pick the default; a video can switch before its preview is approved. The full theme is stored in brand/themes/ and each video keeps the version it was made with.'),
      h('div', {class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px'}, ...cards),
      h('div', {class: 'row', style: 'margin-top:12px'},
        running ? h('div', {class: 'working grow'}, h('span', {class: 'spin'}), h('b', {}, `Drawing sample stills in your colours… ${Math.round((t.samples.progress || 0) * 100)}%`))
          : h('span', {class: 'muted grow'}, t.samples?.status === 'error' ? `Sample stills failed: ${t.samples.error}` : 'Sample stills use your saved brand (save first) and a sample story.'),
        h('button', {disabled: running, onclick: safe(async () => (await api('POST', '/api/themes/samples', {}), draw()))}, 'Make sample stills')),
    );
  };
  draw().catch((e) => box.replaceChildren(h('p', {class: 'problems'}, e.message)));
  return box;
}

/** This video's theme: the brand default until picked; locked once the preview is approved. */
function themePicker(slug, v, current, locked, onSaved) {
  const sel = h('select', {disabled: locked}, h('option', {value: ''}, 'Loading…'));
  api('GET', '/api/themes').then((t) => {
    const cur = current?.id || t.default;
    sel.replaceChildren(...t.themes.map((th) => h('option', {value: th.id, selected: th.id === cur}, th.id === t.default ? `${th.name} (brand default)` : th.name)));
  });
  return h('div', {class: 'row', style: 'margin-top:8px;align-items:center;gap:8px'},
    h('span', {class: 'label', style: 'margin:0'}, 'Theme'), sel,
    current?.version ? h('span', {class: 'muted', style: 'font-size:12px'}, `${locked ? 'locked' : 'stored'} v${current.version}`) : null,
    locked ? null : h('button', {onclick: safe(async () => {
      await api('PUT', `/api/playlists/${slug}/videos/${v.folder}/theme`, {id: sel.value});
      toast('Theme saved for this video');
      onSaved && onSaved();
    })}, 'Save'));
}

// ---------- brand profile (brand/profile.json; brand-setup skill) ----------
async function brandPage() {
  const b = await api('GET', '/api/brand');
  const field = (label, rule, ...kids) => h('div', {class: 'field'}, h('div', {class: 'label'}, label, rule ? h('div', {class: 'rule'}, rule) : null), h('div', {}, ...kids));
  const get = (path) => path.split('.').reduce((o, k) => o?.[k], b);
  const set = (path, v) => {
    const ks = path.split('.');
    const last = ks.pop();
    ks.reduce((o, k) => (o[k] = o[k] || {}), b)[last] = v;
  };
  const text = (path, ph = '') => {
    const el = h('input', {value: get(path) ?? '', placeholder: ph});
    el.oninput = () => set(path, el.value);
    return el;
  };
  const list = (path, ph = '') => {
    const el = h('input', {value: (get(path) || []).join(', '), placeholder: ph});
    el.oninput = () => set(path, el.value.split(',').map((s) => s.trim()).filter(Boolean));
    return el;
  };
  const num = (path, step = 0.05) => {
    const el = h('input', {type: 'number', step, min: 0, max: 1, value: get(path)});
    el.oninput = () => set(path, Number(el.value));
    return el;
  };
  const choose = (path, opts) => {
    const el = h('select', {}, ...opts.map(([v, l]) => h('option', {value: v, selected: get(path) === v}, l)));
    el.onchange = () => set(path, el.value);
    return el;
  };
  const color = (key, label) => {
    const el = h('input', {type: 'color', value: b.colors[key]});
    const hex = h('code', {}, b.colors[key]);
    el.oninput = () => ((b.colors[key] = el.value.toUpperCase()), (hex.textContent = b.colors[key]));
    return h('label', {class: 'row', style: 'gap:8px;align-items:center'}, el, h('span', {}, label), hex);
  };
  b.thumbnail = b.thumbnail || {box: '', stamp: 'ask'};
  const boxPick = h('input', {type: 'color', value: b.thumbnail.box || b.colors.bg});
  const boxOn = h('input', {type: 'checkbox', checked: Boolean(b.thumbnail.box)});
  const sync = () => (b.thumbnail.box = boxOn.checked ? boxPick.value.toUpperCase() : '');
  boxPick.oninput = () => ((boxOn.checked = true), sync());
  boxOn.onchange = sync;
  const thumbBox = h('label', {class: 'row', style: 'gap:8px;align-items:center'}, boxOn, 'Own colour', boxPick);
  const finals = h('div', {class: 'row'}, ...['1080p', '2k', '4k'].map((r) => {
    const c = h('input', {type: 'checkbox', checked: b.output.finals.includes(r)});
    c.onchange = () => (b.output.finals = ['1080p', '2k', '4k'].filter((x) => (x === r ? c.checked : b.output.finals.includes(x))));
    return h('label', {class: 'row', style: 'gap:6px'}, c, r.toUpperCase());
  }));
  const captions = h('input', {type: 'checkbox', checked: b.captionsInVideo});
  captions.onchange = () => (b.captionsInVideo = captions.checked);
  const notes = h('textarea', {placeholder: 'e.g. Speak from a Muslim, Pakistani perspective. Seek regional and Islamic scholarship sources, not only Western outlets; show other views openly with their sources.', style: 'min-height:90px'});
  notes.value = b.narrative.notes || '';
  notes.oninput = () => (b.narrative.notes = notes.value);
  const disclosures = h('textarea', {placeholder: 'One per line, e.g. "Paid partnership: named in the video and the description."'});
  disclosures.value = (b.monetization.disclosures || []).join('\n');
  disclosures.oninput = () => (b.monetization.disclosures = disclosures.value.split('\n').map((s) => s.trim()).filter(Boolean));
  const beds = (STATE.beds || []).map((x) => [x.id, x.name || x.id]);
  const save = h('button', {class: 'primary big', onclick: safe(async () => {
    const {exists, ...body} = b;
    await api('PUT', '/api/brand', body);
    toast('Brand saved. New playlists, previews and thumbnails use it.');
    route();
  })}, 'Save brand');
  render(
    h('div', {class: 'label'}, 'Brand'),
    h('h1', {}, b.name || 'Your brand'),
    h('p', {class: 'muted'}, 'Set once for every playlist and video: Content Studio reads it for the look of previews and thumbnails, the defaults of new playlists and the research basis of plans. The rules in words stay in BRAND-GUIDE.md; keep the two in step.'),
    b.exists ? null : h('p', {class: 'problems'}, 'No brand/profile.json yet: the studio\'s built-in look is used. Save to create it.'),
    h('div', {class: 'card', style: 'margin-top:14px'},
      h('h2', {}, 'Identity'),
      field('Channel name', 'as written on screen', text('name', 'e.g. My Travel Diaries')),
      field('Handle', 'username only', text('handle', '@username')),
      field('Role', null, text('role', 'e.g. Advocacy Journalist')),
      field('Site', null, text('site', 'example.com')),
      field('Tags', 'comma separated', list('tags', 'Digital, Technology, AI')),
      field('Presenter name', 'on badges', text('presenter.name')),
      field('Presenter photo', 'file in the channel folder', text('presenter.photo', 'brand/presenter.png')),
      field('Photo side', null, choose('presenter.side', [['left', 'Left'], ['right', 'Right']])),
      field('Logo', 'file in the channel folder', text('logo.main', 'brand/logo.svg')),
      field('Logo on brand colour', 'title card', text('logo.onColor', 'brand/logo-oncolor.svg')),
      field('On camera', 'in videos', choose('face', [['ask', 'Ask me per video'], ['always', 'Always with my face'], ['never', 'Never (graphics only)']])),
    ),
    h('div', {class: 'card', style: 'margin-top:14px'},
      h('h2', {}, 'Look'),
      h('div', {class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px'},
        color('accent', 'Accent'), color('brand', 'Brand fill'), color('highlight', 'Highlight'), color('bg', 'Background'), color('text', 'Text')),
      field('Heading font', null, text('fonts.head')),
      field('Body font', null, text('fonts.body')),
      field('Mono font', 'labels', text('fonts.mono')),
      field('Thumbnail visual box', 'empty = the background colour', thumbBox),
      field('Thumbnail stamp', null, choose('thumbnail.stamp', [['ask', 'Ask me per video'], ['none', 'Never use a stamp']])),
      field('Default top-left label', 'when a plan has none', text('chrome.label', 'e.g. Breaking News')),
      field('Captions in the video', 'off = SRT files only (default)', h('label', {class: 'row', style: 'gap:8px'}, captions, 'Burn captions into previews and finals')),
    ),
    themeSection(b),
    cutoutSection(b),
    h('div', {class: 'card', style: 'margin-top:14px'},
      h('h2', {}, 'Sound, languages and output'),
      field('Default bed', 'for new playlists', beds.length ? choose('sound.defaultBed', beds) : text('sound.defaultBed', 'a')),
      field('Bed volume', 'under SFX and voice', num('sound.bedVolume', 0.01)),
      field('SFX + music under voice', null, num('sound.fxWithVoice')),
      field('Voice language', null, text('languages.voice', 'ur-Latn')),
      field('Subtitles', 'comma separated codes', list('languages.subtitles', 'ur-Latn, ur-Arab')),
      field('Dubs', 'comma separated codes', list('languages.dubs', 'en-US')),
      field('Preview', null, choose('output.preview', [['540p', '540p'], ['720p', '720p']])),
      field('Final sizes offered', null, finals),
    ),
    h('div', {class: 'card', style: 'margin-top:14px'},
      h('h2', {}, 'Narrative and money'),
      field('Research basis', 'default for new videos', choose('narrative.basis', [['ask', 'Ask me per video'], ['own', 'Our narrative'], ['mainstream', 'Mainstream (West-first)']])),
      field('Narrative principles', 'whose view we speak from, which sources to seek', notes),
      field('Monetization', 'comma separated', list('monetization.paths', 'AdSense, Sponsors, Memberships')),
      field('Disclosures', 'one per line', disclosures),
    ),
    h('div', {class: 'sticky-save'}, h('div', {class: 'inner'}, h('span', {class: 'muted'}, 'Writes brand/profile.json'), h('span', {class: 'grow'}), save)),
  );
}

async function settingsPage() {
  const s = await api('GET', '/api/settings');
  const pkey = h('input', {type: 'password', placeholder: s.hasPexels ? `Saved (${s.pexelsHint}). Paste a new key to replace it.` : 'Your Pexels API key', autocomplete: 'off'});
  const key = h('input', {type: 'password', placeholder: s.hasKey ? `Saved (${s.keyHint}). Paste a new key to replace it.` : 'sk-ant-…', autocomplete: 'off'});
  render(
    h('div', {class: 'label'}, 'Settings'),
    h('h1', {}, 'Claude'),
    h('div', {class: 'card', style: 'margin-top:14px'},
      h('h2', {}, 'Anthropic API key'),
      h('p', {class: 'muted'}, `With a key, plans (and later scripts and posts) are made in one click by ${s.model}, which searches the web and reads your concept PDF. You pay Anthropic per use (tokens and web searches) on your own account. Without a key, Content Studio writes a brief for Claude in the project instead.`),
      h('p', {}, s.hasKey ? `A key is set (${s.keyHint}, ${s.keySource === 'environment' ? 'from the ANTHROPIC_API_KEY variable' : 'saved on this PC'}).` : 'No key set.'),
      h('div', {class: 'row'}, h('div', {class: 'grow'}, key),
        h('button', {class: 'primary', onclick: safe(async () => {
          await api('PUT', '/api/settings', {anthropicApiKey: key.value});
          toast('Key saved on this PC');
          route();
        })}, 'Save key'),
        s.keySource === 'saved' ? h('button', {class: 'danger', onclick: safe(async () => (await api('PUT', '/api/settings', {anthropicApiKey: ''}), toast('Key removed'), route()))}, 'Remove') : null),
      h('p', {class: 'muted', style: 'font-size:13px'}, `Get a key at console.anthropic.com → API keys. It is stored only on this PC (${s.file}), never in the channel folder.`),
    ),
    h('div', {class: 'card', style: 'margin-top:14px'},
      h('h2', {}, 'Pexels API key (stock footage)'),
      h('p', {class: 'muted'}, 'Optional, for kits with B-roll such as Remote Documentary. With a key, the Footage panel of a video fills every empty shot from Pexels, whose clips and photos are free for commercial use. The key is free.'),
      h('p', {}, s.hasPexels ? `A key is set (${s.pexelsHint}, ${s.pexelsSource === 'environment' ? 'from the PEXELS_API_KEY variable' : 'saved on this PC'}).` : 'No key set.'),
      h('div', {class: 'row'}, h('div', {class: 'grow'}, pkey),
        h('button', {class: 'primary', onclick: safe(async () => {
          await api('PUT', '/api/settings', {pexelsApiKey: pkey.value.trim()});
          toast('Pexels key saved on this PC');
          route();
        })}, 'Save key'),
        s.pexelsSource === 'saved' ? h('button', {class: 'danger', onclick: safe(async () => (await api('PUT', '/api/settings', {pexelsApiKey: ''}), toast('Key removed'), route()))}, 'Remove') : null),
      h('p', {class: 'muted', style: 'font-size:13px'}, 'Get one at pexels.com/api (sign in, then "Your API key"). Stored only on this PC.'),
    ),
    speechCard(),
    updateCard(s.version),
  );
}

// ---------- the app's own updates (server/update.mjs) ----------
function updateCard(version) {
  const out = h('div', {});
  const check = safe(async () => {
    out.replaceChildren(h('p', {class: 'muted'}, 'Checking…'));
    const u = await api('GET', '/api/update');
    if (!u.newer) return out.replaceChildren(h('p', {}, `You have the latest version (${u.current}).`));
    out.replaceChildren(
      h('p', {}, `Version ${u.latest} is ready (you have ${u.current}).`),
      u.notes ? h('p', {class: 'muted'}, u.notes) : null,
      h('p', {class: 'muted', style: 'font-size:13px'}, 'A window shows each step. Your channel folder (playlists, videos, brand) is not touched, a backup of the app is kept, and Content Studio opens again when it is done. Save your work first: this page closes.'),
      h('button', {class: 'primary', onclick: safe(async () => {
        await api('POST', '/api/update');
        out.replaceChildren(h('p', {}, 'Updating in the other window. This page reloads when Content Studio is back.'));
        const wait = setInterval(async () => {
          try {
            const r = await fetch('/api/settings');
            if (r.ok && (await r.json()).version !== version) clearInterval(wait), location.reload();
          } catch { /* still updating */ }
        }, 4000);
      })}, `Install ${u.latest}`),
    );
  });
  return h('div', {class: 'card', style: 'margin-top:14px'},
    h('h2', {}, 'Content Studio updates'),
    h('p', {class: 'muted'}, `Installed: version ${version || '?'}.`),
    h('button', {onclick: check}, 'Check for updates'),
    out,
  );
}

// Speech to text (whisper.cpp, offline): installed once per PC, then every edited video's clips are listened to.
function speechCard() {
  const box = h('div', {class: 'card', style: 'margin-top:14px'}, h('h2', {}, 'Speech to text'), h('p', {class: 'muted'}, 'Loading…'));
  let timer = null;
  const draw = (st) => {
    if (!document.body.contains(box) && timer) return clearInterval(timer);
    const running = st.install?.status === 'running';
    if (running) timer = timer || setInterval(() => api('GET', '/api/speech').then(draw).catch(() => {}), 2000);
    else if (timer) (clearInterval(timer), (timer = null));
    const model = h('select', {style: 'width:auto', disabled: running}, ...Object.entries(st.models).map(([id, m]) => h('option', {value: id, selected: id === st.model}, `${m.name} · ${m.size}`)));
    const about = h('span', {class: 'muted', style: 'font-size:13px'}, st.models[st.model]?.about || '');
    model.onchange = () => (about.textContent = st.models[model.value].about);
    const stage = {helper: 'getting the helper', program: 'getting the program', model: 'downloading the model'};
    box.replaceChildren(...[
      h('h2', {}, 'Speech to text'),
      h('p', {class: 'muted'}, 'For Travel Video Editing: every clip and voice note is listened to on this PC (whisper.cpp, free and offline), so Claude knows what is said and when, and can pick the moments and cut around them. Installed once per PC in your home folder, never in the channel folder.'),
      h('p', {}, st.ready ? `Ready (${st.models[st.model].name} model).` : running ? `Installing: ${stage[st.install.stage] || st.install.stage} ${Math.round((st.install.progress || 0) * 100)}%` : 'Not installed.'),
      st.install?.status === 'error' ? h('p', {class: 'muted', style: 'color:var(--danger)'}, st.install.error) : null,
      h('div', {class: 'row', style: 'gap:8px;flex-wrap:wrap'}, model,
        h('button', {class: 'primary', disabled: running, onclick: safe(async () => draw(await api('POST', '/api/speech/install', {model: model.value})))}, st.ready ? 'Switch model' : 'Install'),
        about),
      h('p', {class: 'muted', style: 'font-size:13px'}, `Stored in ${st.where}.`),
    ].filter(Boolean));
  };
  api('GET', '/api/speech').then(draw).catch((e) => toast(e.message, true));
  return box;
}

safe(route)();
