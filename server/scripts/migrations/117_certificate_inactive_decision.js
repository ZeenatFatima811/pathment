/** Explicit inactive classification drops an enrollment on formal program close. */
async function up({ db = require('./_db') } = {}) {
  await db.transaction(async transaction => {
    await db.query(`ALTER TABLE certificate_verifications DROP CONSTRAINT IF EXISTS certificate_review_decision_valid`, { transaction });
    await db.query(`ALTER TABLE certificate_verifications ADD CONSTRAINT certificate_review_decision_valid CHECK (
      decision IN ('award', 'no_certificate', 'inactive', 'undecided') AND
      ai_decision IN ('award', 'no_certificate', 'undecided') AND
      (decision NOT IN ('no_certificate', 'inactive') OR final_tier IS NULL) AND
      (ai_decision <> 'no_certificate' OR ai_tier IS NULL)
    )`, { transaction });
  });
}
async function down() { throw new Error('No automatic rollback: inactive certificate decisions may already exist.'); }
module.exports = { up, down };
if (require.main === module) {
  const db = require('./_db');
  (process.argv.includes('--rollback') ? down() : up({ db }))
    .catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
}
