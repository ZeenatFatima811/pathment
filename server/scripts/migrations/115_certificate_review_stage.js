/**
 * Migration: 115_certificate_review_stage
 *
 * Give a certificate review an explicit stage, so an admin can tell what they
 * have approved from what a mentor merely checked.
 *
 * `certificate_verifications.status` has only two values, 'pending' and
 * 'verified', and BOTH a mentor's sign-off and an admin's write 'verified'.
 * The roster therefore rendered the same "Signed off" badge either way. An
 * admin who had just worked through four hundred people could not see which
 * ones were their own decision — the one question the screen exists to answer.
 *
 * The stage is the furthest point a row has reached:
 *
 *   ai_evaluated    the AI graded it; no human has been asked yet
 *   awaiting_mentor sent to the clans, nobody has signed off
 *   mentor_verified a mentor signed off
 *   admin_approved  an admin signed off the row, or released its clan
 *
 * `status` is kept and kept in sync ('verified' for the last two, 'pending'
 * otherwise) so every existing query keeps working; the stage is the richer
 * fact layered on top, not a replacement.
 *
 * The backfill is derived, not guessed. `verified_by` is populated on every
 * verified row on production (395 of 395, zero nulls), so who signed off is a
 * recorded fact for the whole history rather than something to infer from a
 * timestamp window. Admin is read the way authzService reads it: the primary
 * role, or 'admin' present in `capabilities`.
 *
 * A clan the admin has released counts as approved even where the row itself
 * was signed off by a mentor — releasing the clan IS the admin's approval, and
 * that is the state the roster must show.
 *
 * Idempotent: the column is added only if missing, and each row is moved only
 * from the value the previous rule would have left.
 *
 * Run:      node server/scripts/migrations/115_certificate_review_stage.js
 * Preview:  node server/scripts/migrations/115_certificate_review_stage.js --dry-run
 */
let sequelize = require('./_db');

/** Admin exactly as authzService reads it: primary role or an elevated capability. */
const IS_ADMIN = `(u.role = 'admin' OR 'admin' = ANY(COALESCE(u.capabilities, ARRAY[]::varchar[])))`;

/**
 * What each row's stage SHOULD be, from facts already in the database. Used for
 * the preview and for the update, so the two can never disagree.
 */
const TARGET = `
  SELECT cv.id,
         cv.status,
         cv.stage AS current_stage,
         CASE
           WHEN cv.status <> 'verified' THEN 'awaiting_mentor'
           WHEN cca.clan_id IS NOT NULL THEN 'admin_approved'
           WHEN u.id IS NULL           THEN 'mentor_verified'
           WHEN ${IS_ADMIN}            THEN 'admin_approved'
           ELSE 'mentor_verified'
         END AS target_stage
    FROM certificate_verifications cv
    LEFT JOIN users u ON u.id = cv.verified_by
    LEFT JOIN certificate_clan_approvals cca
           ON cca.template_id = cv.template_id AND cca.clan_id = cv.clan_id`;

async function columnExists(table, column) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = :table AND column_name = :column`,
    { replacements: { table, column } },
  );
  return rows.length > 0;
}

async function up({ dryRun = false } = {}) {
  const DRY_RUN = dryRun;
  console.log(DRY_RUN ? '=== DRY RUN — nothing will be written ===\n' : '=== APPLYING ===\n');

  const hasStage = await columnExists('certificate_verifications', 'stage');

  if (!hasStage) {
    console.log("Adding certificate_verifications.stage (default 'awaiting_mentor')");
    if (!DRY_RUN) {
      await sequelize.query(`
        ALTER TABLE certificate_verifications
          ADD COLUMN stage VARCHAR(20) NOT NULL DEFAULT 'awaiting_mentor'`);
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS certificate_verifications_stage
          ON certificate_verifications (template_id, stage)`);
    }
  } else {
    console.log('Column certificate_verifications.stage already present — backfilling only');
  }

  // A dry run before the column exists cannot read cv.stage, so the preview
  // reports the target for every row rather than only the ones that change.
  const preview = hasStage
    ? `SELECT status, current_stage, target_stage, COUNT(*)::int AS rows
         FROM (${TARGET}) t
        WHERE current_stage IS DISTINCT FROM target_stage
        GROUP BY 1,2,3 ORDER BY rows DESC`
    : `SELECT cv.status,
              '(column absent)' AS current_stage,
              CASE
                WHEN cv.status <> 'verified' THEN 'awaiting_mentor'
                WHEN cca.clan_id IS NOT NULL THEN 'admin_approved'
                WHEN u.id IS NULL           THEN 'mentor_verified'
                WHEN ${IS_ADMIN}            THEN 'admin_approved'
                ELSE 'mentor_verified'
              END AS target_stage,
              COUNT(*)::int AS rows
         FROM certificate_verifications cv
         LEFT JOIN users u ON u.id = cv.verified_by
         LEFT JOIN certificate_clan_approvals cca
                ON cca.template_id = cv.template_id AND cca.clan_id = cv.clan_id
        GROUP BY 1,2,3 ORDER BY rows DESC`;

  const [rows] = await sequelize.query(preview);
  console.log('\nStage assignment:');
  console.table(rows);

  const total = rows.reduce((sum, r) => sum + Number(r.rows), 0);
  if (!total) {
    console.log('\nNothing to change. Already migrated.');
    return;
  }

  if (DRY_RUN) {
    console.log(`\nWould set the stage on ${total} row(s). Re-run without --dry-run to apply.`);
    return;
  }

  const [, meta] = await sequelize.query(`
    UPDATE certificate_verifications cv
       SET stage = t.target_stage,
           updated_at = NOW()
      FROM (${TARGET}) t
     WHERE t.id = cv.id
       AND cv.stage IS DISTINCT FROM t.target_stage`);
  console.log(`\nUpdated ${meta?.rowCount ?? total} row(s).`);

  const [after] = await sequelize.query(`
    SELECT stage, status, COUNT(*)::int AS rows
      FROM certificate_verifications GROUP BY 1,2 ORDER BY rows DESC`);
  console.log('\nFinal distribution:');
  console.table(after);
}

/**
 * Deliberately not reversible. Dropping `stage` would throw away which reviews an
 * admin approved and which a mentor merely checked — the distinction this exists
 * to record, and one that cannot be recovered from `status` afterwards.
 */
async function down() {
  throw new Error('Dropping certificate_verifications.stage would lose who approved each review; restore a reviewed backup instead');
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback')
    ? down()
    : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
