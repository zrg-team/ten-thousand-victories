/**
 * Proves the split moved code rather than rewriting it.
 *
 * For every method in the pristine MenuScene, finds where it landed and compares the two
 * bodies as parsed syntax trees, after undoing the three rewrites the extractor is allowed to make:
 *
 *   this            -> self
 *   this.local(a)   -> local(self, a)      (calls that no longer hop through the facade)
 *   MenuScene.ICON_GUTTER -> ICON_GUTTER
 *
 * The comparison is structural, not textual: the scanner cannot be trusted on a bare body fragment
 * (it mis-scans nested template spans and folds whole statements into one token), and indentation
 * legitimately changed when every method lost two columns. String and template *contents* are
 * checked separately at the end, which is what would catch a dedent that reached inside a literal.
 *
 *   node scripts/menu-split/verify.cjs <path-to-pristine-copy>
 */
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const ORIG = process.argv[2];

/*
 * Bodies that have deliberately changed since the split.
 *
 * The proof this script exists to give is about the *move*: the same code, in different files. Work
 * done afterwards — routing nine copies of a teardown through one helper, dropping a re-inlined
 * expression for the shared function — is a real change and has to be named here rather than
 * quietly tolerated, or the check stops meaning anything.
 */
const DELIBERATE = JSON.parse(fs.readFileSync('scripts/menu-split/deliberate.json', 'utf8'));
const CHANGED = new Set(process.argv[4] ? process.argv[4].split(',').filter(Boolean) : DELIBERATE.changed);
/** Methods removed outright after the split because nothing called them. */
const DELETED = new Set(DELIBERATE.deleted || []);
const SRC = 'src/scenes/MenuScene.ts';
const OUT_DIR = 'src/scenes/menu';

const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);

/**
 * A node's shape as a flat list of strings, with the extractor's rewrites normalised away.
 * `siblings` is the set of module-local function names in the file the node came from.
 */
function signature(node, moduleFns) {
  const out = [];
  const visit = (n) => {
    // `self` is what `this` became. Inside a type query (`typeof this.state.x`) `this` parses as a
    // plain identifier, so both sides have to fold down to the same label.
    if (ts.isIdentifier(n) && (n.text === 'self' || n.text === 'this')) {
      out.push('This');
      return;
    }
    // `local(self, a)` and the leaf form `helper(a)` are what `this.local(a)` became
    // Only a name that used to BE a method gets undone. `visibleHostileHosts` and friends were
    // free functions in the original too, and rewriting those would invent a difference.
    if (moduleFns && ts.isCallExpression(n) && ts.isIdentifier(n.expression) && moduleFns.has(n.expression.text) && origMethods.has(n.expression.text)) {
      const fn = moduleFns.get(n.expression.text);
      const takesSelf = fn.takesSelf && n.arguments.length > 0 && ts.isIdentifier(n.arguments[0]) && n.arguments[0].text === 'self';
      if (takesSelf || !fn.takesSelf) {
        out.push('Call', 'PropertyAccess', 'This', `Id:${n.expression.text}`);
        for (let i = takesSelf ? 1 : 0; i < n.arguments.length; i++) visit(n.arguments[i]);
        return;
      }
    }
    // `ICON_GUTTER` is what `MenuScene.ICON_GUTTER` became
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'MenuScene') {
      out.push(`Id:${n.name.text}`);
      return;
    }
    if (ts.isIdentifier(n)) { out.push(`Id:${n.text}`); return; }
    if (ts.isPropertyAccessExpression(n)) { out.push('PropertyAccess'); visit(n.expression); out.push(`Id:${n.name.getText()}`); return; }
    if (ts.isCallExpression(n)) { out.push('Call'); ts.forEachChild(n, visit); return; }
    if (ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) { out.push(`Lit:${n.text}`); return; }
    if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) { out.push(`Tpl:${n.text}`); return; }
    if (n.kind === ts.SyntaxKind.ThisKeyword) { out.push('This'); return; }
    // `export` is added to what moved to constants.ts and says nothing about the declaration itself
    if (n.kind === ts.SyntaxKind.ExportKeyword) return;
    out.push(ts.SyntaxKind[n.kind]);
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

const problems = [];

/* ------------------------------------------------------- the pristine copy */
const origText = fs.readFileSync(ORIG, 'utf8');
const origSf = parse(ORIG, origText);
const origCls = origSf.statements.find((s) => ts.isClassDeclaration(s) && s.name && s.name.text === 'MenuScene');
const origMethods = new Map();
for (const m of origCls.members) if (ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.body) origMethods.set(m.name.text, m.body);

/* ------------------------------------------------- every emitted module fn */
const found = new Map();
const files = [];
const walkDir = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.posix.join(dir.replace(/\\/g, '/'), e.name);
    if (e.isDirectory()) walkDir(p);
    else if (e.name.endsWith('.ts')) files.push(p);
  }
};
walkDir(OUT_DIR);
const moduleFns = new Map();
const moduleDecls = new Map();
for (const p of files) {
  const src = fs.readFileSync(p, 'utf8');
  const sf = parse(p, src);
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) continue;
    if (ts.isFunctionDeclaration(st) && st.name && st.body) {
      if (found.has(st.name.text)) problems.push({ name: st.name.text, why: `emitted twice (${found.get(st.name.text).file} and ${p})` });
      const takesSelf = st.parameters.length > 0 && st.parameters[0].name.getText(sf) === 'self';
      found.set(st.name.text, { file: p, body: st.body, params: st.parameters, takesSelf });
      moduleFns.set(st.name.text, { takesSelf });
    }
    const names = ts.isVariableStatement(st) ? st.declarationList.declarations.map((d) => d.name.getText(sf)) : st.name ? [st.name.getText(sf)] : [];
    for (const n of names) moduleDecls.set(n, { file: p, node: st });
  }
}

/* ------------------------------------------------------------- the facade */
const newText = fs.readFileSync(SRC, 'utf8');
const newSf = parse(SRC, newText);
const newCls = newSf.statements.find((s) => ts.isClassDeclaration(s) && s.name && s.name.text === 'MenuScene');
const stubs = new Map();
for (const m of newCls.members) if (ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.body) stubs.set(m.name.text, m);

let checked = 0;
let changed = 0;
let deleted = 0;
for (const [name, origBody] of origMethods) {
  const hit = found.get(name);
  if (!hit) {
    const kept = stubs.get(name);
    if (!kept) {
      if (DELETED.has(name)) { deleted++; continue; }
      problems.push({ name, why: 'vanished: neither a module function nor on the class' });
      continue;
    }
    const a = signature(origBody, null).join('|');
    const b = signature(kept.body, null).join('|');
    if (a !== b) problems.push({ name, why: 'kept on the class but its body changed' });
    else checked++;
    continue;
  }
  const a = signature(origBody, null);
  const b = signature(hit.body, moduleFns);
  if (a.join('|') !== b.join('|')) {
    if (CHANGED.has(name)) { changed++; continue; }
    let k = 0;
    while (k < a.length && a[k] === b[k]) k++;
    problems.push({ name, file: hit.file, why: `body differs at node ${k} of ${a.length}`, orig: a.slice(Math.max(0, k - 4), k + 6).join(' '), now: b.slice(Math.max(0, k - 4), k + 6).join(' ') });
  } else checked++;
}

/* the facade must forward, not reimplement: one call, the scene first, params in order */
let facadeChecked = 0;
for (const [name, m] of stubs) {
  const target = found.get(name);
  if (!target) continue;
  const stmts = m.body.statements;
  const expr = stmts.length === 1 && (ts.isExpressionStatement(stmts[0]) ? stmts[0].expression : ts.isReturnStatement(stmts[0]) ? stmts[0].expression : null);
  if (!expr || !ts.isCallExpression(expr) || !ts.isPropertyAccessExpression(expr.expression) || expr.expression.name.text !== name) {
    problems.push({ name, why: 'facade method is not a single forwarding call' });
    continue;
  }
  const args = expr.arguments;
  const want = ['this', ...m.parameters.map((p) => p.name.getText(newSf))];
  const got = args.map((a) => a.getText(newSf).replace(/^\.\.\./, ''));
  if (want.join(',') !== got.join(',')) problems.push({ name, why: `facade forwards ${got.join(',')} but its own parameters are ${want.join(',')}` });
  else if (target.params.length !== m.parameters.length + 1) problems.push({ name, why: `arity mismatch: module fn takes ${target.params.length}, facade passes ${m.parameters.length + 1}` });
  else facadeChecked++;
}

/* ---------------------- top-level declarations, wherever in the tree they landed */
const DROPPED = new Set(process.argv[3] ? process.argv[3].split(',').filter(Boolean) : DELIBERATE.dropped);
let constChecked = 0;
let dropped = 0;
for (const st of origSf.statements) {
  if (ts.isImportDeclaration(st) || ts.isClassDeclaration(st)) continue;
  const names = ts.isVariableStatement(st) ? st.declarationList.declarations.map((d) => d.name.getText(origSf)) : st.name ? [st.name.getText(origSf)] : [];
  const want = signature(st, moduleFns).join('|');
  for (const n of names) {
    if (DROPPED.has(n)) {
      // Built from a plain string, not a template literal: `\b` inside one is a backspace, and this
      // check silently matched nothing at all until that was noticed.
      const stray = files.concat([SRC]).filter((f) => new RegExp('\\b' + n + '\\b').test(fs.readFileSync(f, 'utf8')));
      if (stray.length) problems.push({ name: n, why: `marked dropped but still referenced in ${stray.join(', ')}` });
      else dropped++;
      continue;
    }
    if (!moduleDecls.has(n)) problems.push({ name: n, why: 'top-level declaration is nowhere in the split tree' });
    else if (signature(moduleDecls.get(n).node, moduleFns).join('|') !== want) problems.push({ name: n, why: `top-level declaration changed (now in ${moduleDecls.get(n).file})` });
    else constChecked++;
  }
}

/* ------------- literal contents: a dedent reaching inside a string shows here */
function collect(sf, exclude) {
  const out = [];
  const walk = (n) => {
    // module specifiers are not content: whole imports legitimately went away with the code
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (exclude && exclude(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text);
    if (ts.isTemplateExpression(n)) {
      out.push(n.head.text);
      for (const s of n.templateSpans) out.push(s.literal.text);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return out;
}
function literals(file, text) { return collect(parse(file, text), null); }
function literalsOutside(file, text, exclude) { return collect(origSf, exclude); }
let literalMissing = 0;
let literalTotal = 0;
{
  const bag = new Map();
  for (const p of [...files, SRC]) for (const s of literals(p, fs.readFileSync(p, 'utf8'))) bag.set(s, (bag.get(s) || 0) + 1);
  /*
   * Only the bodies that did NOT deliberately change are held to this. A `cssHex` substitution
   * really does take a "#" and a "0" out of the file, and a deleted function takes its sentences
   * with it; counting those as losses would turn the check into noise. The 130-odd untouched
   * methods still have to account for every string they had.
   */
  const skip = [];
  for (const [name, body] of origMethods) if (CHANGED.has(name) || DELETED.has(name)) skip.push([body.getStart(origSf), body.getEnd()]);
  const inSkipped = (n) => skip.some(([a, b]) => n.getStart(origSf) >= a && n.getEnd() <= b);
  for (const s of literalsOutside(ORIG, origText, inSkipped)) {
    literalTotal++;
    const n = bag.get(s) || 0;
    if (n <= 0) {
      literalMissing++;
      if (literalMissing <= 6) problems.push({ name: '<literal>', why: 'literal text changed or lost', orig: JSON.stringify(s.slice(0, 100)) });
    } else bag.set(s, n - 1);
  }
}

/* ------ the invariant the design rests on: the module graph must be acyclic ------ */
const graph = new Map();
let sceneValueImports = 0;
for (const p of files) {
  const src = fs.readFileSync(p, 'utf8');
  const sf = parse(p, src);
  const out = new Set();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st)) continue;
    const spec = st.moduleSpecifier.text;
    if (!spec.startsWith('.')) continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(p), spec)) + '.ts';
    if (resolved === SRC || resolved.endsWith('/MenuScene.ts')) {
      if (!st.importClause || !st.importClause.isTypeOnly) {
        problems.push({ name: p, why: `imports MenuScene as a value — it must be \`import type\`` });
      } else sceneValueImports++;
      continue;
    }
    if (files.includes(resolved)) out.add(resolved);
  }
  graph.set(p, out);
}
const colour = new Map();
const stack = [];
const cycles = [];
const dfs = (node) => {
  colour.set(node, 1);
  stack.push(node);
  for (const next of graph.get(node) || []) {
    if (colour.get(next) === 1) cycles.push([...stack.slice(stack.indexOf(next)), next].join(' -> '));
    else if (!colour.has(next)) dfs(next);
  }
  stack.pop();
  colour.set(node, 2);
};
for (const p of files) if (!colour.has(p)) dfs(p);
for (const c of cycles) problems.push({ name: '<import cycle>', why: c });

/*
 * The leaf rule, enforced rather than described.
 *
 * Acyclicity alone is too weak: a chain of sibling imports can be acyclic today and grow a cycle on
 * the next change, and the whole point of routing cross-module calls through the scene is that no
 * such chain exists. Exactly two files may be imported by a sibling, and they may import none.
 */
const LEAVES = ['constants.ts', 'helpers.ts'].map((f) => path.posix.join(OUT_DIR, f));
for (const [from, tos] of graph) {
  for (const to of tos) {
    if (!LEAVES.includes(to)) problems.push({ name: path.relative(OUT_DIR, from), why: `imports a sibling that is not a leaf: ${path.relative(OUT_DIR, to)}` });
  }
  if (LEAVES.includes(from) && tos.size) {
    for (const to of tos) {
      if (to !== path.posix.join(OUT_DIR, 'constants.ts')) problems.push({ name: path.relative(OUT_DIR, from), why: `is a leaf but imports ${path.relative(OUT_DIR, to)}` });
    }
  }
}
const edges = [...graph.entries()].filter(([, v]) => v.size).map(([k, v]) => `${path.basename(k)} -> ${[...v].map((x) => path.basename(x)).join(', ')}`);
console.log(`module import graph:            ${edges.length} file(s) import a leaf, ${cycles.length} cycle(s), leaf rule ${problems.some((p) => String(p.why).includes('sibling')) ? 'BROKEN' : 'holds'}`);

console.log(`method bodies identical:        ${checked}/${origMethods.size}   deliberately changed: ${changed}, deleted: ${deleted}`);
for (const n of DELETED) if (found.has(n) || stubs.has(n)) problems.push({ name: n, why: 'listed as deleted but still present' });
for (const n of CHANGED) if (!origMethods.has(n)) problems.push({ name: n, why: 'listed as deliberately changed but is not a method of the original' });
console.log(`facade methods forward cleanly: ${facadeChecked}/${[...stubs.keys()].filter((k) => found.has(k)).length}`);
console.log(`top-level declarations moved:   ${constChecked}   deliberately dropped: ${dropped}`);
console.log(`string/template literals kept:  ${literalTotal - literalMissing}/${literalTotal}`);
console.log(`module functions: ${found.size}   facade methods: ${stubs.size}   module files: ${files.length}`);
if (problems.length) {
  console.log(`\nPROBLEMS (${problems.length}):`);
  for (const p of problems.slice(0, 30)) console.log(' ', JSON.stringify(p));
  process.exit(1);
}
console.log('\nOK — every method, declaration and literal survived the move.');
