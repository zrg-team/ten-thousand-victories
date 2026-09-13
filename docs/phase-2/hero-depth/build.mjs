import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { model, copy, sections, loops, tickets } from './design-data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const both = value => `<span class="l-en" lang="en">${value.en}</span><span class="l-vi" lang="vi">${value.vi}</span>`;
const bi = (en, vi) => both({ en, vi });
let translationPairs = 0;
function validateBilingual(value) {
  if (!value || typeof value !== 'object') return;
  if ('en' in value || 'vi' in value) {
    if (typeof value.en !== 'string' || !value.en || typeof value.vi !== 'string' || !value.vi) throw Error('Incomplete translation');
    translationPairs++;
  } else for (const child of Object.values(value)) validateBilingual(child);
}
validateBilingual({ copy, sections, loops, tickets, model });
const ids = [...sections.map(s => s.id), ...tickets.map(t => t.id)];
if (new Set(ids).size !== ids.length || tickets.length !== 12 || loops.length !== 6) throw Error('Invalid document structure');
if (model.xp.length !== 8 || model.xp.some((n, i) => i && n <= model.xp[i - 1])) throw Error('Invalid XP curve');
for (const row of model.outcomes) if (row.safe + row.wounded + row.captured + row.dead !== 100) throw Error('Invalid fate distribution');
for (const ticket of tickets) for (const file of ticket.files) if (!existsSync(resolve(root, file))) throw Error(`Missing code reference: ${file}`);

const paragraphs = list => (list || []).map(p => `<p>${both(p)}</p>`).join('');
const table = data => `<div class="table-wrap" tabindex="0" role="region" aria-label="${esc(data.headers[0].en)}" data-label-en="${esc(data.headers[0].en)}" data-label-vi="${esc(data.headers[0].vi)}"><table><thead><tr>${data.headers.map(h => `<th scope="col">${both(h)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(r => `<tr>${r.map((c, i) => `<${i ? 'td' : 'th scope="row"'}>${both(c)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;

const growthWidget = `<div class="prototype growth-widget">
  <div class="prototype-label">${both(copy.prototype)}</div>
  <div class="growth-grid">
    <div class="hero-card">
      <div class="hero-art" aria-hidden="true"><svg viewBox="0 0 480 125" fill="none"><path d="M0 109 90 30 168 92 254 12 366 97 442 27 480 61V125H0Z" fill="#b7c2b0"/><path d="M-5 123 117 70 201 124 347 50 485 125" stroke="#516657" stroke-width="2"/><path d="M208 124V70h65v54M201 70l40-26 40 26M222 124V95h36v29M199 78h83" stroke="#374a40" stroke-width="4"/><path d="M241 17v26m1-25h38l-8 10h-30" fill="#a54031" stroke="#a54031" stroke-width="2"/></svg></div>
      <div class="hero-ident"><div class="seal"><small>${both(copy.level)}</small><strong id="hero-level">4</strong></div><div><p class="eyebrow">${both(copy.rarity)}</p><h3>${both(copy.heroName)}</h3><p>${both(copy.heroPost)}</p></div></div>
      <div class="xp-line"><strong id="xp-local"></strong><span id="xp-next"></span></div><progress id="xp-track" max="18" value="8" aria-label="Hero experience" data-label-en="Hero experience" data-label-vi="Kinh nghiệm anh hùng"></progress>
      <p id="hero-stat"></p><p class="small" id="hero-next-stat"></p>
      <div class="deed">${bi('✦ Deed: held the northern gate at wave 4', '✦ Công trạng: giữ cổng bắc ở đợt 4')}</div>
    </div>
    <div class="explorer">
      <label for="xp-range">${both(copy.xpLabel)} <output id="xp-total" for="xp-range">38</output></label><input id="xp-range" type="range" min="0" max="126" value="38" step="1">
      <div class="stats"><div><strong id="training-total">6</strong><span>${both(copy.training)}</span></div><div><strong id="perk-slots">1</strong><span>${both(copy.perkSlots)}</span></div><div><strong id="earliest-wave">4</strong><span>${both(copy.earliest)}</span></div></div>
      <p class="small">${bi('Move the slider to test the proposed curve. The example shows Administration training only; other jobs train their declared professional stat. A level-8 cap still allows meaningful deeds and job choices.', 'Kéo để thử đường cong đề xuất. Ví dụ chỉ rèn Nội chính; nghề khác rèn chỉ số chuyên môn công bố. Trần cấp 8 vẫn giữ ý nghĩa cho công trạng và lựa chọn công việc.')}</p>
    </div>
  </div>
</div>`;

const riskWidget = `<div class="prototype risk-widget">
  <div class="prototype-label">${both(copy.prototype)}</div><h3>${both(copy.route)}</h3>
  <div class="risk-controls"><div><label for="route-edges">${both(copy.edges)} <output id="edges-output">4</output></label><input id="route-edges" type="range" min="1" max="8" value="4"></div><div><label for="capture-time">${both(copy.threat)} <output id="threat-output">3</output></label><input id="capture-time" type="range" min="1" max="6" value="3"></div></div>
  <div id="timing-result" class="timing" role="status"></div><p class="small">${both(copy.lostBonus)}</p>
  <label for="exposure-select">${both(copy.exposure)}</label><select id="exposure-select">${model.outcomes.map(row => `<option value="${row.id}" data-en="${esc(row.label.en)}" data-vi="${esc(row.label.vi)}" ${row.id === 'trapped' ? 'selected' : ''}>${esc(row.label.en)}</option>`).join('')}</select>
  <p id="exposure-condition" class="small"></p><p class="small">${both(copy.conditional)}</p><div id="fate-bar" aria-hidden="true"></div><div class="fate-values" id="fate-values" role="status"></div><p class="small">${both(copy.receipt)}</p>
  ${table({ headers: [ { en: 'Condition at resolved loss', vi: 'Điều kiện khi thất bại đã chốt' }, copy.safe, copy.wounded, copy.captured, copy.dead ], rows: model.outcomes.map(row => [row.label, ...['safe', 'wounded', 'captured', 'dead'].map(k => ({ en: `${row[k]}%`, vi: `${row[k]}%` }))]) })}
</div>`;

function renderLoops() {
  return `<button type="button" id="expand-loops" aria-expanded="false">${both(copy.expand)}</button><div class="loops">${loops.map((loop, i) => `<details id="loop-${i + 1}" class="loop"><summary><span class="loop-number">0${i + 1}</span>${both(loop.title)}</summary><div class="loop-body">${['idea', 'critique', 'tune', 'loop'].map(k => `<div class="loop-step step-${k}"><h3>${both(copy[k])}</h3><p>${both(loop[k])}</p></div>`).join('')}</div></details>`).join('')}</div>`;
}
function dependencies(value) {
  return bi(esc(value), esc(value.replace('Starts H01; final gate', 'Bắt đầu H01; tiêu chí cuối').replace('set B:', 'bộ B:').replace('if charter enabled', 'nếu bật chế độ mục tiêu')));
}
function renderTickets() {
  return `<h3>${both(copy.ticketsTitle)}</h3><p>${both(copy.ticketsLead)}</p><div class="tickets">${tickets.map(ticket => `<article class="ticket" id="${ticket.id}"><div class="ticket-top"><a href="#${ticket.id}" class="ticket-id">${ticket.id}</a><span>${bi('Proposed', 'Đề xuất')} · ${ticket.size}</span></div><h4>${both(ticket.title)}</h4><p class="dependency"><strong>${both(copy.depends)}:</strong> ${dependencies(ticket.dependencies)}</p><p>${both(ticket.task)}</p><p class="gate"><strong>${both(copy.done)}:</strong> ${both(ticket.gate)}</p><details><summary>${both(copy.files)}</summary><ul class="file-list">${ticket.files.map(path => `<li><a href="../../../${esc(path)}">${esc(path)}</a></li>`).join('')}</ul></details></article>`).join('')}</div>`;
}
function renderSection(section) {
  return `<section id="${section.id}"><header class="section-header"><h2>${both(section.title)}</h2><p class="lead">${both(section.lead)}</p></header>
    ${section.panels ? `<div class="panels">${section.panels.map(p => `<article><h3>${both(p.title)}</h3><p>${both(p.text)}</p></article>`).join('')}</div>` : ''}
    ${paragraphs(section.body)}${section.table ? table(section.table) : ''}${paragraphs(section.after)}
    ${section.code ? `<pre><code>${esc(section.code)}</code></pre>` : ''}
    ${section.id === 'loops' ? renderLoops() : ''}${section.id === 'growth' ? growthWidget : ''}${section.id === 'risk' ? riskWidget : ''}${section.id === 'delivery' ? renderTickets() : ''}</section>`;
}

const css = `
:root{color-scheme:light;--paper:#f4f0e5;--card:#fffdf6;--ink:#202f29;--muted:#59665d;--line:#d4d7c6;--green:#355a47;--red:#a13f30;--gold:#957229;--blue:#3c6078;font-family:Segoe UI,Arial,sans-serif;font-size:16px}
*{box-sizing:border-box}html{scroll-padding-top:90px}body{margin:0;background:var(--paper);color:var(--ink);line-height:1.7}html[lang=en] .l-vi,html[lang=vi] .l-en{display:none}a{color:#285a4c;text-underline-offset:3px}a:hover{color:var(--red)}button,input,select{font:inherit}button,select{min-height:44px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);padding:8px 14px;cursor:pointer}button:hover{border-color:var(--green)}:focus-visible{outline:3px solid #346990;outline-offset:3px}input[type=range]{width:100%;min-height:44px;accent-color:var(--green);cursor:pointer}label{display:block;font-weight:600}output{font-variant-numeric:tabular-nums;float:right;color:var(--red);font-weight:750}select{width:100%}h1,h2,h3,h4,p{margin-top:0}h1,h2,h3,h4{line-height:1.25;letter-spacing:-.02em}h2{font-size:clamp(1.5rem,2.5vw,2rem);margin-bottom:14px}h3{font-size:1.15rem;margin-bottom:10px}h4{font-size:1.2rem;margin:12px 0}p{margin-bottom:18px}strong{font-weight:650}code{font-family:Consolas,monospace;font-size:.86rem}pre{padding:24px;background:#253c33;color:#eef4e6;border-radius:12px;overflow:auto;line-height:1.6}summary{cursor:pointer;min-height:44px;padding:8px 0}small,.small{font-size:.85rem;color:var(--muted)}.topbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px max(20px,calc((100vw - 1440px)/2));background:#f4f0e5f5;border-bottom:1px solid var(--line);backdrop-filter:blur(10px)}.backlink{font-size:.85rem;font-weight:650}.languages{display:flex;gap:5px}.languages button{font-size:.85rem;white-space:nowrap}.languages [aria-pressed=true]{background:var(--ink);color:#fff;border-color:var(--ink)}
.masthead{background:var(--ink);color:var(--paper);position:relative;overflow:hidden}.masthead:after{content:'';position:absolute;width:440px;height:440px;border:1px solid #c0bd8333;border-radius:50%;right:-150px;top:-180px;box-shadow:0 0 0 40px #c0bd8310,0 0 0 80px #c0bd8308;pointer-events:none}.masthead-inner{max-width:1380px;margin:auto;padding:70px 40px 55px;position:relative;z-index:1}.kicker{font-size:.76rem;letter-spacing:.17em;font-weight:700;color:#d6c996;margin-bottom:22px}h1{font-family:Georgia,serif;font-size:clamp(2.9rem,6vw,5.5rem);font-weight:500;margin:0 0 14px;max-width:1000px}.subtitle{font-size:clamp(1.15rem,2vw,1.6rem);color:#d1dccb}.hero-summary{max-width:850px;font-size:1.1rem;color:#e3e6d9;margin:26px 0}.status{display:inline-block;border:1px solid #6b8070;border-radius:6px;padding:7px 12px;font-size:.78rem;color:#e2d9b4}.shell{display:grid;grid-template-columns:230px minmax(0,1fr);gap:40px;max-width:1380px;padding:38px 40px 60px;margin:auto}.sidebar{align-self:start;position:sticky;top:95px;max-height:calc(100vh - 120px);overflow:auto;font-size:.8rem}.sidebar>details>summary{font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;font-weight:750}.sidebar nav{display:grid;gap:3px}.sidebar a{padding:8px 10px;border-left:2px solid var(--line);text-decoration:none;line-height:1.45}.sidebar a:hover{border-color:var(--red);background:#e8e8db}.main{min-width:0}.verdict{padding:24px 28px;background:#e5eade;border-left:4px solid var(--green);border-radius:0 12px 12px 0;font-size:1.13rem;font-weight:600}.scope{font-size:.88rem;color:var(--muted)}section{padding:46px 0;border-top:1px solid var(--line);scroll-margin-top:12px}.section-header{margin-bottom:28px}.lead{color:var(--muted);font-size:1.06rem;max-width:900px}.panels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:20px 0 26px}.panels article{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px}.panels p:last-child{margin:0}.panels p{font-size:.94rem}.table-wrap{max-width:100%;overflow:auto;border:1px solid var(--line);border-radius:10px;margin:25px 0;background:var(--card)}table{border-collapse:collapse;width:100%;font-size:.9rem;text-align:left}th,td{padding:17px 18px;vertical-align:top;border-bottom:1px solid var(--line);overflow-wrap:anywhere}thead th{font-size:.8rem;color:#edf1e5;background:var(--green);font-weight:600}tbody th{font-size:.9rem;min-width:140px;max-width:180px;font-weight:650}tr:last-child>*{border-bottom:0}tbody tr:nth-child(even){background:#f1f1e6}.loops{display:grid;gap:12px;margin-top:18px}.loop{border:1px solid var(--line);border-radius:12px;background:var(--card)}.loop>summary{padding:18px 20px;font-size:1.08rem;font-weight:600;line-height:1.5}.loop-number{display:inline-block;color:var(--red);margin:0 12px 0 5px}.loop-body{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:6px 24px 24px}.loop-step{border-top:3px solid var(--line);padding-top:16px}.loop-step h3{font-size:.8rem;text-transform:uppercase;letter-spacing:.06em}.loop-step p{font-size:.93rem;margin:0}.step-critique{border-color:#b6845f}.step-tune{border-color:#56826c}.step-loop{border-color:#5d7a95}.prototype{margin:32px 0;padding:28px;border:1px solid #acb6a3;border-radius:16px;background:#e9ecdf}.prototype-label{font-size:.73rem;letter-spacing:.04em;text-transform:uppercase;color:#4c6456;margin-bottom:22px;font-weight:650}.growth-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:28px;align-items:center}.hero-card{border:1px solid #bac2ad;border-radius:12px;background:var(--card);overflow:hidden;padding:0 22px 20px;box-shadow:0 10px 24px #233d2810}.hero-art{margin:0 -22px 18px;background:#e4e6d7;height:108px;overflow:hidden}.hero-art svg{width:100%;height:100%}.hero-ident{display:flex;align-items:center;gap:15px}.hero-ident p{font-size:.82rem;margin:5px 0}.hero-ident h3{font-family:Georgia,serif;font-size:1.5rem;margin:4px 0}.seal{flex:0 0 76px;width:76px;min-height:87px;border:3px double #f2d9b4;background:var(--red);color:#fff4db;border-radius:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:5px}.seal small{font-size:.55rem;line-height:1.3;color:#fff4db;max-width:65px;text-transform:uppercase}.seal strong{font-size:2.5rem;line-height:1.2;font-family:Georgia,serif}.eyebrow{letter-spacing:.035em;font-size:.58rem!important;font-weight:700;color:#61705d}.xp-line{display:flex;justify-content:space-between;gap:8px;align-items:center;margin:20px 0 5px;font-size:.78rem}#xp-next{color:var(--muted);text-align:right}progress{width:100%;height:7px;border:none;appearance:none;display:block;margin:0 0 18px;background:#dadfcf;border-radius:8px;overflow:hidden}progress::-webkit-progress-bar{background:#dadfcf}progress::-webkit-progress-value{background:var(--blue)}progress::-moz-progress-bar{background:var(--blue)}#hero-stat{font-size:.9rem;font-weight:600;margin:8px 0}#hero-next-stat{line-height:1.5}.deed{padding-top:13px;border-top:1px solid var(--line);font-size:.76rem;color:#6b562c}.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.stats strong{display:block;font-size:2rem;line-height:1.2;color:var(--green)}.stats span{display:block;font-size:.72rem;margin-top:7px;line-height:1.45}.risk-controls{display:grid;grid-template-columns:1fr 1fr;gap:25px}.risk-controls label,.explorer label{font-size:.9rem}.timing{padding:16px 20px;border-left:4px solid var(--green);background:#f6f8ef;margin:15px 0}.timing.uncertain{border-color:var(--red);background:#f7ece0}.timing p{margin:5px 0 0;font-size:.9rem}#fate-bar{height:22px;display:flex;overflow:hidden;border-radius:5px}.segment{height:100%;min-width:0}.fate-safe{background:#426b50}.fate-wounded{background:#ae862c}.fate-captured{background:#527793}.fate-dead{background:#a34031}.fate-values{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}.fate-values strong{display:block;font-size:1.45rem}.fate-values span{font-size:.8rem}.dot{display:inline-block;width:9px;height:9px;margin-right:5px;border-radius:2px}.risk-widget table{font-size:.78rem}.risk-widget th,.risk-widget td{padding:12px}.risk-widget tbody th{min-width:120px}.tickets{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:22px}.ticket{border:1px solid var(--line);border-radius:12px;padding:22px;background:var(--card);scroll-margin-top:94px}.ticket-top{display:flex;justify-content:space-between;gap:10px;font-size:.76rem;color:var(--muted)}.ticket-id{font-weight:800;font-size:.85rem}.ticket p{font-size:.91rem}.ticket .dependency{font-size:.78rem;color:var(--muted)}.gate{background:#edf0e4;padding:14px;border-radius:7px}.ticket details{font-size:.8rem}.file-list{padding-left:18px;overflow-wrap:anywhere}footer{border-top:1px solid var(--line);padding:24px 0;font-size:.8rem;color:var(--muted)}
body{overflow-wrap:anywhere}.hero-ident>div:last-child{min-width:0}#exposure-condition{margin-top:10px;font-weight:650;color:var(--ink)}
@media(max-width:1100px){.shell{grid-template-columns:190px minmax(0,1fr);gap:25px;padding-left:25px;padding-right:25px}.growth-grid{grid-template-columns:1fr}.hero-card{max-width:520px;width:100%;margin:auto}.panels,.tickets{grid-template-columns:1fr}}
@media(max-width:800px){.shell{display:block;padding:20px}.sidebar{position:static;max-height:none;margin-bottom:24px;background:#e9ebde;border-radius:10px;padding:8px 15px}.sidebar nav{grid-template-columns:1fr 1fr}.masthead-inner{padding:45px 24px 35px}.loop-body{grid-template-columns:1fr}.main section{padding:34px 0}.topbar{padding:8px 16px}.risk-controls{grid-template-columns:1fr;gap:10px}table{min-width:590px}.risk-widget table{min-width:480px}.prototype{padding:20px}}
@media(max-width:450px){.topbar{gap:6px;padding:8px 10px}.backlink{font-size:.7rem;max-width:90px;line-height:1.3}.languages button{font-size:.76rem;padding:7px 10px}.shell{padding:18px 14px}.masthead-inner{padding:36px 20px}.kicker{font-size:.62rem}.hero-summary{font-size:1rem}.status{font-size:.69rem}.sidebar nav{grid-template-columns:1fr}.verdict{padding:20px;font-size:1rem}.panels article,.ticket{padding:19px}.prototype{padding:15px}.hero-card{padding:0 14px 16px}.hero-art{margin-left:-14px;margin-right:-14px}.hero-ident{gap:10px}.hero-ident h3{font-size:1.25rem}.seal{flex-basis:62px;width:62px;min-height:78px}.seal strong{font-size:2.1rem}.seal small{font-size:.5rem}.loop>summary{font-size:1rem;padding:16px}.loop-body{padding:0 18px 20px}.stats{gap:8px}.fate-values{grid-template-columns:1fr 1fr}.xp-line{font-size:.7rem}.prototype-label{font-size:.66rem}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
@media print{.topbar,.sidebar,button,input,select{display:none!important}.shell{display:block;max-width:none;padding:0}.masthead-inner{padding:25px}.masthead{background:white;color:black}.masthead p{color:black}.main{font-size:10pt}.panels,.tickets,.growth-grid{display:block}.ticket,.panels article{margin-bottom:12px;break-inside:avoid}section{padding:20px 0}.table-wrap{overflow:visible}table{min-width:0!important;font-size:9pt}pre{white-space:pre-wrap}.loop-body{display:grid!important}.prototype{break-inside:avoid}}
`;

const client = `
const model = ${JSON.stringify(model).replace(/</g, '\\u003c')};
const copy = ${JSON.stringify(copy).replace(/</g, '\\u003c')};
const $ = id => document.getElementById(id);
let lang = 'en';
const text = key => copy[key][lang];
function updateGrowth() {
  const xp = Number($('xp-range').value);
  const index = model.xp.findLastIndex(n => xp >= n);
  const level = index + 1, cap = level === model.xp.length;
  const local = xp - model.xp[index], needed = cap ? 1 : model.xp[index + 1] - model.xp[index];
  $('hero-level').textContent = level;
  $('xp-total').textContent = xp + ' ' + text('xp');
  $('xp-local').textContent = cap ? xp + ' ' + text('xp') : local + ' / ' + needed + ' ' + text('xp');
  $('xp-next').textContent = cap ? text('max') : (needed - local) + ' ' + text('xp') + ' ' + text('next');
  $('xp-track').max = needed; $('xp-track').value = cap ? 1 : local;
  $('training-total').textContent = (level - 1) * 2;
  $('perk-slots').textContent = (level >= 3 ? 1 : 0) + (level >= 6 ? 1 : 0);
  $('earliest-wave').textContent = Math.ceil(model.xp[index] / 8);
  $('hero-stat').textContent = text('statNote') + (60 + (level - 1) * 2) + '.';
  $('hero-next-stat').textContent = cap ? text('max') : text('contribution');
}
function updateRisk() {
  const edges = Number($('route-edges').value), threat = Number($('capture-time').value), eta = Math.max(1, Math.ceil(edges / 2));
  $('edges-output').textContent = edges; $('threat-output').textContent = threat;
  const early = eta < threat;
  $('timing-result').classList.toggle('uncertain', !early);
  $('timing-result').replaceChildren();
  const strong = document.createElement('strong'); strong.textContent = text('eta') + ': ' + eta + ' ' + text('seasons');
  const explanation = document.createElement('p'); explanation.textContent = text(early ? 'safeTiming' : 'lateTiming');
  $('timing-result').append(strong, explanation);
  const row = model.outcomes.find(r => r.id === $('exposure-select').value);
  $('exposure-condition').textContent = row.label[lang];
  $('fate-bar').replaceChildren(); $('fate-values').replaceChildren();
  for (const key of ['safe', 'wounded', 'captured', 'dead']) {
    const segment = document.createElement('div'); segment.className = 'segment fate-' + key; segment.style.width = row[key] + '%'; $('fate-bar').append(segment);
    const value = document.createElement('div'), count = document.createElement('strong'), label = document.createElement('span'), dot = document.createElement('i');
    count.textContent = row[key] + '%'; label.textContent = text(key); dot.className = 'dot fate-' + key;
    count.prepend(dot); value.append(count, label); $('fate-values').append(value);
  }
}
function updateLoopButton() {
  const allOpen = [...document.querySelectorAll('.loop')].every(d => d.open);
  $('expand-loops').textContent = text(allOpen ? 'collapse' : 'expand');
  $('expand-loops').setAttribute('aria-expanded', String(allOpen));
}
function setLanguage(next, persist = true) {
  const reading = [...document.querySelectorAll('section')].find(s => s.getBoundingClientRect().bottom > 100);
  const oldTop = reading?.getBoundingClientRect().top;
  lang = next === 'vi' ? 'vi' : 'en'; document.documentElement.lang = lang;
  document.title = copy.title[lang] + ' · ' + (lang === 'vi' ? 'Giai đoạn 2' : 'Phase 2');
  for (const btn of document.querySelectorAll('[data-language]')) btn.setAttribute('aria-pressed', String(btn.dataset.language === lang));
  for (const el of document.querySelectorAll('[data-label-en]')) el.setAttribute('aria-label', el.dataset[lang === 'vi' ? 'labelVi' : 'labelEn']);
  for (const option of document.querySelectorAll('#exposure-select option')) option.textContent = option.dataset[lang];
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (href.startsWith('http') || !/\\.html(?:[?#]|$)/.test(href)) continue;
    const [pathAndQuery, hash] = href.split('#'); const [path, query] = pathAndQuery.split('?');
    const params = new URLSearchParams(query || ''); params.set('lang', lang);
    a.setAttribute('href', path + '?' + params + (hash ? '#' + hash : ''));
  }
  updateGrowth(); updateRisk(); updateLoopButton();
  if (persist) {
    try { localStorage.setItem('phase2-hero-language', lang); } catch {}
    try { const url = new URL(location.href); url.searchParams.set('lang', lang); history.replaceState(null, '', url); } catch {}
    if (reading && scrollY > 500) window.scrollBy(0, reading.getBoundingClientRect().top - oldTop);
  }
}
for (const button of document.querySelectorAll('[data-language]')) button.addEventListener('click', () => setLanguage(button.dataset.language));
$('xp-range').addEventListener('input', updateGrowth);
for (const id of ['route-edges', 'capture-time']) $(id).addEventListener('input', updateRisk);
$('exposure-select').addEventListener('change', updateRisk);
$('expand-loops').addEventListener('click', () => { const open = ![...document.querySelectorAll('.loop')].every(d => d.open); for (const detail of document.querySelectorAll('.loop')) detail.open = open; updateLoopButton(); });
for (const detail of document.querySelectorAll('.loop')) detail.addEventListener('toggle', updateLoopButton);
let initial = new URLSearchParams(location.search).get('lang');
if (!['en','vi'].includes(initial)) { try { initial = localStorage.getItem('phase2-hero-language'); } catch {} }
setLanguage(initial, false);
if (innerWidth < 801) $('toc').open = false;
if (location.hash) requestAnimationFrame(() => { const target = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (target) { if (target.tagName === 'DETAILS') target.open = true; target.scrollIntoView(); } });
`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Phase 2 hero design: service levels, specialization, evacuation, injuries, diplomacy, cards and delivery gates. English and Vietnamese."><title>Heroes who matter · Phase 2</title><style>${css}</style></head><body>
<div class="topbar"><a class="backlink" href="../implementation-roadmap.html">← ${both(copy.back)}</a><div class="languages" role="group" aria-label="Document language"><button type="button" data-language="en" lang="en" aria-pressed="true">English</button><button type="button" data-language="vi" lang="vi" aria-pressed="false">Tiếng Việt</button></div></div>
<header class="masthead"><div class="masthead-inner"><p class="kicker">${both(copy.kicker)}</p><h1>${both(copy.title)}</h1><p class="subtitle">${both(copy.subtitle)}</p><p class="hero-summary">${both(copy.summary)}</p><p class="status">${both(copy.status)}</p></div></header>
<div class="shell"><aside class="sidebar"><details id="toc" open><summary>${both(copy.contents)}</summary><nav>${sections.map(s => `<a href="#${s.id}">${both(s.title)}</a>`).join('')}</nav></details></aside><main class="main"><p class="verdict">${both(copy.verdict)}</p><p class="scope">${both(copy.scope)}</p>${sections.map(renderSection).join('')}<footer>${both(copy.footer)}<br>${bi('Inspected revision', 'Bản mã đã đọc')}: <code>${model.inspectedRevision}</code> · ${model.date} · <a href="design-data.mjs">${bi('Bilingual authoring source', 'Nguồn soạn song ngữ')}</a></footer></main></div><script>${client}</script></body></html>`;

// Local links are part of the implementation handoff; validate them during every build.
let localLinks = 0;
for (const match of html.matchAll(/href="([^"]+)"/g)) {
  const href = match[1];
  if (/^(https?:|#)/.test(href)) continue;
  const path = href.split(/[?#]/)[0];
  if (!existsSync(resolve(here, path))) throw Error(`Broken local link: ${href}`);
  localLinks++;
}
writeFileSync(resolve(here, 'index.html'), html, 'utf8');
console.log(JSON.stringify({ output: 'docs/phase-2/hero-depth/index.html', translationPairs, sections: sections.length, loops: loops.length, tickets: tickets.length, localLinks, bytes: Buffer.byteLength(html) }));
