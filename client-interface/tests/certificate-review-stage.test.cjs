const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Run this isolated TypeScript utility on the project's Node 20 runtime.
const source = fs.readFileSync(path.join(__dirname, '../lib/utils/certificate-review-stage.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const loaded = { exports: {} };
new Function('exports', 'module', compiled.outputText)(loaded.exports, loaded);
const { reviewStage, stageMeta, stageOptions, isClearedToSend, reviewActionLabels } = loaded.exports;

test('each stage has its own label — the whole point of the change', () => {
  const labels = stageOptions().map((s) => s.label);
  assert.deepEqual(labels, ['AI evaluated', 'Awaiting mentor', 'Mentor verified', 'Approved by admin']);
  assert.equal(new Set(labels).size, 4, 'two stages sharing a label is the bug being fixed');
});

test("a mentor's check and an admin's approval never read the same", () => {
  assert.notEqual(
    reviewStage({ stage: 'mentor_verified' }).label,
    reviewStage({ stage: 'admin_approved' }).label,
  );
});

test('the admin approval is the only stage cleared to send', () => {
  assert.equal(isClearedToSend({ stage: 'admin_approved' }), true);
  for (const stage of ['ai_evaluated', 'awaiting_mentor', 'mentor_verified']) {
    assert.equal(isClearedToSend({ stage }), false, `${stage} must not be sendable`);
  }
});

test('falls back to status when the API has not been deployed yet', () => {
  // The client and the API ship separately, so a roster from an older build
  // carries no stage at all. It must still render something truthful.
  assert.equal(reviewStage({ status: 'verified' }).stage, 'mentor_verified');
  assert.equal(reviewStage({ status: 'pending' }).stage, 'awaiting_mentor');
  assert.equal(reviewStage({}).stage, 'awaiting_mentor');
});

test('an unknown stage falls back rather than rendering an empty badge', () => {
  assert.equal(reviewStage({ stage: 'signed_off', status: 'verified' }).stage, 'mentor_verified');
  assert.equal(reviewStage({ stage: '', status: 'pending' }).stage, 'awaiting_mentor');
  assert.equal(reviewStage({ stage: null, status: 'verified' }).stage, 'mentor_verified');
});

test('an explicit stage wins over status', () => {
  // A row an admin approved is 'verified' too; the stage is what distinguishes it.
  assert.equal(reviewStage({ stage: 'admin_approved', status: 'verified' }).stage, 'admin_approved');
});

test('tones progress from waiting to done so the badge colour tracks the stage', () => {
  assert.deepEqual(stageOptions().map((s) => s.tone), ['neutral', 'waiting', 'progress', 'done']);
});

test('every stage explains itself in plain English', () => {
  for (const meta of stageOptions()) {
    assert.ok(meta.description.length > 20, `${meta.stage} needs a real description`);
    assert.equal(stageMeta(meta.stage).label, meta.label);
  }
});

test('an admin approves; a mentor signs off — never the same verb', () => {
  const admin = reviewActionLabels(true);
  const mentor = reviewActionLabels(false);

  // The button told an admin approving 400 people that they were signing off,
  // which is the mentors' step and not what the server records for them.
  assert.match(admin.confirm, /approve/i);
  assert.match(admin.confirmChanged, /approve/i);
  assert.doesNotMatch(admin.confirm, /sign off/i);
  assert.doesNotMatch(admin.confirmChanged, /sign off/i);

  assert.match(mentor.confirm, /sign off/i);
  assert.match(mentor.confirmChanged, /sign off/i);
  assert.doesNotMatch(mentor.confirm, /approve/i);
});

test('the toast matches the button, so the verb never switches mid-action', () => {
  for (const isAdmin of [true, false]) {
    const l = reviewActionLabels(isAdmin);
    const verb = isAdmin ? /approve/i : /sign(ed)? off/i;
    for (const text of [l.confirm, l.confirmChanged, l.done, l.doneChanged]) {
      assert.match(text, verb, `"${text}" should use the ${isAdmin ? 'admin' : 'mentor'} verb`);
    }
  }
});
