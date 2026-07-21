import {
  analyzeMembershipPatch,
  analyzeElementPatch,
  analyzeRecordPatch,
  analyzeValuePatch,
  applyMembershipPatch,
  applyRecordPatch,
  buildPublishedHomepageOrder,
  chooseAuthoritativeState
} from '../admin-state-utils.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

Deno.test('A: different product fields safely rebase', () => {
  const result = analyzeRecordPatch({ title: 'Old', description: 'Old' }, { title: 'Server', description: 'Old' }, { description: 'Local' });
  assert(result.canRebase, 'different fields should rebase');
  assert(result.rebasedRecord.title === 'Server' && result.rebasedRecord.description === 'Local', 'both edits must survive');
});

Deno.test('B: same product field requires review', () => {
  const result = analyzeRecordPatch({ title: 'Old' }, { title: 'Server' }, { title: 'Local' });
  assert(!result.canRebase && result.conflictingFields[0] === 'title', 'same-field conflict must stop');
});

Deno.test('C: image and height survive narrow patches', () => {
  const latest = applyRecordPatch({ product: { cutoutImage: 'new.png', originalHeight: '72' } }, 'product', { originalHeight: '78' });
  assert(latest.product.cutoutImage === 'new.png' && latest.product.originalHeight === '78', 'height must preserve image');
});

Deno.test('D: title and description survive narrow patches', () => {
  const latest = applyRecordPatch({ product: { title: 'New title', description: 'Old' } }, 'product', { description: 'New description' });
  assert(latest.product.title === 'New title' && latest.product.description === 'New description', 'description must preserve title');
});

Deno.test('E: different page elements safely merge', () => {
  const result = analyzeElementPatch({ a: { text: 'Old' } }, { a: { text: 'Server' } }, { b: { text: 'Local' } });
  assert(result.canRebase && result.mergedEdits.a.text === 'Server' && result.mergedEdits.b.text === 'Local', 'different elements must survive');
});

Deno.test('F: same page element requires review', () => {
  const result = analyzeElementPatch({ a: { text: 'Old' } }, { a: { text: 'Server' } }, { a: { text: 'Local' } });
  assert(!result.canRebase && result.conflictingKeys[0] === 'a', 'same element must conflict');
});

Deno.test('G: live product state overrides emergency backup', () => {
  const value = chooseAuthoritativeState({ liveLoaded: true, liveValue: { title: 'Server' }, emergencyBackup: { title: 'Old local' } });
  assert(value.title === 'Server', 'live state must win');
});

Deno.test('H: only genuine unsaved changes overlay live page state', () => {
  const stale = chooseAuthoritativeState({ liveLoaded: true, liveValue: { a: 'Server' }, emergencyBackup: { a: 'Old local' } });
  const unsaved = chooseAuthoritativeState({ liveLoaded: true, liveValue: { a: 'Server' }, emergencyBackup: { a: 'Old local' }, unsavedChanges: { b: 'Unsaved' } });
  assert(stale.a === 'Server' && unsaved.a === 'Server' && unsaved.b === 'Unsaved', 'stale backup must not mask live');
});

Deno.test('I: publish order ignores local-only draft', () => {
  const order = buildPublishedHomepageOrder({ 'homepage-category-card-order': { type: 'homepageCategoryOrder', rows: [['server']] } });
  assert(order[0][0] === 'server', 'publisher must use authoritative page edits');
});

Deno.test('J: stale retry remains a conflict until explicitly rebased', () => {
  const base = { title: 'Old', description: 'Old' };
  const latest = { title: 'Server', description: 'Old' };
  const first = analyzeRecordPatch(base, latest, { title: 'Local' });
  const second = analyzeRecordPatch(base, latest, { title: 'Local' });
  assert(!first.canRebase && !second.canRebase, 'repeat save must not silently use a new revision');
});

Deno.test('collection value patches rebase different keys but stop the same key', () => {
  assert(analyzeValuePatch('old', 'old', 'local').canRebase, 'unchanged target key should rebase');
  assert(!analyzeValuePatch('old', 'remote', 'local').canRebase, 'same target key should conflict');
  assert(analyzeValuePatch('old', 'local', 'local').canRebase, 'already-applied value is safe');
});

Deno.test('collection membership patches preserve unrelated set entries', () => {
  const analysis = analyzeMembershipPatch([], ['remote'], 'local', true);
  const values = applyMembershipPatch(['remote'], 'local', true);
  assert(analysis.canRebase, 'unrelated membership changes should rebase');
  assert(values.includes('remote') && values.includes('local'), 'both membership changes must survive');
  assert(!analyzeMembershipPatch([], ['same'], 'same', false).canRebase, 'same membership conflict should stop');
});
