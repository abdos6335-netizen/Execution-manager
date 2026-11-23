const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(new URL('../app.js', 'file://' + __filename), 'utf8');

function createApp(initialStorage = {}) {
  const elements = new Map();
  const cssVars = new Map();
  const makeElement = () => {
    const classes = new Set(), listeners = {};
    return {
      value: '', innerHTML: '', textContent: '', dataset: {},
      style: { setProperty() {} },
      classList: {
        add(...names) { names.forEach(name => classes.add(name)); },
        remove(...names) { names.forEach(name => classes.delete(name)); },
        toggle(name, force) { const next = force === undefined ? !classes.has(name) : !!force; if (next) classes.add(name); else classes.delete(name); return next; },
        contains(name) { return classes.has(name); }
      },
      addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
      dispatch(name, event = {}) { const e = { target: this, ...event }; (listeners[name] || []).forEach(fn => fn(e)); },
      setAttribute() {}, insertAdjacentHTML(position, html) { this.innerHTML += html; }, querySelector() { return makeElement(); },
      querySelectorAll() { return []; }, scrollIntoView() {}, reset() {}, click() {}
    };
  };
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
    documentElement: { style: { setProperty(name, value) { cssVars.set(name, String(value)); }, getPropertyValue(name) { return cssVars.get(name) || ''; } }, dataset: {}, set colorScheme(value) {} }
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
      getState: () => state, normalizeState, parseQuickText, deriveSheetShades, getAppearance, saveAppearance, applyAppearance, toggleInvoiceSelector,
      contractorTotals, answerReportQuestion, today, spentForProject, SHEET_PALETTES, invoiceTotals, supplierLedgerTotals, laborTotalsForContractor, executionCostForProject, cashOutflowForProject, validateDailyLog, validateBackupFile, validateImportedState,
      itemCard, itemMovements, paidForItem, findDuplicateMovement, parseAmountFromText, withDupCache, relinkRenamedItem, relinkRenamedContractor, confirmUnlinkedSupplierPayment, setConfirm(fn) { globalThis.confirm = fn; }, save, editTransaction, elements: null, storage: null,
      setPromptAnswers(answers) { const queue = [...answers]; window.prompt = () => queue.shift(); },
      failStorageWrites(value) { globalThis.__failWrites(value); }
    };
  `, context);
  context.__appTest.elements = elements;
  context.__appTest.cssVars = cssVars;
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
  assert.equal(app.elements.get('quickKind').value, 'purchase_invoice');
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
  const target = { files: [{ name: 'backup.json', type: 'application/json', size: 100, text: async () => JSON.stringify(payload) }], value: 'selected' };
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
  assert.equal(app.elements.get('quickKind').value, 'purchase_invoice');
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
  assert.ok(app.includes("root.style.setProperty('--sheet-'+(i+1)+'-ink',textColor)" ) || app.includes("--sheet-'+(i+1)+'-ink"));
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
  assert.ok(sw.includes('const CACHE_NAME = "wathiq-shell-v28"'));
});

test('appearance preferences expose WeeklyPlanner-style controls and persist line spacing', () => {
  const html = fs.readFileSync(new URL('../index.html', 'file://' + __filename), 'utf8');
  const app = fs.readFileSync(new URL('../app.js', 'file://' + __filename), 'utf8');
  const css = fs.readFileSync(new URL('../styles.css', 'file://' + __filename), 'utf8');
  for (const id of ['appearanceMode','appearanceAccent','appearanceBackground','appearanceText','appearanceFont','appearanceScale','appearanceSaturation','appearanceSurface','appearanceGlass','appearanceBlur','appearanceIconStyle','appearanceLineHeight','appearanceHeading','appearanceSubheading','appearanceItem','appearanceMotionStyle','appearanceMotionSpeed','appearanceDoneColor']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing appearance control: ' + id);
  }
  assert.ok(app.includes("lineHeight:1.4"));
  assert.ok(app.includes("['#ffffff','#333333','#000000','#121606']"));
  assert.doesNotMatch(html, /appearanceTextAuto/);
  assert.ok(app.includes("'--line-height':String(Math.min(1.8,Math.max(1.2,Number(a.lineHeight)||1.4)))"));
  assert.ok(css.includes('body{line-height:var(--line-height,1.4)}'));
  assert.ok(html.includes('id="workspaceSettingsButton"'));
  assert.ok(html.includes('id="settingsBackToSheets"'));
});
test('Android PWA cache is refreshed for expanded appearance settings', () => {
  const sw = fs.readFileSync(new URL('../sw.js', 'file://' + __filename), 'utf8');
  assert.ok(sw.includes('const CACHE_NAME = "wathiq-shell-v28"'));
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

test('item ledger totals are isolated to the active project', () => {
  const app = createApp();
  const state = app.getState();
  state.projects.push({ id: 'p2', name: 'مشروع آخر', rate: 10 });
  state.items = [{ id: 'i1', projectId: 'p1', name: 'دهانات' }];
  state.expenses = [
    { id: 'e1', projectId: 'p1', itemId: 'i1', type: 'materials', amount: 50 },
    { id: 'e2', projectId: 'p2', itemId: 'i1', type: 'materials', amount: 900 }
  ];
  assert.equal(app.paidForItem('i1', 'materials'), 50);
});

test('direct expense entry can create and link a supplier or craftsman account', () => {
  assert.match(source, /غير مسجل[\s\S]*هل تريد إنشاء حساب وربط الحركة به/);
  assert.match(source, /state\.contractors\.push\(matchedPayee\)/);
  assert.match(source, /payeeId:matchedPayee\?\.id/);
});

test('cancelled duplicate direct expense does not create an orphan contractor account', () => {
  const createAt = source.indexOf('if(createPayee){matchedPayee=');
  const duplicateGuardAt = source.indexOf('if(!confirmNoDuplicateMovement', source.indexOf("$('expenseForm').onsubmit"));
  assert.ok(createAt > duplicateGuardAt);
});


test('all card palettes use muted colors with readable dark text and a lightness progression', () => {
  const app = createApp();
  const palettes = app.SHEET_PALETTES;
  assert.equal(Object.keys(palettes).length, 10);
  for (const [name, colors] of Object.entries(palettes)) {
    assert.equal(colors.length, 6, name + ' must contain six card colors');
    const luminance = colors.map(hex => {
      const rgb = hex.match(/[0-9a-f]{2}/gi).map(v => parseInt(v, 16) / 255);
      const linear = rgb.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      const [r, g, b] = linear;
      return .2126 * r + .7152 * g + .0722 * b;
    });
    for (let i = 0; i < colors.length; i++) {
      const rgb = colors[i].match(/[0-9a-f]{2}/gi).map(v => parseInt(v, 16) / 255);
      const max = Math.max(...rgb), min = Math.min(...rgb);
      const lightness = (max + min) / 2;
      const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
      assert.ok(saturation <= .30, name + ' color ' + (i + 1) + ' is too saturated');
      const contrast = (luminance[i] + .05) / (.033 + .05);
      assert.ok(contrast >= 4.5, name + ' color ' + (i + 1) + ' is too dark for #333 text');
      assert.ok(luminance[i] >= .70, name + ' color ' + (i + 1) + ' must stay visibly light');
      if (i) assert.ok(luminance[i] > luminance[i - 1], name + ' must brighten from card to card');
    }
  }
});


test('supplier invoice and its linked payments are not counted twice as execution cost', () => {
 const app=createApp();const s=app.getState();
 s.purchases=[{id:'i1',projectId:'p1',supplierId:'v1',amount:10000,date:'2026-11-20'}];
 s.payments=[{id:'p1',projectId:'p1',invoiceId:'i1',contractorId:'v1',type:'materials',purpose:'supplier_invoice_payment',amount:6000,date:'2026-11-21'}];
 assert.deepEqual(JSON.parse(JSON.stringify(app.invoiceTotals(s.purchases[0]))),{amount:10000,paid:6000,outstanding:4000});
 assert.equal(app.executionCostForProject(),10000);
 assert.equal(app.cashOutflowForProject(),6000);
});
test('labor advances are cash paid but do not become earned labor cost', () => {
 const app=createApp();const s=app.getState();
 s.payments=[{id:'p1',projectId:'p1',contractorId:'c1',type:'labor',purpose:'advance',amount:1500,date:'2026-11-20'}];
 s.laborEntries=[{id:'l1',projectId:'p1',contractorId:'c1',amount:4000,status:'approved',date:'2026-11-20'}];
 assert.equal(app.executionCostForProject(),4000);
 assert.equal(app.cashOutflowForProject(),1500);
 assert.deepEqual(JSON.parse(JSON.stringify(app.laborTotalsForContractor('c1'))),{earned:4000,paid:1500,advances:1500,balance:2500});
});
test('legacy payments retain their prior cost treatment for backward compatibility', () => {
 const app=createApp();app.getState().payments=[{id:'old',projectId:'p1',type:'labor',amount:700}];
 assert.equal(app.executionCostForProject(),700);
});
test('daily site log validates date, description and positive optional quantity', () => {
 const app=createApp();
 assert.equal(app.validateDailyLog({date:'',note:'تم التنفيذ'}).ok,false);
 assert.equal(app.validateDailyLog({date:'2026-11-20',note:'',quantity:''}).ok,false);
 assert.equal(app.validateDailyLog({date:'2026-11-20',note:'تم تنفيذ المحارة',quantity:'0'}).ok,false);
 assert.equal(app.validateDailyLog({date:'2026-11-20',note:'تم تنفيذ المحارة',quantity:'35'}).ok,true);
});

test('daily site log rejects impossible calendar dates', () => {
 const app=createApp();
 assert.equal(app.validateDailyLog({date:'2026-02-30',note:'ملاحظة'}).ok,false);
 assert.equal(app.validateDailyLog({date:'2026-11-20',note:'ملاحظة'}).ok,true);
});
test('backup validation rejects supplier payments linked to a missing invoice', () => {
 const app=createApp();
 const result=app.validateImportedState({projects:[{id:'p1',name:'P'}],current:'p1',collections:[],payments:[{id:'x',projectId:'p1',amount:10,purpose:'supplier_invoice_payment',invoiceId:'missing'}]});
 assert.equal(result.ok,false);
});

test('site diary entries without a quantity remain valid after normalization', () => {
 const app=createApp();
 const normalized=app.normalizeState({projects:[{id:'p1',name:'P'}],current:'p1',collections:[],siteLogs:[{id:'l1',projectId:'p1',date:'2026-11-20',note:'ملاحظة موقع'}]});
 assert.equal(app.validateDailyLog(normalized.siteLogs[0]).ok,true);
});


test('muted appearance defaults and all theme swatches use the soft palettes', () => {
  const html = fs.readFileSync(new URL('../index.html', 'file://' + __filename), 'utf8');
  assert.ok(source.includes("accent:'#8cab99',background:'#e7eeea'"));
  assert.ok(html.includes('value="#dec956"'));
  assert.ok(html.includes('value="#c0c3b0"'));
  for (const color of ['#d9e8de','#e6dad3','#e5dcd1','#d9e7e9','#e9dce4','#dde4e9','#e2dfe8','#e2e2e6','#e8e2d6','#ebdde0']) {
    assert.ok(html.includes(color), 'missing muted theme swatch color '+color);
  }
});

test('legacy built-in appearance colors migrate while preserving other preferences and app data', () => {
  const appData = JSON.stringify({projects:[{id:'p1',name:'Existing project',rate:12}],current:'p1',collections:[{id:'c1',amount:500}]});
  const appearance = JSON.stringify({theme:'sage',accent:'#294438',background:'#f1f0e8',font:'cairo',scale:110,saturation:85});
  const app = createApp({'execution-manager-v02':appData,'em:appearance':appearance});
  const migrated = JSON.parse(app.storage.get('em:appearance'));
  assert.equal(migrated.theme,'olive');
  assert.equal(migrated.accent,'#dec956');
  assert.equal(migrated.background,'#c0c3b0');
  assert.equal(migrated.font,'cairo');
  assert.equal(migrated.scale,110);
  assert.equal(migrated.saturation,85);
  assert.equal(migrated.appearanceVersion,4);
  assert.equal(app.storage.get('execution-manager-v02'),appData);
});

test('custom appearance colors are not overwritten by the legacy migration', () => {
  const appearance = JSON.stringify({theme:'sage',accent:'#123456',background:'#abcdef',font:'tajawal'});
  const app = createApp({'em:appearance':appearance});
  const migrated = JSON.parse(app.storage.get('em:appearance'));
  assert.equal(migrated.accent,'#123456');
  assert.equal(migrated.background,'#abcdef');
  assert.equal(migrated.font,'tajawal');
  assert.equal(migrated.appearanceVersion,2);
});


test('all six light workspace cards use their dark palette foreground', () => {
  const css = fs.readFileSync(new URL('../styles.css', 'file://' + __filename), 'utf8');
  for (let i = 1; i <= 6; i++) {
    assert.ok(css.includes('.project-sheet:nth-child(' + i + '){background:var(--sheet-' + i + ');color:var(--sheet-' + i + '-ink,#333)}'), 'card ' + i + ' must use a dark readable foreground');
  }
});

test('appearance palette writes the exact legacy sheet variables consumed by card CSS', () => {
  assert.match(source, /setProperty\('--sheet-'\+\(i\+1\),color\)/);
  const css = fs.readFileSync(new URL('../styles.css', 'file://' + __filename), 'utf8');
  for (let i = 1; i <= 6; i++) {
    assert.ok(css.includes('background:var(--sheet-' + i), 'card ' + i + ' CSS must consume its sheet variable');
  }
});

test('service worker cache is bumped when appearance assets change', () => {
  const sw = fs.readFileSync(new URL('../sw.js', 'file://' + __filename), 'utf8');
  assert.match(sw, /wathiq-shell-v28/);
});


test('only the selected workspace card is pulled forward and tilted while the remaining cards stay stacked and still', () => {
  const css = fs.readFileSync(new URL('../styles.css', 'file://' + __filename), 'utf8');
  assert.match(css, /#projectSheets \.project-sheet-grid\.has-selection \.project-sheet:not\(\.selected\)\{\s*transform:none;\s*opacity:1;\s*filter:none;/);
  assert.match(css, /#projectSheets \.project-sheet\.selected\{[\s\S]*?rotate\(-2\.5deg\)/);
  assert.match(css, /#projectSheets \.project-sheet \+ \.project-sheet\{margin-top:-56px/);
  assert.match(css, /#projectSheets \.project-sheet:nth-child\(6\)\{--sheet-stack-order:6;z-index:6\}/);
  assert.match(css, /#projectSheets \.project-sheet\.selected\{[\s\S]*?z-index:var\(--sheet-stack-order\)!important/);
  assert.match(css, /#projectSheets \.project-sheet:nth-child\(2\)\{--sheet-stack-order:2;z-index:2\}/);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*?rotate\(-2\.5deg\)/);
  const sw = fs.readFileSync(new URL('../sw.js', 'file://' + __filename), 'utf8');
  assert.match(sw, /wathiq-shell-v28/);
});

test('workspace card palette supports six coordinated shades and one independently chosen standout card', () => {
  const app = fs.readFileSync(new URL('../app.js', 'file://' + __filename), 'utf8');
  const html = fs.readFileSync(new URL('../index.html', 'file://' + __filename), 'utf8');
  assert.match(app, /function deriveSheetShades\(hex\)/);
  assert.match(app, /specialIndex=a.sheetSpecialIndex==='none'\?-1:Number\(a\.sheetSpecialIndex\)/);
  assert.match(app, /i===specialIndex\?specialHex:saturateHex\(raw/);
  assert.ok(html.includes('id="sheetBaseColor"'));
  assert.ok(html.includes('id="sheetSpecialIndex"'));
  assert.ok(html.includes('id="sheetSpecialColor"'));
  for (const label of ['الماليات','الحركات اليومية','بنود التنفيذ','الصنايعية والموردين','التحصيلات','المصروفات']) assert.ok(html.includes('<option value="'+['الماليات','الحركات اليومية','بنود التنفيذ','الصنايعية والموردين','التحصيلات','المصروفات'].indexOf(label)+'">'+label+'</option>'));
  const sw = fs.readFileSync(new URL('../sw.js', 'file://' + __filename), 'utf8');
  assert.match(sw, /wathiq-shell-v28/);
});


test('expanded workspace card grows to contain its inline content and reveals it with motion', () => {
  const css = fs.readFileSync(new URL('../styles.css', 'file://' + __filename), 'utf8');
  assert.match(css, /#projectSheets \.project-sheet\.expanded\{[\s\S]*?height:auto;[\s\S]*?min-height:0;[\s\S]*?overflow:visible/);
  assert.match(css, /#projectSheets \.project-sheet\.expanded\{[\s\S]*?z-index:var\(--sheet-stack-order\)!important/);
  assert.doesNotMatch(css, /#projectSheets \.project-sheet\.expanded\{[^}]*z-index:45!important/);
  assert.match(css, /#projectSheets \.project-sheet\.expanded \.sheet-inline-content\{[\s\S]*?animation:sheetContentUnfold \.62s/);
  assert.match(css, /@keyframes sheetContentUnfold\{[\s\S]*?clip-path:inset\(0 0 92% 0\)[\s\S]*?clip-path:inset\(0 0 0 0\)/);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*?#projectSheets \.project-sheet\.expanded\{[\s\S]*?height:auto/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)[\s\S]*?sheetContentUnfold|@media\(prefers-reduced-motion:reduce\)[\s\S]*?project-sheet\.expanded/);
});


test('custom card color controls persist their selected values', () => {
  const app = createApp();
  const base = app.elements.get('sheetBaseColor');
  base.value = '#202020';
  base.dispatch('input');
  const standout = app.elements.get('sheetSpecialIndex');
  standout.value = '4';
  standout.dispatch('input');
  const standoutColor = app.elements.get('sheetSpecialColor');
  standoutColor.value = '#b45c32';
  standoutColor.dispatch('input');
  const saved = app.getAppearance();
  assert.equal(saved.sheetBaseColor, '#202020');
  assert.equal(saved.sheetSpecialIndex, '4');
  assert.equal(saved.sheetSpecialColor, '#b45c32');
});

test('natural-language supplier invoice payment reveals invoice selector', () => {
  const app = createApp();
  app.elements.get('quickText').value = 'سداد فاتورة مورد ١٥٠٠ جنيه';
  app.parseQuickText();
  assert.equal(app.elements.get('quickKind').value, 'supplier_payment');
  assert.equal(app.elements.get('quickInvoiceWrap').classList.contains('hidden'), false);
});

test('card shade generator returns six visibly distinct colors for extreme and dark inputs', () => {
  const app = createApp();
  for (const base of ['#000000', '#ffffff', '#101010', '#a8b7ad']) {
    const shades = app.deriveSheetShades(base);
    assert.equal(shades.length, 6);
    assert.equal(new Set(shades).size, 6, 'six unique shades required for ' + base);
  }
  assert.equal(app.deriveSheetShades('#a8b7ad')[3], '#a8b7ad');
});

test('applying a black or white base palette preserves the exact base shade and produces six distinct rendered shades', () => {
  const app = createApp();
  for (const [base, baseIndex] of [['#000000', 0], ['#ffffff', 5]]) {
    app.saveAppearance({ sheetBaseColor: base, sheetSpecialIndex: 'none', saturation: 100 });
    const rendered = Array.from({ length: 6 }, (_, i) => app.cssVars.get('--sheet-' + (i + 1)).toLowerCase());
    assert.equal(rendered[baseIndex], base);
    assert.equal(new Set(rendered).size, 6, 'rendered shades must differ for ' + base);
  }
});

test('special card uses the exact user color while the other five stay in the base palette', () => {
  const app = createApp();
  app.saveAppearance({ sheetBaseColor: '#202020', sheetSpecialIndex: '4', sheetSpecialColor: '#b45c32', saturation: 100 });
  assert.equal(app.cssVars.get('--sheet-5'), '#b45c32');
  const others = [1, 2, 3, 4, 6].map(i => app.cssVars.get('--sheet-' + i));
  assert.equal(new Set(others).size, 5);
  assert.ok(others.every(color => color !== '#b45c32'));
});

test('typed or dictated supplier payment identifies a named supplier and selects its only open invoice', () => {
  const app = createApp();
  const state = app.getState();
  state.contractors = [{ id: 'supplier-1', projectId: 'p1', name: 'شركة النور', aliases: [], trade: 'مورد' }];
  state.items = [{ id: 'item-1', projectId: 'p1', name: 'سيراميك' }];
  state.purchases = [{ id: 'invoice-1', projectId: 'p1', supplierId: 'supplier-1', supplier: 'شركة النور', itemId: 'item-1', item: 'سيراميك', amount: 5000, date: '2026-11-20' }];
  app.elements.get('quickText').value = 'سداد فاتورة شركة النور ١٥٠٠ جنيه';
  app.parseQuickText();
  assert.equal(app.elements.get('quickKind').value, 'supplier_payment');
  assert.equal(app.elements.get('quickPerson').value, 'شركة النور');
  assert.equal(app.elements.get('quickInvoice').value, 'invoice-1');
  assert.equal(app.elements.get('quickInvoiceWrap').classList.contains('hidden'), false);
});

test('supplier payment does not guess when the supplier has multiple open invoices', () => {
  const app = createApp();
  const state = app.getState();
  state.contractors = [{ id: 'supplier-1', projectId: 'p1', name: 'شركة النور', aliases: [], trade: 'مورد' }];
  state.purchases = [
    { id: 'invoice-1', projectId: 'p1', supplierId: 'supplier-1', supplier: 'شركة النور', amount: 5000, date: '2026-11-20' },
    { id: 'invoice-2', projectId: 'p1', supplierId: 'supplier-1', supplier: 'شركة النور', amount: 3000, date: '2026-11-21' }
  ];
  app.elements.get('quickText').value = 'سداد فاتورة شركة النور ١٥٠٠ جنيه';
  app.parseQuickText();
  assert.equal(app.elements.get('quickInvoice').value, '');
});

test('expanded card keeps its original stack order so following cards can cover its lower edge', () => {
  const css = fs.readFileSync(new URL('../styles.css', 'file://' + __filename), 'utf8');
  assert.match(css, /#projectSheets \.project-sheet\.expanded\{[\s\S]*?z-index:var\(--sheet-stack-order\)!important/);
  assert.doesNotMatch(css, /#projectSheets \.project-sheet\.expanded\{[^}]*z-index:45!important/);
});

test('dark appearance uses readable light text and dark surfaces throughout the main UI', () => {
  const app = createApp();
  app.saveAppearance({ mode: 'dark', text: '#333333' });
  assert.equal(app.cssVars.get('--ink'), '#f1f1f2');
  assert.equal(app.cssVars.get('--paper'), '#29292d');
  assert.equal(app.cssVars.get('--muted'), '#a9a9b1');
  const css = fs.readFileSync(new URL('../styles.css', 'file://' + __filename), 'utf8');
  for (const selector of ['.surface', '.metric', '.record-card', '.table-wrap', '.form-grid input', '.appearance-grid select']) {
    assert.ok(css.includes('html[data-dark="1"] ' + selector), 'dark mode must theme ' + selector);
  }
});
test('global font scale is clamped and applied to shared typography groups', () => {
  const app = createApp();
  app.saveAppearance({ scale: 125 });
  assert.equal(app.cssVars.get('--scale'), '1.25');
  app.saveAppearance({ scale: 10 });
  assert.equal(app.cssVars.get('--scale'), '0.8');
  const css = fs.readFileSync(new URL('../styles.css', 'file://' + __filename), 'utf8');
  assert.match(css, /html\{font-size:calc\(16px \* var\(--scale,1\)\)\}/);
  assert.match(css, /--type-heading,1\) \* var\(--scale,1\)/);
  assert.match(css, /--type-subheading,1\) \* var\(--scale,1\)/);
  assert.match(css, /--type-item,1\) \* var\(--scale,1\)/);
});
test('backup import rejects malformed structures before asking to replace current data', async () => {
  const app = createApp();
  const before = app.getState();
  const input = app.elements.get('importData');
  const target = { files: [{ name: 'broken.json', type: 'application/json', size: 100, text: async () => JSON.stringify({ projects: [], collections: [] }) }], value: 'selected' };
  await input.onchange({ target });
  assert.equal(app.getState(), before);
  assert.equal(app.getState().current, 'p1');
  assert.equal(target.value, '');
});
test('backup validation rejects duplicate ids and broken project or item references', () => {
  const app = createApp();
  const duplicate = app.validateImportedState({ projects: [{ id: 'p1', name: 'P' }, { id: 'p1', name: 'P2' }], current: 'p1', collections: [] });
  assert.equal(duplicate.ok, false);
  const broken = app.validateImportedState({ projects: [{ id: 'p1', name: 'P' }], current: 'p1', collections: [], items: [{ id: 'i1', projectId: 'p1', name: 'X' }], expenses: [{ id: 'e1', projectId: 'missing', itemId: 'i1', amount: 10 }] });
  assert.equal(broken.ok, false);
});


function validBackupState(){
 return {projects:[{id:'p1',name:'Project',rate:10}],current:'p1',collections:[],expenses:[],items:[],contractors:[],payments:[],purchases:[],laborEntries:[],siteLogs:[]};
}
test('backup validation rejects every missing required core array before normalization',()=>{
 const app=createApp();
 for(const key of ['collections','expenses','items','contractors','payments']){
  const backup=validBackupState();delete backup[key];
  assert.equal(app.validateImportedState(backup).ok,false,'missing '+key+' must be rejected');
 }
});
test('schema v2 backup requires all execution ledger arrays',()=>{
 const app=createApp();
 for(const key of ['purchases','laborEntries','siteLogs']){
  const backup=validBackupState();delete backup[key];
  assert.equal(app.validateImportedState(backup,{schemaVersion:2}).ok,false,'missing '+key+' must be rejected');
 }
});
test('legacy schema v1 backup remains compatible when additive ledger arrays are absent',()=>{
 const app=createApp(),backup=validBackupState();
 delete backup.purchases;delete backup.laborEntries;delete backup.siteLogs;
 const result=app.validateImportedState(backup,{schemaVersion:1});
 assert.equal(result.ok,true);
 assert.deepEqual(JSON.parse(JSON.stringify(result.state.purchases)),[]);
});
test('backup validation rejects null rows, missing IDs and nonnumeric financial amounts without normalizing them away',()=>{
 const app=createApp();
 for(const mutate of [
  b=>b.collections.push(null),
  b=>b.items.push({projectId:'p1',name:'No id'}),
  b=>b.collections.push({id:'c1',project:'p1',amount:'120'}),
  b=>b.expenses.push({id:'e1',projectId:'p1',amount:0})
 ]){
  const backup=validBackupState();mutate(backup);
  assert.equal(app.validateImportedState(backup).ok,false);
 }
});
test('backup validation rejects records linked to a different project and invalid current project',()=>{
 const app=createApp(),backup=validBackupState();
 backup.projects.push({id:'p2',name:'Second',rate:10});
 backup.items.push({id:'i2',projectId:'p2',name:'Other project item'});
 backup.expenses.push({id:'e1',projectId:'p1',itemId:'i2',amount:10});
 assert.equal(app.validateImportedState(backup).ok,false);
 const badCurrent=validBackupState();badCurrent.current='missing';
 assert.equal(app.validateImportedState(badCurrent).ok,false);
});
test('backup file type and extension are checked, not inferred from JSON text alone',()=>{
 const app=createApp();
 assert.equal(app.validateBackupFile({name:'backup.json',type:'application/json',size:100}).ok,true);
 assert.equal(app.validateBackupFile({name:'backup.txt',type:'application/json',size:100}).ok,false);
 assert.equal(app.validateBackupFile({name:'backup.json',type:'text/plain',size:100}).ok,false);
});
test('failed backup storage write leaves both live state and stored app data unchanged',async()=>{
 const app=createApp({'execution-manager-v02':JSON.stringify(validBackupState())});
 const beforeState=app.getState(),beforeStored=app.storage.get('execution-manager-v02');
 app.failStorageWrites(true);
 const target={files:[{name:'valid.json',type:'application/json',size:500,text:async()=>JSON.stringify({app:'execution-manager',schemaVersion:2,state:{...validBackupState(),projects:[{id:'p2',name:'New',rate:10}],current:'p2'}})}],value:'selected'};
 await app.elements.get('importData').onchange({target});
 assert.equal(app.getState(),beforeState);
 assert.equal(app.storage.get('execution-manager-v02'),beforeStored);
 assert.equal(target.value,'');
});
test('font scaling covers fixed-pixel declarations and dark mode themes common legacy surfaces',()=>{
 const css=fs.readFileSync(new URL('../styles.css','file://'+__filename),'utf8');
 assert.doesNotMatch(css,/font-size:\s*\d+(?:\.\d+)?px\s*;/);
 for(const selector of ['.surface-inset','.advanced-ledger-group','.mobile-nav','.site-log-row','input:not([type="color"])','textarea']){
  assert.ok(css.includes('html[data-dark="1"] '+selector),'dark selector coverage: '+selector);
 }
});

test('backup validation rejects dangling invoice IDs even outside the supplier-payment category',()=>{
 const app=createApp(),backup=validBackupState();
 backup.payments.push({id:'pay1',projectId:'p1',contractorId:'',type:'materials',purpose:'legacy',invoiceId:'missing',amount:25});
 assert.equal(app.validateImportedState(backup).ok,false);
});
test('backup validation rejects supplier invoice payments without an invoice link and impossible reserved amounts',()=>{
 const app=createApp(),noInvoice=validBackupState();
 noInvoice.payments.push({id:'pay1',projectId:'p1',contractorId:'',type:'materials',purpose:'supplier_invoice_payment',amount:25});
 assert.equal(app.validateImportedState(noInvoice).ok,false);
 const reserved=validBackupState();
 reserved.collections.push({id:'c1',project:'p1',amount:100,rate:10,reserved:150});
 assert.equal(app.validateImportedState(reserved).ok,false);
});


test('detail panels append their ledger sections without re-parsing the panel, so buttons and forms keep their handlers', () => {
  // `el.innerHTML += html` rebuilds every child and silently drops handlers assigned with onclick/onsubmit
  // (the payment form, delete, edit and close buttons). The fake DOM cannot see this, so guard the source.
  assert.doesNotMatch(source, /\.innerHTML\s*\+=/);
  assert.match(source, /d\.insertAdjacentHTML\('beforeend','<div class="advanced-ledger-group"><h3>ملخص الأجرة والسُلف/);
  assert.match(source, /d\.insertAdjacentHTML\('beforeend','<div class="advanced-ledger-group"><h3>فواتير المشتريات المرتبطة/);
});

test('clearing a site-log quantity while editing stores null, so an exported backup still imports', () => {
  const app = createApp();
  const s = app.getState();
  s.siteLogs = [{ id: 'log1', projectId: 'p1', date: '2026-11-20', itemId: '', item: '', quantity: 35, unit: 'م²', crew: '', type: 'execution', note: 'محارة الدور الأول' }];
  // prompts in order: date, note, quantity (cleared), crew, unit
  app.setPromptAnswers(['2026-11-20', 'محارة الدور الأول', '', '', 'م²']);
  app.editTransaction('siteLog', 'log1');
  assert.equal(s.siteLogs[0].quantity, null);
  assert.equal(app.validateDailyLog(s.siteLogs[0]).ok, true);
});

test('olive is the default theme: yellow finance card, olive card stack and dark olive ink', () => {
  const app = createApp();
  const appearance = app.getAppearance();
  assert.equal(appearance.theme, 'olive');
  assert.equal(appearance.sheetSpecialIndex, '0');
  assert.equal(app.cssVars.get('--ink'), '#121606');
  assert.equal(app.cssVars.get('--canvas'), '#c0c3b0');
  assert.equal(app.cssVars.get('--sheet-1'), '#dec956');
  assert.equal(app.cssVars.get('--sheet-1-ink'), '#121606');
  for (let i = 2; i <= 6; i++) assert.equal(app.cssVars.get('--sheet-' + i + '-ink'), '#ffffff', 'olive card ' + i + ' needs light text');
});

test('olive theme migration only touches untouched built-in themes and never the project data', () => {
  const appData = JSON.stringify({ projects: [{ id: 'p1', name: 'Existing project', rate: 12 }], current: 'p1' });
  const builtIn = createApp({ 'execution-manager-v02': appData, 'em:appearance': JSON.stringify({ theme: 'ocean', accent: '#8aa5ad', background: '#e7ecee', appearanceVersion: 2, scale: 105 }) });
  const migrated = JSON.parse(builtIn.storage.get('em:appearance'));
  assert.equal(migrated.theme, 'olive');
  assert.equal(migrated.appearanceVersion, 4);
  assert.equal(migrated.scale, 105);
  assert.equal(builtIn.storage.get('execution-manager-v02'), appData);

  const custom = createApp({ 'em:appearance': JSON.stringify({ theme: 'ocean', accent: '#112233', background: '#445566', appearanceVersion: 2 }) });
  const kept = JSON.parse(custom.storage.get('em:appearance'));
  assert.equal(kept.theme, 'ocean');
  assert.equal(kept.accent, '#112233');
  assert.equal(kept.appearanceVersion, 2);

  const customPalette = createApp({ 'em:appearance': JSON.stringify({ theme: 'sage', accent: '#8cab99', background: '#e7eeea', appearanceVersion: 2, sheetBaseColor: '#202020', sheetSpecialIndex: '4', sheetSpecialColor: '#b45c32' }) });
  const preservedPalette = JSON.parse(customPalette.storage.get('em:appearance'));
  assert.equal(preservedPalette.theme, 'sage');
  assert.equal(preservedPalette.sheetBaseColor, '#202020');
  assert.equal(preservedPalette.sheetSpecialIndex, '4');
  assert.equal(preservedPalette.sheetSpecialColor, '#b45c32');
});

test('quick-entry amounts understand the Arabic decimal mark and prefer the largest number', () => {
  const app = createApp();
  assert.equal(app.parseAmountFromText('دفعت ١٢٫٥ جنيه'), 12.5);
  assert.equal(app.parseAmountFromText('دفعت 2000 لعامل 3 ايام'), 2000);
});

test('editing a site log cannot save an empty description that would make the backup unrestorable', () => {
  const app = createApp();
  const s = app.getState();
  s.siteLogs.push({ id: 'l1', projectId: s.current, date: '2026-01-01', itemId: '', item: '', quantity: null, unit: '', crew: '', type: 'note', note: 'x' });
  app.setPromptAnswers(['2026-01-01', '', '']);
  app.editTransaction('siteLog', 'l1');
  assert.equal(s.siteLogs[0].note, 'x');
});

test('duplicate-movement scan stays fast with many movements', () => {
  const app = createApp();
  const s = app.getState();
  for (let i = 0; i < 20; i++) s.contractors.push({ id: 'c' + i, projectId: s.current, name: 'مقاول ' + i, aliases: [] });
  for (let i = 0; i < 900; i++) s.expenses.push({ id: 'e' + i, projectId: s.current, itemId: '', item: '', type: 'other', amount: i + 1, payee: 'مقاول ' + (i % 20), payeeId: '', date: '2026-01-01' });
  const t0 = Date.now();
  const found = app.withDupCache(() => s.expenses.filter(x => app.findDuplicateMovement({ itemId: x.itemId, item: x.item, type: x.type, amount: x.amount, date: x.date, personId: x.payeeId, personName: x.payee, ignoreId: x.id })).length);
  assert.equal(found, 0);
  assert.ok(Date.now() - t0 < 1500, 'duplicate scan took ' + (Date.now() - t0) + 'ms');
  s.expenses.push({ id: 'dup', projectId: s.current, itemId: '', item: '', type: 'other', amount: 5, payee: 'مقاول 4', payeeId: '', date: '2026-01-01' });
  assert.ok(app.withDupCache(() => app.findDuplicateMovement({ type: 'other', amount: 5, date: '2026-01-01', personName: 'مقاول 4', ignoreId: 'dup' })));
});

test('a labor payment without an approved entry counts as cost, advances do not', () => {
  const app = createApp();
  const s = app.getState();
  const pid = s.current;
  s.contractors.push({ id: 'c1', projectId: pid, name: 'علي' });
  s.payments.push({ id: 'p1', projectId: pid, itemId: '', type: 'labor', contractorId: 'c1', amount: 500, date: '2026-01-01', purpose: 'labor_payment' });
  assert.equal(app.executionCostForProject(), 500);
  s.payments.push({ id: 'p2', projectId: pid, itemId: '', type: 'labor', contractorId: 'c1', amount: 300, date: '2026-01-02', purpose: 'advance' });
  assert.equal(app.executionCostForProject(), 500);
  s.laborEntries.push({ id: 'l1', projectId: pid, contractorId: 'c1', itemId: '', amount: 1000, date: '2026-01-03', status: 'approved' });
  assert.equal(app.executionCostForProject(), 1000);
});

test('renaming an item or contractor keeps legacy name-only records linked', () => {
  const app = createApp();
  const s = app.getState();
  const pid = s.current;
  const item = { id: 'it1', projectId: pid, name: 'محارة', aliases: [] };
  const con = { id: 'c1', projectId: pid, name: 'علي', aliases: [] };
  s.items.push(item); s.contractors.push(con);
  s.expenses.push({ id: 'e1', projectId: pid, itemId: '', item: 'محارة', type: 'materials', amount: 10, payee: 'علي', payeeId: '', date: '2026-01-01' });
  s.purchases.push({ id: 'v1', projectId: pid, itemId: 'it1', item: 'محارة', supplierId: 'c1', supplier: 'علي', amount: 50, date: '2026-01-01' });
  app.relinkRenamedItem(item, 'محارة الدور الأول');
  app.relinkRenamedContractor(con, 'علي حسن');
  assert.equal(s.expenses[0].itemId, 'it1');
  assert.equal(s.expenses[0].payeeId, 'c1');
  assert.equal(s.expenses[0].item, 'محارة الدور الأول');
  assert.equal(s.expenses[0].payee, 'علي حسن');
  assert.equal(s.purchases[0].supplier, 'علي حسن');
  assert.equal(s.purchases[0].item, 'محارة الدور الأول');
});

test('a materials payment to a supplier with open invoices asks before being counted twice', () => {
  const app = createApp();
  const s = app.getState();
  const pid = s.current;
  s.contractors.push({ id: 's1', projectId: pid, name: 'مورد' });
  let asked = 0;
  app.setConfirm(() => { asked++; return false; });
  assert.equal(app.confirmUnlinkedSupplierPayment('s1', 'materials', 100), true);
  assert.equal(asked, 0);
  s.purchases.push({ id: 'v1', projectId: pid, itemId: '', item: '', supplierId: 's1', supplier: 'مورد', amount: 1000, date: '2026-01-01' });
  assert.equal(app.confirmUnlinkedSupplierPayment('s1', 'materials', 100), false);
  assert.equal(asked, 1);
  assert.equal(app.confirmUnlinkedSupplierPayment('s1', 'labor', 100), true);
});
