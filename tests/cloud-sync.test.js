const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(new URL('../firebase-sync.js', 'file://' + __filename), 'utf8');

function helpers() {
  const storage = new Map();
  const window = {
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); }
    }
  };
  const document = { readyState: 'loading', addEventListener() {} };
  const context = vm.createContext({ window, document, console, TextEncoder, setTimeout, clearTimeout });
  vm.runInContext(source, context);
  return window.WathiqCloudSync;
}

test('cloud state merge preserves unique local and remote records', () => {
  const cloud = helpers();
  const merged = cloud.mergeStates(
    { projects: [{ id: 'p1', name: 'Local' }, { id: 'p2', name: 'Local only' }], collections: [{ id: 'c1', amount: 10 }] },
    { projects: [{ id: 'p1', name: 'Cloud' }, { id: 'p3', name: 'Cloud only' }], collections: [{ id: 'c2', amount: 20 }] }
  );
  assert.deepEqual(JSON.parse(JSON.stringify(merged.projects)), [
    { id: 'p1', name: 'Cloud' },
    { id: 'p2', name: 'Local only' },
    { id: 'p3', name: 'Cloud only' }
  ]);
  assert.equal(merged.collections.length, 2);
});

test('cloud state merge prefers cloud copy when the same record id exists', () => {
  const cloud = helpers();
  const merged = cloud.mergeStates(
    { expenses: [{ id: 'e1', amount: 100, note: 'local edit' }] },
    { expenses: [{ id: 'e1', amount: 80, note: 'cloud copy' }] }
  );
  assert.equal(merged.expenses.length, 1);
  assert.equal(merged.expenses[0].amount, 80);
  assert.equal(merged.expenses[0].note, 'cloud copy');
});

test('empty starter workspace is not treated as existing local user data', () => {
  const cloud = helpers();
  assert.equal(cloud.hasLocalData({ projects: [{ id: 'p1', name: 'المشروع الأول', rate: 10 }], collections: [], expenses: [] }), false);
});

test('real project records are detected before first cloud connection', () => {
  const cloud = helpers();
  assert.equal(cloud.hasLocalData({ projects: [{ id: 'p1' }], collections: [{ id: 'c1', amount: 250 }] }), true);
});


test('synced device baseline recognizes unchanged local data after refresh', () => {
  const cloud = helpers();
  const state = { projects: [{ id: 'p1', name: 'Project' }], expenses: [{ id: 'e1', amount: 50 }] };
  cloud.saveSyncBaseline(state, 7, 'user-1');
  assert.equal(cloud.hasLocalChangesSinceSync(state, 'user-1'), false);
  assert.equal(cloud.hasLocalChangesSinceSync({ expenses: state.expenses, projects: state.projects }, 'user-1'), false);
  assert.equal(cloud.loadSyncBaseline('user-1').revision, 7);
});

test('synced device baseline detects offline local changes but ignores other accounts', () => {
  const cloud = helpers();
  const synced = { projects: [{ id: 'p1', name: 'Project' }], expenses: [] };
  cloud.saveSyncBaseline(synced, 3, 'user-1');
  assert.equal(cloud.hasLocalChangesSinceSync({ projects: [{ id: 'p1', name: 'Edited locally' }], expenses: [] }, 'user-1'), true);
  assert.equal(cloud.hasLocalChangesSinceSync(synced, 'user-2'), false);
});

test('sync fingerprint ignores object key order while preserving record array order', () => {
  const cloud = helpers();
  assert.equal(cloud.stateFingerprint({ a: 1, b: { c: 2, d: 3 } }), cloud.stateFingerprint({ b: { d: 3, c: 2 }, a: 1 }));
  assert.notEqual(cloud.stateFingerprint({ rows: [{ id: 'a' }, { id: 'b' }] }), cloud.stateFingerprint({ rows: [{ id: 'b' }, { id: 'a' }] }));
});
