/**
 * Gate program closeout + standing clans to paid plans.
 * Starter / free (monthly & annual 0) → false; Growth/Scale and other paid → true.
 */
async function up({ db = require('./_db') } = {}) {
  await db.transaction(async (transaction) => {
    await db.query(
      `UPDATE plans
       SET features = COALESCE(features, '{}'::jsonb)
         || jsonb_build_object(
              'programCompletionStanding',
              (COALESCE(monthly_price_cents, 0) > 0 OR COALESCE(annual_price_cents, 0) > 0)
            ),
           updated_at = NOW()`,
      { transaction },
    );
  });
}

async function down({ db = require('./_db') } = {}) {
  await db.transaction(async (transaction) => {
    await db.query(
      `UPDATE plans
       SET features = COALESCE(features, '{}'::jsonb) - 'programCompletionStanding',
           updated_at = NOW()`,
      { transaction },
    );
  });
}

module.exports = { up, down };
if (require.main === module) {
  const db = require('./_db');
  (process.argv.includes('--rollback') ? down({ db }) : up({ db }))
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => db.close());
}
