/**
 * Reorders the members of MenuScene so the facade reads as a table of contents: every field
 * together, then the lifecycle, then the forwarding methods grouped by the module they hand off to.
 *
 * Members are moved whole — leading doc comment included — and never rewritten. Field initialisers
 * in this class are all literals (`= []`, `= ''`, `= 0`, `= new Set()`), so with
 * `useDefineForClassFields` their relative order carries no meaning and regrouping is safe.
 *
 *   node tools/order-facade.cjs
 */
const ts = require('typescript');
const fs = require('fs');

const SRC = 'src/scenes/MenuScene.ts';
const text = fs.readFileSync(SRC, 'utf8');
const sf = ts.createSourceFile(SRC, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const cls = sf.statements.find((s) => ts.isClassDeclaration(s) && s.name && s.name.text === 'MenuScene');
/** The `import * as x` names: a call on anything else (`Math.round`) is the method's own work, not a hand-off. */
const namespaces = new Set();
for (const st of sf.statements) {
  if (ts.isImportDeclaration(st) && st.importClause && st.importClause.namedBindings && ts.isNamespaceImport(st.importClause.namedBindings)) namespaces.add(st.importClause.namedBindings.name.text);
}

/** The module namespace a forwarding method hands off to, or null if it does something itself. */
function forwardsTo(m) {
  if (!ts.isMethodDeclaration(m) || !m.body || m.body.statements.length !== 1) return null;
  const st = m.body.statements[0];
  const expr = ts.isExpressionStatement(st) ? st.expression : ts.isReturnStatement(st) ? st.expression : null;
  if (!expr || !ts.isCallExpression(expr) || !ts.isPropertyAccessExpression(expr.expression)) return null;
  const ns = expr.expression.expression;
  return ts.isIdentifier(ns) && namespaces.has(ns.text) ? ns.text : null;
}

const fields = [];
const getters = [];
let ctor = null;
const lifecycle = [];
const groups = new Map();

const LIFECYCLE = new Set(['init', 'create', 'update']);
for (const m of cls.members) {
  let src = text.slice(m.getFullStart(), m.getEnd()).replace(/^\n+/, '');
  // A one-line stub is the point; but where the signature itself wraps, the forwarding call ends up
  // trailing a return type three lines long. Give those a body of their own.
  if (ts.isMethodDeclaration(m) && m.body) {
    const head = text.slice(m.getStart(sf), m.body.getStart(sf));
    if (head.includes('\n') && m.body.statements.length === 1 && !text.slice(m.body.getStart(sf), m.getEnd()).includes('\n')) {
      const call = text.slice(m.body.getStart(sf) + 1, m.getEnd() - 1).trim();
      src = src.replace(text.slice(m.body.getStart(sf), m.getEnd()), `{\n    ${call}\n  }`);
    }
  }
  const entry = { src, name: m.name && ts.isIdentifier(m.name) ? m.name.text : '' };
  if (ts.isConstructorDeclaration(m)) { ctor = entry; continue; }
  if (ts.isPropertyDeclaration(m)) { fields.push(entry); continue; }
  if (ts.isGetAccessor(m) || ts.isSetAccessor(m)) { getters.push(entry); continue; }
  if (LIFECYCLE.has(entry.name)) { lifecycle.push(entry); continue; }
  const ns = forwardsTo(m) || '~scene';
  if (!groups.has(ns)) groups.set(ns, []);
  groups.get(ns).push(entry);
}

/** Reading order: the page frame first, then the pages, then the art behind them. */
const ORDER = ['~scene', 'shell', 'sheets', 'front', 'temple', 'legacyShop', 'dynasty', 'dynastyLineage', 'dynastyTablet', 'settings', 'support', 'install', 'backdrop', 'water', 'landscape', 'leaves'];
const rank = (ns) => {
  const i = ORDER.indexOf(ns);
  return i >= 0 ? i : 400;
};
const ordered = [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));

const BANNER = (title) => `  /* ${'-'.repeat(Math.max(3, 74 - title.length))} ${title} */`;
const LABEL = {
  '~scene': 'kept on the scene: the design-space scale every page lays out against',
  shell: 'the page frame: render, the title, page changes, leaving for a run',
  sheets: 'the modal layer every sheet is adopted into',
  front: 'the front page and the classic-modes page',
  temple: 'the Temple: dressing the king',
  legacyShop: 'the Legacy shop',
  dynasty: 'the dynasty page',
  dynastyLineage: 'the lineage row and its reign sheets',
  dynastyTablet: 'the dynasty tablet on the front page',
  settings: 'the settings page and the language line',
  support: 'the support row, the version line, the coffee sheet',
  install: 'the install mark, tip and sheet',
  backdrop: 'the illustration behind the page',
  water: 'the river, the wakes and the lotus swell',
  landscape: 'the drawn landscapes for the other themes',
  leaves: 'the drifting leaves and the wind',
};

const body = [
  fields.map((f) => f.src).join('\n\n'),
  getters.length ? getters.map((g) => g.src).join('\n\n') : null,
  ctor ? ctor.src : null,
  BANNER('Phaser lifecycle'),
  lifecycle.map((l) => l.src).join('\n\n'),
  ...ordered.map(([ns, ms]) => `${BANNER(LABEL[ns] || ns.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())}\n\n${ms.map((m) => m.src).join('\n\n')}`),
].filter(Boolean).join('\n\n');

const out = text.slice(0, cls.members[0].getFullStart()) + '\n' + body + '\n}\n';
fs.writeFileSync(SRC, out);
console.log(`fields ${fields.length}  getters ${getters.length}  lifecycle ${lifecycle.length}  groups ${ordered.length}`);
for (const [ns, ms] of ordered) console.log(`  ${String(ms.length).padStart(3)}  ${ns}`);
