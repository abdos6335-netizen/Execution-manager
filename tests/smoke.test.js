const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(new URL('../app.js', 'file://' + __filename), 'utf8');

function createApp(initialStorage = {}) {
  const elements = new Map();
  const makeElement = () => ({
    value: '', innerHTML: '', textContent: '', dataset: {},
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, setAttribute() {}, querySelector() { return makeElement(); },
    querySelectorAll() { return []; }, scrollIntoView() {}, reset() {}, click() {}
  });
  const document = {
    body: { dataset: {} },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    querySelector() { return { content: '', setAttribute() {} }; },
    createElement() { return makeElement(); },
    head: { appendChild() {} },
    documentElement: { style: { setProperty() {} }, dataset: {}, set colorScheme(value) {} }
  };
  const values = new Map(Object.entries(initialStorage));
  let failWrites = false;
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (failWrites) throw new Error('storage quota exceeded');
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); }
  };
  const window = {
    scrollTo() {}, print() {},
    matchMedia() { return { matches: false, addEventListener() {} }; }
  };
  const context = vm.createContext({
    document, window, localStorage, matchMedia: window.matchMedia,
    confirm: () => true, alert() {}, console
  });
  vm.runInContext(source + `
    globalThis.__appTest = {
      getState: () => state, normalizeState, parseQuickText,
      contractorTotals, answerReportQuestion, today, spentForProject,
      itemCard, itemMovements, paidForItem, findDuplicateMovement, save, elements: null, storage: null,
      failStorageWrites(value) { globalThis.__failWrites(value); }
    };
  `, context);
  context.__appTest.elements = elements;
  context.__appTest.storage = values;
  context.__failWrites = value => { failWrites = value; };
  return context.__appTest;
}

test('application starts with a valid default project', () => {
  const app = createApp();
  assert.equal(app.getState().projects.length, 1);
  assert.equal(app.getState().current, 'p1');
});

test('empty or invalid project arrays recover without crashing', () => {
  const normalized = createApp().normalizeState({ projects: [], collections: [] });
  assert.equal(normalized.projects.length, 1);
  assert.equal(normalized.current, normalized.projects[0].id);
});

test('today uses the local calendar date, not UTC date', () => {
  const app = createApp();
  const d = new Date();
  const expected = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  assert.equal(app.today(), expected);
});

test('quick entry classifies a materials purchase before the generic word "paid"', () => {
  const app = createApp();
  app.elements.get('quickText').value = 'دفعت ٨٥٠٠ جنيه لشراء خامات للبوابة';
  app.parseQuickText();
  assert.equal(app.elements.get('quickKind').value, 'materials');
  assert.equal(Number(app.elements.get('quickAmount').value), 8500);
});

test('quick entry still recognizes a craftsman labor payment', () => {
  const app = createApp();
  app.elements.get('quickText').value = 'دفعت ٣٠٠٠ جنيه لمحمد النقاش أجرة دهانات البوابة';
  app.parseQuickText();
  assert.equal(app.elements.get('quickKind').value, 'labor');
  assert.equal(Number(app.elements.get('quickAmount').value), 3000);
});

test('quick-entry clear action also clears the natural-language text', () => {
  const app = createApp();
  app.elements.get('quickText').value = 'دفعت ٣٠٠٠ جنيه';
  app.elements.get('clearQuickForm').onclick();
  assert.equal(app.elements.get('quickText').value, '');
  assert.equal(app.elements.get('quickDate').value, app.today());
});

test('account Q&A respects the active report date filters', () => {
  const app = createApp();
  const state = app.getState();
  state.contractors = [{ id: 'c1', projectId: 'p1', name: 'محمد النقاش', aliases: ['محمد'] }];
  state.expenses = [
    { id: 'old', projectId: 'p1', payee: 'محمد', payeeId: 'c1', amount: 900, date: '2026-01-01' },
    { id: 'new', projectId: 'p1', payee: 'محمد', payeeId: 'c1', amount: 100, date: '2026-01-10' }
  ];
  app.elements.get('reportFrom').value = '2026-01-05';
  app.elements.get('reportTo').value = '2026-01-15';
  app.elements.get('reportQuestion').value = 'دفعت كام لمحمد';
  app.answerReportQuestion();
  assert.match(app.elements.get('reportAnswer').textContent, /١٠٠/);
});

test('contractor account includes both ledger payments and direct purchases', () => {
  const app = createApp();
  const state = app.getState();
  state.contractors = [{ id: 'c1', projectId: 'p1', name: 'محمد النقاش', aliases: ['محمد'] }];
  state.items = [{ id: 'i1', projectId: 'p1', name: 'دهانات', materialsContractorId: 'c1', materialsAmount: 100 }];
  state.payments = [{ id: 'pay1', projectId: 'p1', itemId: 'i1', contractorId: 'c1', type: 'materials', amount: 20 }];
  state.expenses = [{ id: 'ex1', projectId: 'p1', itemId: 'i1', payee: 'محمد', payeeId: 'c1', amount: 30 }];
  const totals = app.contractorTotals(state.contractors[0]);
  assert.equal(totals.agreements, 100);
  assert.equal(totals.payments, 20);
  assert.equal(totals.paid, 50);
});

test('account Q&A refuses to guess between people sharing an alias', () => {
  const app = createApp();
  app.getState().contractors = [
    { id: 'c1', projectId: 'p1', name: 'محمد النقاش', aliases: ['محمد'] },
    { id: 'c2', projectId: 'p1', name: 'محمد علي', aliases: ['محمد'] }
  ];
  app.elements.get('reportQuestion').value = 'دفعت كام لمحمد';
  app.answerReportQuestion();
  assert.match(app.elements.get('reportAnswer').textContent, /الاسم غير محدد/);
});

test('execution cost remains direct expenses plus contractor payments', () => {
  const app = createApp();
  const state = app.getState();
  state.expenses = [{ id: 'ex1', projectId: 'p1', amount: 50 }];
  state.payments = [{ id: 'pay1', projectId: 'p1', amount: 100 }];
  assert.equal(app.spentForProject(), 150);
});

test('backup normalization preserves a collection profit snapshot', () => {
  const app = createApp();
  const normalized = app.normalizeState({
    projects: [{ id: 'p1', name: 'P', rate: 20 }], current: 'p1',
    collections: [{ id: 'c1', project: 'p1', amount: 1000, rate: 10, reserved: 100 }]
  });
  assert.equal(normalized.collections[0].reserved, 100);
  assert.equal(normalized.collections[0].rate, 10);
});

test('backup import writes successfully before replacing in-memory state', async () => {
  const app = createApp();
  const input = app.elements.get('importData');
  const payload = { projects: [{ id: 'p2', name: 'New project', rate: 5 }], current: 'p2', collections: [], expenses: [], items: [], contractors: [], payments: [] };
  const target = { files: [{ size: 100, text: async () => JSON.stringify(payload) }], value: 'selected' };
  await input.onchange({ target });
  assert.equal(app.getState().current, 'p2');
  assert.ok(app.storage.has('execution-manager-v02'));
  assert.equal(target.value, '');
});

test('failed backup storage write leaves the current in-memory state intact', async () => {
  const app = createApp();
  const before = app.getState();
  app.failStorageWrites(true);
  const input = app.elements.get('importData');
  const payload = { projects: [{ id: 'p2', name: 'New project', rate: 5 }], current: 'p2', collections: [], expenses: [], items: [], contractors: [], payments: [] };
  const target = { files: [{ size: 100, text: async () => JSON.stringify(payload) }], value: 'selected' };
  await input.onchange({ target });
  assert.equal(app.getState(), before);
  assert.equal(app.getState().current, 'p1');
  assert.equal(target.value, '');
});

test('corrupted local data is copied to a recovery key before defaults are used', () => {
  const app = createApp({ 'execution-manager-v02': '{broken-json' });
  assert.equal(app.getState().current, 'p1');
  assert.ok([...app.storage.keys()].some(key => key.startsWith('execution-manager-v02.recovery.')));
});

test('quick entry understands taa marbuta spellings and prefers explicit labor words over item words', () => {
  const app = createApp();
  const set = text => { app.elements.get('quickAmount').value = ''; app.elements.get('quickAmount').dataset.auto = ''; app.elements.get('quickText').value = text; app.parseQuickText(); };
  set('دفعت ٢٠٠٠ جنيه أجرة تركيب سيراميك');
  assert.equal(app.elements.get('quickKind').value, 'labor');
  set('اشتريت مونة بـ ١٥٠٠');
  assert.equal(app.elements.get('quickKind').value, 'materials');
  assert.equal(Number(app.elements.get('quickAmount').value), 1500);
  set('دفعت مصنعية ٧٠٠');
  assert.equal(app.elements.get('quickKind').value, 'labor');
});

test('quick amount follows the typed text until the user edits it manually', () => {
  const app = createApp();
  const amount = app.elements.get('quickAmount');
  app.elements.get('quickText').value = 'دفعت ٣';
  app.parseQuickText();
  assert.equal(Number(amount.value), 3);
  app.elements.get('quickText').value = 'دفعت ٣٠٠٠ جنيه';
  app.parseQuickText();
  assert.equal(Number(amount.value), 3000);
  amount.value = '500';
  amount.dataset.auto = '';
  app.parseQuickText();
  assert.equal(Number(amount.value), 500);
});

test('save() keeps the app working when localStorage rejects the write', () => {
  const app = createApp();
  app.failStorageWrites(true);
  app.getState().collections.push({ id: 'c1', project: 'p1', amount: 100, rate: 10, reserved: 10, date: '2026-01-01' });
  assert.doesNotThrow(() => app.save());
  assert.equal(app.getState().collections.length, 1);
});

test('project sections expand progressively inside the same stacked cards', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(new URL('../index.html', 'file://' + __filename), 'utf8');
  const css = fs.readFileSync(new URL('../styles.css', 'file://' + __filename), 'utf8');
  assert.match(source, /if\(selectedSheet===page\)\{pushWorkspaceHistory\('expanded',page\);expandInlineSheet\(page\)\}/);
  assert.match(source, /host\.appendChild\(target\)/);
  assert.match(source, /function restoreInlineSheet\(\)/);
  assert.doesNotMatch(source, /if\(selectedSheet===page\)\{[^}]*setPage/);
  for (const id of ['dashboard', 'quick', 'items', 'contractors', 'collections', 'expenses']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.doesNotMatch(html, /id="sheetModal"/);
  assert.match(css, /\.sheet-inline-content/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /@keyframes sheetAura/);
});

test('workspace cards compress vertically and keep section content inside the expanded card on desktop and mobile', () => {
  const css = fs.readFileSync(new URL('../styles.css', 'file://' + __filename), 'utf8');
  assert.match(css, /\.project-sheet-grid\.has-selection \.project-sheet:not\(\.selected\) \.project-sheet-trigger\{height:58px/);
  assert.match(css, /\.project-sheet-grid\.has-expanded \.project-sheet:not\(\.expanded\) \.project-sheet-trigger\{height:48px/);
  assert.match(css, /\.sheet-inline-content\{max-height:none;overflow:visible/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media\(min-width:721px\)/);
  assert.match(css, /@media\(max-width:720px\)/);
});


test('workspace uses the full viewport and hides legacy navigation chrome', () => {
  const css = fs.readFileSync(new URL('../styles.css', 'file://' + __filename), 'utf8');
  assert.match(css, /\.sidebar,\.topbar,\.mobile-nav\{display:none!important\}/);
  assert.match(css, /main\{display:block;width:100%;max-width:none/);
  assert.match(css, /#projectSheets \.project-sheet-grid\{width:100%;max-width:none/);
});
test('workspace supports browser history and edge swipe back at one level per gesture', () => {
  assert.match(source, /function pushWorkspaceHistory\(level,page=''\)/);
  assert.match(source, /window\.addEventListener\?\.\('popstate'/);
  assert.match(source, /function enableWorkspaceSwipeBack\(\)/);
  assert.match(source, /if\(expandedSheet===page\)\{goWorkspaceBack\(\);return\}/);
  assert.match(source, /pushWorkspaceHistory\('expanded',page\)/);
  assert.match(source, /pushWorkspaceHistory\('selected',page\)/);
});


test('expanded inline content keeps the exact outer project-card color', () => {
  const css = fs.readFileSync(new URL('../styles.css', 'file://' + __filename), 'utf8');
  assert.match(css, /\.sheet-inline-content\{background:transparent;color:inherit/);
  assert.match(css, /background:transparent;box-shadow:none\}/);
  assert.doesNotMatch(css, /\.sheet-inline-content\{[^}]*background:var\(--canvas\)/);
});


test('each card palette derives readable foreground text for light and dark colors', () => {
  const app = fs.readFileSync(new URL('../app.js', 'file://' + __filename), 'utf8');
  assert.ok(app.includes('function contrastInk(hex)'));
  assert.ok(app.includes('SHEET_PALETTES='));
  assert.ok(app.includes("root.style.setProperty('--sheet-'+(i+1)+'-color',color)"));
  assert.ok(app.includes("root.style.setProperty('--sheet-'+(i+1)+'-ink',textColor)"));
  assert.ok(app.includes("l>.179?'#17191c':'#ffffff'"));
});

test('expanded card content and nested surfaces stay on the card color family', () => {
  const css = fs.readFileSync(new URL('../styles.css', 'file://' + __filename), 'utf8');
  for (let i = 1; i <= 6; i++) {
    assert.ok(css.includes(`.project-sheet:nth-child(${i}){--sheet-ink:var(--sheet-${i}-ink);--sheet-bg:var(--sheet-${i}-color)}`));
  }
  assert.ok(css.includes('.sheet-inline-content{background:transparent!important'));
  assert.ok(css.includes('background:color-mix(in srgb,var(--sheet-bg) 87%,white 13%)!important'));
  assert.ok(css.includes('color:var(--sheet-ink)!important'));
  assert.ok(css.includes('background:color-mix(in srgb,var(--sheet-ink) 5%,transparent)'));
});

test('input fields are tinted one shade lighter from each actual card color, not from the foreground ink', () => {
  const app = fs.readFileSync(new URL('../app.js', 'file://' + __filename), 'utf8');
  const css = fs.readFileSync(new URL('../styles.css', 'file://' + __filename), 'utf8');
  assert.ok(app.includes("root.style.setProperty('--sheet-'+(i+1)+'-color',color)"));
  for (let i = 1; i <= 6; i++) {
    assert.ok(css.includes(`.project-sheet:nth-child(${i}){--sheet-ink:var(--sheet-${i}-ink);--sheet-bg:var(--sheet-${i}-color)}`));
  }
  assert.ok(css.includes('background:color-mix(in srgb,var(--sheet-bg) 87%,white 13%)!important'));
  assert.ok(!css.includes('background:color-mix(in srgb,var(--sheet-ink) 13%,white)!important'));
});

// Mobile card input tint regression coverage.

test('Android PWA cache version is bumped for the new mobile card styles', () => {
  const sw = fs.readFileSync(new URL('../sw.js', 'file://' + __filename), 'utf8');
  assert.ok(sw.includes('const CACHE_NAME = "wathiq-shell-v9"'));
});

test('appearance preferences expose WeeklyPlanner-style controls and persist line spacing', () => {
  const html = fs.readFileSync(new URL('../index.html', 'file://' + __filename), 'utf8');
  const app = fs.readFileSync(new URL('../app.js', 'file://' + __filename), 'utf8');
  const css = fs.readFileSync(new URL('../styles.css', 'file://' + __filename), 'utf8');
  for (const id of ['appearanceMode','appearanceAccent','appearanceBackground','appearanceText','appearanceFont','appearanceScale','appearanceSaturation','appearanceSurface','appearanceGlass','appearanceBlur','appearanceIconStyle','appearanceLineHeight','appearanceHeading','appearanceSubheading','appearanceItem','appearanceMotionStyle','appearanceMotionSpeed','appearanceDoneColor']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing appearance control: ' + id);
  }
  assert.ok(app.includes("lineHeight:1.4"));
  assert.ok(app.includes("['#ffffff','#333333','#000000']"));
  assert.doesNotMatch(html, /appearanceTextAuto/);
  assert.ok(app.includes("'--line-height':String(Math.min(1.8,Math.max(1.2,Number(a.lineHeight)||1.4)))"));
  assert.ok(css.includes('body{line-height:var(--line-height,1.4)}'));
  assert.ok(html.includes('id="workspaceSettingsButton"'));
  assert.ok(html.includes('id="settingsBackToSheets"'));
});
test('Android PWA cache is refreshed for expanded appearance settings', () => {
  const sw = fs.readFileSync(new URL('../sw.js', 'file://' + __filename), 'utf8');
  assert.ok(sw.includes('const CACHE_NAME = "wathiq-shell-v9"'));
});

test('workspace settings shortcut remains visible in the full-width six-card layout', () => {
  const css = fs.readFileSync(new URL('../styles.css', 'file://' + __filename), 'utf8');
  const html = fs.readFileSync(new URL('../index.html', 'file://' + __filename), 'utf8');
  assert.ok(html.includes('id="workspaceSettingsButton"'));
  assert.ok(css.includes('#projectSheets .sheets-intro{display:flex!important'));
  assert.ok(html.includes('id="settingsBackToSheets"'));
});

test('item ledger totals include both direct expenses and item payments exactly once', () => {
  const app = createApp();
  const state = app.getState();
  state.items = [{ id: 'i1', projectId: 'p1', name: 'دهانات', materialsAmount: 500, laborAmount: 700 }];
  state.expenses = [
    { id: 'e1', projectId: 'p1', itemId: 'i1', item: 'دهانات', type: 'materials', amount: 120, date: '2026-11-20' },
    { id: 'e2', projectId: 'p1', itemId: 'i1', item: 'دهانات', type: 'labor', amount: 80, date: '2026-11-20' }
  ];
  state.payments = [
    { id: 'p1', projectId: 'p1', itemId: 'i1', type: 'materials', amount: 30 },
    { id: 'p2', projectId: 'p1', itemId: 'i1', type: 'labor', amount: 40 }
  ];
  assert.equal(app.paidForItem('i1', 'materials'), 150);
  assert.equal(app.paidForItem('i1', 'labor'), 120);
  assert.equal(app.paidForItem('i1'), 270);
  assert.equal(app.itemMovements('i1').length, 4);
});
test('duplicate movement guard catches the same real movement across both ledgers but allows a different date', () => {
  const app = createApp();
  const state = app.getState();
  state.contractors = [{ id: 'c1', projectId: 'p1', name: 'محمد النقاش', aliases: ['محمد'] }];
  state.items = [{ id: 'i1', projectId: 'p1', name: 'دهانات' }];
  state.expenses = [{ id: 'e1', projectId: 'p1', itemId: 'i1', type: 'labor', amount: 300, date: '2026-11-20', payeeId: 'c1', payee: 'محمد النقاش' }];
  assert.equal(app.findDuplicateMovement({ itemId: 'i1', type: 'labor', amount: 300, date: '2026-11-20', personId: 'c1' }).id, 'e1');
  assert.equal(app.findDuplicateMovement({ itemId: 'i1', type: 'labor', amount: 300, date: '2026-11-21', personId: 'c1' }), null);
});
test('contractor account includes direct and payment movements linked to the contractor', () => {
  const app = createApp();
  const state = app.getState();
  state.contractors = [{ id: 'c1', projectId: 'p1', name: 'محمد النقاش' }];
  state.items = [{ id: 'i1', projectId: 'p1', name: 'دهانات', laborContractorId: 'c1', laborAmount: 900 }];
  state.expenses = [{ id: 'e1', projectId: 'p1', itemId: 'i1', payeeId: 'c1', payee: 'محمد النقاش', type: 'labor', amount: 100 }];
  state.payments = [{ id: 'p1', projectId: 'p1', itemId: 'i1', contractorId: 'c1', type: 'labor', amount: 200 }];
  const totals = app.contractorTotals(state.contractors[0]);
  assert.equal(totals.paid, 300);
  assert.equal(totals.items.length, 1);
});

test('legacy item-name-only direct expenses remain visible in the item ledger', () => {
  const app = createApp();
  const state = app.getState();
  state.items = [{ id: 'i1', projectId: 'p1', name: 'دهانات' }];
  state.expenses = [{ id: 'e1', projectId: 'p1', item: 'دهانات', type: 'materials', amount: 75 }];
  assert.equal(app.paidForItem('i1', 'materials'), 75);
  assert.equal(app.itemMovements('i1').length, 1);
});
