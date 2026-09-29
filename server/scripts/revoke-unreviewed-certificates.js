/**
 * Tool (NOT a migration): take back the certificates that were issued past an
 * open review round.
 *
 * This deliberately does not live in scripts/migrations/. `npm run db:migrate`
 * requires and runs every numbered file it has not recorded, skipping only names
 * matching /drop/i — so as a migration this would have silently revoked
 * certificates on every deploy, for any template that happened to have
 * unreviewed issuance. A destructive data operation belongs behind a human, not
 * in the deploy path.
 *
 * Prefer the admin screen: Certificates → history → "Revoke Unreviewed" calls
 * DELETE /api/certificates/templates/:id/unreviewed-issued, which uses the same
 * predicate, previews the count first, and writes the same audit record. This
 * script exists for bulk or offline use across every template at once.
 *
 * On 2026-09-29 one press of Issue sent 410 participation certificates for
 * "Fellowship 2026 summer". 215 had been signed off. 188 had not, and a further
 * 7 went out the same way on a `test` template — 195 credentials awarded on the
 * AI's provisional grade, with no human having confirmed any of them. The three
 * defects behind it are fixed in certificateVerificationService/
 * certificateService and covered by tests/certificates/unreviewed-issue-guard.
 *
 * Scope, computed at run time rather than from a hardcoded list:
 *
 *   the template HAS a review round (at least one certificate_verifications row)
 *   AND this mentee's row is absent, or its status is not 'verified'
 *
 * The round condition matters. A template that never had a round is issued from
 * directly, on purpose — 87 certificates on the `participation certificate`
 * template are exactly that, and they are NOT touched here.
 *
 * WHAT THIS DESTROYS. `certificate_instances` is not paranoid, so there is no
 * soft delete and no `revoked_at`: the row goes. `certificate_number` is unique
 * per row, so a re-issued certificate gets a NEW number and the old public link
 * stops resolving for good. The recipients were emailed when it was issued and
 * are NOT told it has been taken back — the platform has no revocation notice.
 * Everything removed is written to audit_logs first, with the full row in
 * `old_values`, so the record survives the deletion.
 *
 * After this runs, those mentees' review rows are still 'pending', so they are
 * in their mentors' queues; and with the instance gone, a mentor who wants to
 * change the grade is no longer blocked by "already issued". Re-issue happens
 * through the normal screen once the grades are signed off.
 *
 * Idempotent: the instances are gone after the first run, so a second finds none.
 *
 * Run:      node server/scripts/revoke-unreviewed-certificates.js
 * Preview:  node server/scripts/revoke-unreviewed-certificates.js --dry-run
 * One template only: ... --template="Fellowship 2026 summer"
 */
const sequelize = require('./migrations/_db');

const DRY_RUN = process.argv.includes('--dry-run');
const templateArg = (process.argv.find((a) => a.startsWith('--template=')) || '').split('=').slice(1).join('=');

/**
 * The certificates in scope. `EXISTS` is the round test; the LEFT JOIN plus the
 * status test is the "nobody signed this off" test. Parenthesised, because
 * `WHERE a OR b AND c` binds AND tighter and would quietly apply to one side.
 */
const SELECT_TARGETS = `
  SELECT ci.id,
         ci.certificate_number,
         ci.tier,
         ci.created_at            AS issued_at,
         ci.template_id,
         ci.mentee_id,
         t.name                   AS template,
         u.email                  AS mentee_email,
         TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS mentee_name,
         COALESCE(c.name,'(no clan)') AS clan,
         COALESCE(cv.status,'(no review row)') AS review_status,
         cv.final_tier            AS grade_on_row,
         ci.organization_id
    FROM certificate_instances ci
    JOIN certificate_templates t ON t.id = ci.template_id
    JOIN users u ON u.id = ci.mentee_id
    LEFT JOIN certificate_verifications cv
           ON cv.template_id = ci.template_id AND cv.mentee_id = ci.mentee_id
    LEFT JOIN clans c ON c.id = cv.clan_id
   WHERE EXISTS (SELECT 1 FROM certificate_verifications v WHERE v.template_id = ci.template_id)
     AND (cv.id IS NULL OR cv.status <> 'verified')
     {{TEMPLATE_FILTER}}`;

const STILL_UNREVIEWED = `
  SELECT COUNT(*)::int AS still_unreviewed
    FROM certificate_instances ci
    LEFT JOIN certificate_verifications cv
           ON cv.template_id = ci.template_id AND cv.mentee_id = ci.mentee_id
   WHERE EXISTS (SELECT 1 FROM certificate_verifications v WHERE v.template_id = ci.template_id)
     AND (cv.id IS NULL OR cv.status <> 'verified')`;

const AUDIT_INSERT = `
  INSERT INTO audit_logs
         (id, organization_id, action, entity_type, entity_id, old_values, created_at, updated_at)
  VALUES (gen_random_uuid(), :organizationId, 'certificate.revoked_unreviewed',
          'CertificateInstance', NULL, CAST(:payload AS jsonb), NOW(), NOW())`;

async function run() {
  console.log(DRY_RUN
    ? '=== DRY RUN — nothing will be removed ===\n'
    : '=== APPLYING — certificate rows will be removed ===\n');

  const sql = SELECT_TARGETS.replace('{{TEMPLATE_FILTER}}', templateArg ? 'AND t.name = :template' : '');
  const [targets] = await sequelize.query(sql, {
    replacements: templateArg ? { template: templateArg } : {},
  });

  if (!targets.length) {
    console.log('Nothing to revoke. Either this has already run, or no certificate');
    console.log('bypassed an open review round.');
    return;
  }

  const tally = (rows, key) => {
    const out = new Map();
    for (const row of rows) out.set(row[key], (out.get(row[key]) || 0) + 1);
    return [...out.entries()].sort((a, b) => b[1] - a[1]);
  };

  console.log('To revoke, by template and review state:');
  console.table(targets.reduce((acc, row) => {
    const key = `${row.template} · ${row.review_status}`;
    const found = acc.find((r) => r.template_and_state === key);
    if (found) found.rows += 1; else acc.push({ template_and_state: key, rows: 1 });
    return acc;
  }, []));

  console.log('\nBy clan — who has to review these again:');
  console.table(tally(targets, 'clan').map(([clan, rows]) => ({ clan, rows })));

  console.log(`\nTotal: ${targets.length} certificate(s).`);

  if (DRY_RUN) {
    console.log('\nRe-run without --dry-run to apply. Full list as JSON, so it can also be');
    console.log('kept outside the database:\n');
    console.log(JSON.stringify(targets, null, 1));
    return;
  }

  // Record before removing: these rows cannot be recovered from the table
  // afterwards, so the audit entry IS the record. Same transaction, so a failure
  // to write the record is a failure to revoke.
  await sequelize.transaction(async (transaction) => {
    const byOrg = new Map();
    for (const row of targets) {
      if (!byOrg.has(row.organization_id)) byOrg.set(row.organization_id, []);
      byOrg.get(row.organization_id).push(row);
    }

    for (const [organizationId, rows] of byOrg.entries()) {
      await sequelize.query(AUDIT_INSERT, {
        replacements: {
          organizationId,
          payload: JSON.stringify({
            reason: 'Issued past an open review round; revoke-unreviewed-certificates.js',
            revokedAt: new Date().toISOString(),
            count: rows.length,
            certificates: rows,
          }),
        },
        transaction,
      });
    }
    console.log(`\nRecorded ${targets.length} certificate(s) in audit_logs under`);
    console.log("action 'certificate.revoked_unreviewed'.");

    const [, meta] = await sequelize.query(
      'DELETE FROM certificate_instances WHERE id IN (:ids)',
      { replacements: { ids: targets.map((r) => r.id) }, transaction },
    );
    console.log(`Revoked ${meta?.rowCount ?? targets.length} certificate(s).`);
  });

  const [remaining] = await sequelize.query(STILL_UNREVIEWED);
  console.log(`\nStill issued without a sign-off: ${remaining[0].still_unreviewed}`);
  console.log(templateArg
    ? '(other templates were left alone because --template was given)'
    : '(expected 0)');
}

run()
  .then(() => sequelize.close())
  .then(() => process.exit(0))
  .catch((error) => { console.error('Migration failed:', error); process.exit(1); });
