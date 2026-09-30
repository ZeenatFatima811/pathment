/**
 * Migration: 117_certificate_review_questions
 *
 * Let an admin ask the mentor why they graded somebody the way they did, and
 * get an answer back on the record.
 *
 * Today an admin who disagrees with a grade has two options: accept it, or
 * overrule it. Neither is right when the mentor simply knows something the
 * record does not — a mentee who carried the clan through a bad month, work
 * done outside the tracked roadmap, an attendance figure that is wrong. The
 * admin's only lever was a silent override, which throws away the mentor's
 * judgement AND the reason for it.
 *
 * A question is not a decision. The grade stands untouched while the question
 * is open; the admin can still override afterwards, but now with the mentor's
 * reasoning in front of them rather than instead of it.
 *
 * Deliberately NOT a new `stage`. The stage is where the review has got to, and
 * a question does not move it — a questioned row is still mentor_verified, and
 * folding "questioned" into the stage would mean answering it had to guess
 * which stage to restore. The open question is its own fact, joined in.
 *
 * Idempotent: creates the table and indexes only when missing.
 *
 * Run:      node server/scripts/migrations/117_certificate_review_questions.js
 * Rollback: node server/scripts/migrations/117_certificate_review_questions.js --rollback
 */
const sequelize = require('./_db');

const TABLE = 'certificate_review_questions';

async function tableExists(name) {
  const [rows] = await sequelize.query(
    'SELECT 1 FROM information_schema.tables WHERE table_name = :name',
    { replacements: { name } },
  );
  return rows.length > 0;
}

async function up() {
  console.log(`▶ Running migration 117: ${TABLE}`);

  if (await tableExists(TABLE)) {
    console.log(`  ℹ ${TABLE} already exists, skipping create`);
  } else {
    await sequelize.query(`
      CREATE TABLE ${TABLE} (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        template_id     UUID NOT NULL REFERENCES certificate_templates(id) ON DELETE CASCADE,
        mentee_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        /* Denormalised so a question can be routed and scoped without
           re-deriving the clan from a membership that may since have moved. */
        clan_id         UUID REFERENCES clans(id) ON DELETE SET NULL,
        asked_by        UUID NOT NULL REFERENCES users(id),
        asked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        question        TEXT NOT NULL,
        /* The mentor whose decision is being asked about, captured when the
           question is raised: they are who gets notified, and who it stays
           addressed to even if the grade is later changed by somebody else. */
        addressed_to    UUID REFERENCES users(id),
        answered_by     UUID REFERENCES users(id),
        answered_at     TIMESTAMPTZ,
        answer          TEXT,
        status          VARCHAR(20) NOT NULL DEFAULT 'open',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    console.log(`  ✓ Created ${TABLE}`);
  }

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS ${TABLE}_template_mentee ON ${TABLE} (template_id, mentee_id)`);
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS ${TABLE}_template_status ON ${TABLE} (template_id, status)`);
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS ${TABLE}_addressed_open ON ${TABLE} (addressed_to, status)`);

  /**
   * At most one UNANSWERED question per mentee per template. A second "why did
   * you give this?" while the first is still open gives the mentor two things
   * to answer and the admin two threads to read; asking again is what the
   * existing thread is for.
   */
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${TABLE}_one_open
      ON ${TABLE} (template_id, mentee_id) WHERE status = 'open'`);

  console.log('  ✓ Indexes in place');
}

async function down() {
  await sequelize.query(`DROP TABLE IF EXISTS ${TABLE}`);
  console.log(`  ✓ Dropped ${TABLE}`);
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback') ? down() : up())
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
