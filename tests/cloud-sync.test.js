const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(new URL('../firebase-sync.js', 'file://' + __filename), 'utf8');

function helpers() {
  const window = {};
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
