/**
 * One-shot mechanical extractor: splits src/scenes/MenuScene.ts into src/scenes/menu/**.
 *
 * Works off the TypeScript AST rather than line slicing, because the class interleaves fields,
 * getters and methods (a field sits at 1379, another at 4052), and because `this` has to be
 * rewritten by exact node position — a textual pass would hit the word inside comments and inside
 * the 18 template literals that carry real newlines in their string spans.
 *
 * Three kinds of member come out the other side:
 *
 *   facade   a method something outside its own module calls. It becomes an exported function
 *            taking `self`, and the scene keeps a one-line forwarding method. Cross-module calls
 *            go through that method, which is why no module ever imports a sibling.
 *   local    a method only its own module calls. Not exported, no forwarding method; callers in
 *            the file just say `name(self, …)`.
 *   leaf     a helper the modules import directly, because routing it through the scene would be
 *            silly: either it never touches `this` at all (so it takes no `self`), or it is a
 *            utility half the tree calls. Leaf files must not import other modules; the verifier
 *            checks the whole graph is acyclic.
 *
 *   node scripts/menu-split/extract.cjs <partition.json>
 *
 * The partition is { methods: { name: "file.ts" | { file, leaf } }, constants: { name: "file.ts" },
 * drop: [name] }. Anything not named in `constants` lands in conquest/constants.ts.
 */
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const SRC = 'src/scenes/MenuScene.ts';
const OUT_DIR = 'src/scenes/menu';
const CONSTANTS = path.posix.join(OUT_DIR, 'constants.ts');
/** The second leaf: pure helpers the modules import directly. Both leaves export, neither imports a sibling. */
const HELPERS = path.posix.join(OUT_DIR, 'helpers.ts');
const LEAVES = [CONSTANTS, HELPERS];
const DRY = process.argv.includes('--dry');

const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const RAW = spec.methods || spec;
const CONST_HOME = spec.constants || {};
const DROP = new Set(spec.drop || []);
/** Names that live in constants.ts but nothing else reads — they stay unexported. */
const NO_EXPORT = new Set(spec.noExport || []);
const PARTITION = {};
for (const [name, v] of Object.entries(RAW)) PARTITION[name] = typeof v === 'string' ? { file: v, leaf: false } : v;

const text = fs.readFileSync(SRC, 'utf8');
const sf = ts.createSourceFile(SRC, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const lineOf = (p) => sf.getLineAndCharacterOfPosition(p).line;
const lineStarts = sf.getLineStarts();

/* ------------------------------------------------------------------ parse */
let cls = null;
const importDecls = [];
const topDecls = [];
for (const st of sf.statements) {
  if (ts.isImportDeclaration(st)) importDecls.push(st);
  else if (ts.isClassDeclaration(st) && st.name && st.name.text === 'MenuScene') cls = st;
  else topDecls.push(st);
}
if (!cls) throw new Error('MenuScene class not found');

const methods = [];
const keepMembers = [];
for (const m of cls.members) {
  if (ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && PARTITION[m.name.text]) methods.push(m);
  else keepMembers.push(m);
}
const allMethodNames = new Set(cls.members.filter((m) => ts.isMethodDeclaration(m) && ts.isIdentifier(m.name)).map((m) => m.name.text));
const movedNames = new Set(methods.map((m) => m.name.text));
const memberNames = new Set(cls.members.filter((m) => m.name && ts.isIdentifier(m.name)).map((m) => m.name.text));
const fileOf = (name) => path.posix.join(OUT_DIR, PARTITION[name].file);

/* ------------------------------------------------- lines that must not dedent */
const unsafeLines = new Set();
{
  const mark = (node) => {
    const s = node.getStart(sf);
    const e = node.getEnd();
    for (let L = lineOf(s) + 1; L <= lineOf(e); L++) if (lineStarts[L] > s && lineStarts[L] <= e) unsafeLines.add(L);
  };
  const walk = (n) => {
    if (ts.isNoSubstitutionTemplateLiteral(n) && n.text.includes('\n')) mark(n);
    if (ts.isTemplateExpression(n)) {
      if (n.head.text.includes('\n')) mark(n.head);
      for (const s of n.templateSpans) if (s.literal.text.includes('\n')) mark(s.literal);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
}

/* -------------------------------------------------------- identifier usage */
function localIdents(node) {
  const out = new Set();
  const walk = (n) => {
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const isMemberName =
        (ts.isPropertyAccessExpression(p) && p.name === n) ||
        (ts.isPropertyAssignment(p) && p.name === n) ||
        (ts.isPropertySignature(p) && p.name === n) ||
        (ts.isMethodSignature(p) && p.name === n) ||
        (ts.isMethodDeclaration(p) && p.name === n) ||
        (ts.isPropertyDeclaration(p) && p.name === n) ||
        (ts.isQualifiedName(p) && p.right === n) ||
        (ts.isBindingElement(p) && p.propertyName === n) ||
        (ts.isEnumMember(p) && p.name === n) ||
        (ts.isParameter(p) && p.name === n);
      if (!isMemberName) out.add(n.text);
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return out;
}

/** Every `this.x`, `this.f(...)` and `MenuScene.X` a member reaches for. */
function scan(node) {
  const thisNodes = [];
  const calls = new Map();
  const valueRefs = new Set();
  const staticRefs = [];
  const memberTouch = new Set();
  const walk = (n) => {
    // `this` is a ThisKeyword in an expression, but inside a type query (`typeof this.state.x`)
    // it comes through as a plain Identifier named "this" hanging off a QualifiedName.
    if (n.kind === ts.SyntaxKind.ThisKeyword || (ts.isIdentifier(n) && n.text === 'this')) thisNodes.push(n);
    if (ts.isPropertyAccessExpression(n) && n.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(n.name)) {
      const target = n.name.text;
      if (memberNames.has(target)) memberTouch.add(target);
      if (allMethodNames.has(target)) {
        if (ts.isCallExpression(n.parent) && n.parent.expression === n) {
          if (!calls.has(target)) calls.set(target, []);
          calls.get(target).push(n.parent);
        } else valueRefs.add(target);
      }
    }
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'MenuScene') staticRefs.push(n);
    ts.forEachChild(n, walk);
  };
  walk(node);
  return { thisNodes, calls, valueRefs, staticRefs, memberTouch };
}

const info = new Map();
for (const m of methods) {
  const name = m.name.text;
  const s = scan(m);
  const idents = localIdents(m);
  for (const r of s.staticRefs) idents.add(r.name.text);
  // A method that never says `this` is a pure helper wearing a method's clothes.
  const pure = s.thisNodes.length === 0;
  info.set(name, { node: m, file: fileOf(name), leaf: PARTITION[name].leaf || pure, pure, idents, ...s });
}

/* --------------------------------------------- what has to stay on the facade */
const sceneScan = keepMembers.map((m) => ({ m, ...scan(m) }));
const needsStub = new Set();
for (const k of sceneScan) for (const target of [...k.calls.keys(), ...k.valueRefs]) if (movedNames.has(target)) needsStub.add(target);
for (const n of ['init', 'create', 'update', 'preload']) if (movedNames.has(n)) needsStub.add(n);
/*
 * A Playwright harness reaching into a live scene is a caller too.
 *
 * This was learnt the expensive way: the first cut exported on "another module calls it" alone, and
 * ten methods the harnesses drive by name — `renderActionBar`, `tourStages`, `battleScaleAt` among
 * them — simply stopped existing on the class. Three of those call sites guard with
 * `typeof … === 'function'`, so they did not even fail: they skipped, and the harness passed while
 * testing nothing.
 */
const harnessNamed = new Set();
{
  const scripts = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.posix.join(dir.split(path.sep).join('/'), e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.mjs')) scripts.push(p);
    }
  };
  walk('test_scripts');
  for (const p of scripts) {
    const t = fs.readFileSync(p, 'utf8');
    for (const n of movedNames) if (new RegExp('[.\\[\'"]' + n + '\\b').test(t)) harnessNamed.add(n);
  }
  for (const n of harnessNamed) needsStub.add(n);
}
for (const [, i] of info) {
  for (const target of i.valueRefs) if (movedNames.has(target)) needsStub.add(target);
  for (const target of i.calls.keys()) if (movedNames.has(target) && fileOf(target) !== i.file) needsStub.add(target);
}
// A leaf is imported, never forwarded — unless a harness names it, in which case it is both: the
// modules go on calling it directly and the class carries a forwarder for the harness.
for (const [name, i] of info) if (i.leaf && !harnessNamed.has(name)) needsStub.delete(name);

/** Leaf functions another file calls have to be exported. */
const leafExported = new Set();
for (const [, i] of info) for (const target of i.calls.keys()) {
  if (movedNames.has(target) && info.get(target).leaf && fileOf(target) !== i.file) leafExported.add(target);
}
for (const k of sceneScan) for (const target of [...k.calls.keys(), ...k.valueRefs]) {
  if (movedNames.has(target) && info.get(target).leaf) leafExported.add(target);
}
for (const [, i] of info) for (const target of i.valueRefs) {
  if (movedNames.has(target) && info.get(target).leaf) throw new Error(`leaf ${target} is used as a value — it cannot be a leaf`);
}

/* the fields and getters the modules reach through `self` cannot stay private */
const exposed = new Set();
for (const [, i] of info) for (const n of i.memberTouch) if (!movedNames.has(n)) exposed.add(n);

if (DRY) {
  const byFile = {};
  for (const [name, i] of info) {
    byFile[i.file] = byFile[i.file] || { stub: [], local: [], leaf: [] };
    byFile[i.file][needsStub.has(name) ? 'stub' : i.leaf ? 'leaf' : 'local'].push(name + (i.pure ? '*' : ''));
  }
  let s = 0, l = 0, f = 0;
  for (const [file, g] of Object.entries(byFile).sort()) {
    s += g.stub.length; l += g.local.length; f += g.leaf.length;
    console.log(`${file}\n  stub(${g.stub.length}): ${g.stub.join(' ')}\n  local(${g.local.length}): ${g.local.join(' ')}\n  leaf(${g.leaf.length}): ${g.leaf.join(' ')}`);
  }
  console.log(`\nTOTAL stubs ${s}  local ${l}  leaf ${f}   (* = takes no self)`);
  console.log(`kept on the class: ${[...allMethodNames].filter((n) => !movedNames.has(n)).join(', ')}`);
  process.exit(0);
}

/* --------------------------------------------------------------- emitting */
const relTo = (fromFile, toFile) => {
  const r = path.relative(path.dirname(fromFile), toFile).replace(/\\/g, '/').replace(/\.ts$/, '');
  return r.startsWith('.') ? r : './' + r;
};

/** Apply position-keyed edits over a member's full span, then dedent by two. */
function renderMember(m, edits) {
  const from = m.getFullStart();
  const to = m.getEnd();
  const sorted = edits.slice().sort((a, b) => a.start - b.start || b.end - a.end);
  const chunks = [];
  let cursor = from;
  for (const e of sorted) {
    if (e.start < from || e.end > to) continue;
    if (e.start < cursor) continue; // an outer edit already swallowed this one
    chunks.push(text.slice(cursor, e.start), e.text);
    cursor = e.end;
  }
  chunks.push(text.slice(cursor, to));
  const startLine = lineOf(from);
  return chunks.join('').split('\n').map((ln, idx) => (unsafeLines.has(startLine + idx) ? ln : ln.replace(/^ {1,2}/, ''))).join('\n');
}

const modules = new Map();
const mod = (file) => {
  if (!modules.has(file)) modules.set(file, { body: [], decls: [], idents: new Set(), imports: new Map() });
  return modules.get(file);
};
const needImport = (fromFile, targetFile, name) => {
  if (fromFile === targetFile) return;
  const m = mod(fromFile);
  if (!m.imports.has(targetFile)) m.imports.set(targetFile, new Set());
  m.imports.get(targetFile).add(name);
};

for (const [name, i] of info) {
  const m = i.node;
  const edits = [];
  if (!i.pure) for (const t of i.thisNodes) edits.push({ start: t.getStart(sf), end: t.getEnd(), text: 'self' });
  for (const s of i.staticRefs) edits.push({ start: s.getStart(sf), end: s.getEnd(), text: s.name.text });

  // calls that no longer hop through the scene
  for (const [target, exprs] of i.calls) {
    if (!movedNames.has(target)) continue;
    const t = info.get(target);
    // A leaf is always called directly, and so is a call within one file. `self.` is the sign that
    // a call leaves the module; using it for a neighbour two functions down says the opposite of
    // what is happening. The forwarder still exists for the callers that really are outside.
    const direct = t.leaf || fileOf(target) === i.file;
    if (!direct) continue;
    if (t.leaf) needImport(i.file, fileOf(target), target);
    for (const call of exprs) {
      const head = t.pure ? `${target}(` : `${target}(self${call.arguments.length ? ', ' : ''}`;
      edits.push({ start: call.expression.getStart(sf), end: call.arguments.pos, text: head });
    }
  }

  const isAsync = (m.modifiers || []).some((x) => x.kind === ts.SyntaxKind.AsyncKeyword);
  const exported = needsStub.has(name) || (i.leaf && leafExported.has(name));
  edits.push({ start: m.getStart(sf), end: m.name.getEnd(), text: `${exported ? 'export ' : ''}${isAsync ? 'async ' : ''}function ${name}` });
  if (!i.pure) {
    edits.push({
      start: m.parameters.pos,
      end: m.parameters.pos,
      text: `self: MenuScene${m.parameters.length ? ',' + (text[m.parameters.pos] === '\n' ? '' : ' ') : ''}`,
    });
  }

  const target = mod(i.file);
  target.body.push({ pos: m.getFullStart(), text: renderMember(m, edits) });
  for (const id of i.idents) target.idents.add(id);
  if (!i.pure) target.usesScene = true;
}

/* ------------------------------------------------------- constants payload */
const constantNames = new Set();
const constantKind = new Map();
const constantFile = new Map();
for (const st of topDecls) {
  const names = ts.isVariableStatement(st)
    ? st.declarationList.declarations.map((d) => d.name.getText(sf))
    : st.name ? [st.name.getText(sf)] : [];
  if (names.some((n) => DROP.has(n))) continue;
  const kind = ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) ? 'type' : 'value';
  const home = path.posix.join(OUT_DIR, CONST_HOME[names[0]] || 'constants.ts');
  for (const n of names) { constantNames.add(n); constantKind.set(n, kind); constantFile.set(n, home); }
  const shared = LEAVES.includes(home) && !names.some((n) => NO_EXPORT.has(n));
  const already = /^export\b/.test(text.slice(st.getStart(sf), st.getStart(sf) + 7));
  const trivia = text.slice(st.getFullStart(), st.getStart(sf));
  const decl = text.slice(st.getStart(sf), st.getEnd());
  mod(home).decls.push(trivia + (already || !shared ? '' : 'export ') + decl);
  for (const id of localIdents(st)) mod(home).idents.add(id);
}
const movedStatics = [];
for (const m of keepMembers) {
  if (!ts.isPropertyDeclaration(m) || !(m.modifiers || []).some((x) => x.kind === ts.SyntaxKind.StaticKeyword)) continue;
  const n = m.name.getText(sf);
  const home = path.posix.join(OUT_DIR, CONST_HOME[n] || 'constants.ts');
  constantNames.add(n); constantKind.set(n, 'value'); constantFile.set(n, home);
  const raw = text.slice(m.getFullStart(), m.getEnd()).replace(/\n {2}/g, '\n');
  mod(home).decls.push(raw.replace(/private static readonly /, LEAVES.includes(home) ? 'export const ' : 'const '));
  for (const id of localIdents(m)) mod(home).idents.add(id);
  movedStatics.push(m);
}

/* ---------------------------------------------------------------- imports */
function renderImports(forFile, used, opts = {}) {
  const out = [];
  for (const d of importDecls) {
    const specText = d.moduleSpecifier.getText(sf).slice(1, -1);
    const target = specText.startsWith('.')
      ? relTo(forFile, path.posix.normalize(path.posix.join(path.posix.dirname(SRC), specText)))
      : specText;
    const c = d.importClause;
    if (!c) continue;
    const def = c.name && used.has(c.name.text) ? c.name.text : null;
    let ns = null;
    const named = [];
    if (c.namedBindings) {
      if (ts.isNamespaceImport(c.namedBindings)) { if (used.has(c.namedBindings.name.text)) ns = c.namedBindings.name.text; }
      else for (const e of c.namedBindings.elements) {
        if (used.has(e.name.text)) named.push(`${e.isTypeOnly ? 'type ' : ''}${e.propertyName ? `${e.propertyName.text} as ` : ''}${e.name.text}`);
      }
    }
    if (!def && !ns && !named.length) continue;
    const parts = [];
    if (def) parts.push(def);
    if (ns) parts.push(`* as ${ns}`);
    if (named.length) parts.push(`{ ${named.join(', ')} }`);
    out.push(`import ${c.isTypeOnly ? 'type ' : ''}${parts.join(', ')} from '${target}';`);
  }
  // shared constants, split so an interface never becomes a runtime import
  const byHome = new Map();
  for (const n of constantNames) {
    if (!used.has(n)) continue;
    const home = constantFile.get(n);
    if (home === forFile) continue;
    if (!LEAVES.includes(home) && !opts.allowAnyConstantHome) continue;
    if (!byHome.has(home)) byHome.set(home, []);
    byHome.get(home).push(n);
  }
  for (const [home, names] of byHome) {
    const values = names.filter((n) => constantKind.get(n) !== 'type').sort();
    const types = names.filter((n) => constantKind.get(n) === 'type').sort();
    if (values.length) out.push(`import { ${values.join(', ')} } from '${relTo(forFile, home)}';`);
    if (types.length) out.push(`import type { ${types.join(', ')} } from '${relTo(forFile, home)}';`);
  }
  for (const [target, names] of opts.extra || []) out.push(`import { ${[...names].sort().join(', ')} } from '${relTo(forFile, target)}';`);
  if (opts.scene) out.push(`import type { MenuScene } from '${relTo(forFile, SRC)}';`);
  return out.join('\n');
}

/* -------------------------------------------------------------- write out */
fs.mkdirSync(OUT_DIR, { recursive: true });
const written = [];
for (const [file, m] of modules) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const title = path.basename(file, '.ts');
  const header = [
    '/**',
    ` * ${title} — part of the front page, split out of MenuScene.`,
    ' *',
    ' * Every function here takes the scene as `self`. The scene still owns the state and the display',
    ' * list; this file owns only the drawing and the wiring of one area of the screen.',
    ' */',
    '',
  ].join('\n');
  m.body.sort((a, b) => a.pos - b.pos);
  const imports = renderImports(file, m.idents, { scene: m.usesScene, extra: m.imports });
  const decls = m.decls.join('');
  fs.writeFileSync(file, header + imports + '\n' + decls + (decls && m.body.length ? '\n' : '') + m.body.map((b) => b.text).join('') + '\n');
  written.push(file);
}

/* ------------------------------------------------------ rewrite the scene */
{
  const nsFor = new Map();
  for (const file of modules.keys()) {
    const parts = file.replace(OUT_DIR + '/', '').replace(/\.ts$/, '').split('/');
    nsFor.set(file, parts.map((s, i) => (i === 0 ? s : s[0].toUpperCase() + s.slice(1))).join('').replace(/[^A-Za-z0-9]/g, ''));
  }
  const edits = [];
  const usedByScene = new Set();
  for (const k of sceneScan) for (const id of localIdents(k.m)) usedByScene.add(id);
  // A forwarding method keeps its parameter list, defaults included: `top = LANGUAGE_TOP` on the
  // facade reads the constant from the class file, so the class has to import it too.
  for (const [name, i] of info) if (needsStub.has(name)) for (const p of i.node.parameters) for (const id of localIdents(p)) usedByScene.add(id);

  // the scene may call a leaf directly; if so it imports it like any module would
  const sceneExtra = new Map();
  for (const k of sceneScan) {
    for (const [target, exprs] of k.calls) {
      if (!movedNames.has(target) || !info.get(target).leaf) continue;
      const home = fileOf(target);
      if (!sceneExtra.has(home)) sceneExtra.set(home, new Set());
      sceneExtra.get(home).add(target);
      for (const call of exprs) {
        const t = info.get(target);
        edits.push({ start: call.expression.getStart(sf), end: call.arguments.pos, text: t.pure ? `${target}(` : `${target}(this${call.arguments.length ? ', ' : ''}` });
      }
    }
  }

  const lines = [...nsFor.entries()]
    .filter(([file]) => [...info.values()].some((i) => i.file === file && needsStub.has(i.node.name.text)))
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([file, ns]) => `import * as ${ns} from '${relTo(SRC, file)}';`);
  const wantConstants = [...constantNames].filter((n) => usedByScene.has(n));
  for (const [home, names] of sceneExtra) lines.unshift(`import { ${[...names].sort().join(', ')} } from '${relTo(SRC, home)}';`);
  // the scene may keep code that reads a declaration from either leaf; one import line per leaf and kind
  for (const home of LEAVES) {
    const here = wantConstants.filter((n) => constantFile.get(n) === home);
    const wantValues = here.filter((n) => constantKind.get(n) !== 'type').sort();
    const wantTypes = here.filter((n) => constantKind.get(n) === 'type').sort();
    if (wantTypes.length) lines.unshift(`import type { ${wantTypes.join(', ')} } from '${relTo(SRC, home)}';`);
    if (wantValues.length) lines.unshift(`import { ${wantValues.join(', ')} } from '${relTo(SRC, home)}';`);
  }
  const strandedScene = wantConstants.filter((n) => !LEAVES.includes(constantFile.get(n)));
  if (strandedScene.length) throw new Error(`the scene still reads ${strandedScene.join(', ')} but they were placed outside the leaves`);
  const lastImport = importDecls[importDecls.length - 1];
  edits.push({ start: lastImport.getEnd(), end: lastImport.getEnd(), text: '\n' + lines.join('\n') });

  for (const st of topDecls) edits.push({ start: st.getFullStart(), end: st.getEnd(), text: '' });
  for (const m of movedStatics) edits.push({ start: m.getFullStart(), end: m.getEnd(), text: '' });
  for (const m of keepMembers) {
    if (movedStatics.includes(m)) continue;
    if (!m.name || !ts.isIdentifier(m.name) || !exposed.has(m.name.text)) continue;
    const priv = (m.modifiers || []).find((x) => x.kind === ts.SyntaxKind.PrivateKeyword);
    if (priv) edits.push({ start: priv.getStart(sf), end: priv.getEnd() + 1, text: '' });
  }

  for (const [name, i] of info) {
    const m = i.node;
    if (!needsStub.has(name)) { edits.push({ start: m.getFullStart(), end: m.getEnd(), text: '' }); continue; }
    const ns = nsFor.get(i.file);
    const args = ['this'].concat(m.parameters.map((p) => (p.dotDotDotToken ? '...' : '') + p.name.getText(sf)));
    const head = text.slice(m.getStart(sf), m.body.getStart(sf)).replace(/^(private|public|protected)\s+/, '');
    const ret = m.type && m.type.getText(sf) === 'void' ? '' : 'return ';
    // The prose travels with the implementation, so the stub replaces the whole member — leading
    // doc comment included — rather than being left standing under a copy of it.
    edits.push({ start: m.getFullStart(), end: m.getEnd(), text: `\n\n  ${head}{ ${ret}${ns}.${name}(${args.join(', ')}); }` });
  }

  // Zero-width inserts first at a shared position, so the import block survives the removal of the
  // top-level declarations that begin at exactly the same offset.
  const sorted = edits.sort((a, b) => a.start - b.start || (a.end - a.start) - (b.end - b.start));
  const out = [];
  let cursor = 0;
  for (const e of sorted) {
    if (e.start < cursor) continue;
    out.push(text.slice(cursor, e.start), e.text);
    cursor = e.end;
  }
  out.push(text.slice(cursor));
  fs.writeFileSync(SRC, out.join('').replace(/\n{3,}/g, '\n\n'));
  written.push(SRC);
}

console.log(`wrote ${written.length} files; dropped ${[...DROP].join(', ') || 'nothing'}`);
for (const w of written) console.log('  ', String(fs.readFileSync(w, 'utf8').split('\n').length).padStart(6), w);
