/**
 * Migration: 118_certificate_change_requests
 *
 * Turn the admin→mentor question thread into a two-way request thread.
 *
 * Once an admin has approved a grade the mentor may no longer edit it — that is
 * the point of approving. But "you cannot change this" with no way forward is a
 * dead end: the mentor is the person who knows the mentee, and they are exactly
 * who notices a mistake after the fact. So they ask, and the admin decides.
 *
 * A change request is the question thread pointed the other way: somebody
 * raises something about one grade, the other side answers, it closes. Rather
 * than a second table with its own indexes, serializer, list endpoint and UI,
 * `certificate_review_questions` gains a `kind`:
 *
 *   question        admin → mentor   "why did you give this grade?"
 *   change_request  mentor → admin   "may I change it to X, because…"
 *   report_request  mentor → admin   "please send me the certificate report"
 *
 * A change request carries what is being asked for (`requested_tier`,
 * `requested_decision`) so the admin can approve it in one press, and
 * `resolution` records which way they went — `answer` holds their note either
 * way. A report request is about a clan rather than one mentee, so `mentee_id`
 * becomes nullable.
 *
 * Idempotent: every column and index is added only when missing.
 *
 * Run:      node server/scripts/migrations/118_certificate_change_requests.js
 * Rollback: node server/scripts/migrations/118_certificate_change_requests.js --rollback
 */
const sequelize = require('./_db');

const TABLE = 'certificate_review_questions';

const COLUMNS = [
  ['kind', "VARCHAR(20) NOT NULL DEFAULT 'question'"],
  ['requested_tier', 'VARCHAR(50)'],
  ['requested_decision', 'VARCHAR(20)'],
  ['resolution', 'VARCHAR(20)'],
];

async function columnExists(column) {
  const [rows] = await sequelize.query(
    'SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c',
    { replacements: { t: TABLE, c: column } },
  );
  return rows.length > 0;
}

async function up() {
  console.log('▶ Running migration 118: certificate change requests');

  for (const [name, spec] of COLUMNS) {
    if (await columnExists(name)) {
      console.log(`  ℹ ${TABLE}.${name} exists, skipping`);
    } else {
      await sequelize.query(`ALTER TABLE ${TABLE} ADD COLUMN ${name} ${spec}`);
      console.log(`  ✓ Added ${TABLE}.${name}`);
    }
  }

  // A report request belongs to a clan, not to one mentee.
  await sequelize.query(`ALTER TABLE ${TABLE} ALTER COLUMN mentee_id DROP NOT NULL`);
  console.log('  ✓ mentee_id is nullable');

  /**
   * One open thread per mentee PER KIND. The old index allowed a single open
   * row per mentee outright, which would have made an admin's question and the
   * mentor's change request on the same person mutually exclusive.
   */
  await sequelize.query(`DROP INDEX IF EXISTS ${TABLE}_one_open`);
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${TABLE}_one_open_per_kind
      ON ${TABLE} (template_id, mentee_id, kind)
     WHERE status = 'open' AND mentee_id IS NOT NULL`);

  // The mentor's outbox and the admin's inbox are both "open rows of this kind".
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS ${TABLE}_kind_status
      ON ${TABLE} (template_id, kind, status)`);

  console.log('  ✓ Indexes in place');
}

async function down() {
  await sequelize.query(`DROP INDEX IF EXISTS ${TABLE}_one_open_per_kind`);
  await sequelize.query(`DROP INDEX IF EXISTS ${TABLE}_kind_status`);
  for (const [name] of COLUMNS) {
    await sequelize.query(`ALTER TABLE ${TABLE} DROP COLUMN IF EXISTS ${name}`);
  }
  console.log('  ✓ Reverted 118');
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback') ? down() : up())
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
