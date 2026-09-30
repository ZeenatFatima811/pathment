/**
 * Report: certificates that were issued without a signed-off grade.
 *
 * On 2026-09-29 one press of Issue sent 410 participation certificates for
 * "Fellowship 2026 summer". 215 had been signed off. 195 had not: 193 sat on a
 * pending review row carrying the AI's provisional grade, and 2 had no review
 * row at all. The three defects behind it are fixed in
 * certificateVerificationService/certificateService and covered by
 * tests/certificates/unreviewed-issue-guard.test.js.
 *
 * This is the clean-up side, and it is READ-ONLY on purpose.
 *
 * Those 195 people have already been notified and can already see their
 * certificate, so silently deleting it is the one option with a cost to
 * somebody outside the system. It is also not necessary: their review rows are
 * still 'pending', so they ALREADY appear in their mentors' review queues. A
 * mentor confirming the same tier signs off without complaint; a mentor who
 * disagrees hits "This certificate has already been issued. Revoke it before
 * changing the decision", which is exactly the right prompt.
 *
 * So the recovery is: mentors review these retrospectively, and only the ones a
 * mentor actually disagrees with get revoked. This report tells you who they
 * are and which clans have to do the work.
 *
 * Run: node server/scripts/reports/unreviewed-issued-certificates.js
 */
const sequelize = require('../migrations/_db');

// Split so a caller can add its own joins, which have to come before WHERE.
const SOURCE = `
  FROM certificate_instances ci
  JOIN certificate_templates t ON t.id = ci.template_id
  LEFT JOIN certificate_verifications cv
         ON cv.template_id = ci.template_id AND cv.mentee_id = ci.mentee_id`;
const ONLY_UNREVIEWED = `WHERE (cv.id IS NULL OR cv.status <> 'verified')`;
const UNREVIEWED = `${SOURCE} ${ONLY_UNREVIEWED}`;

async function report() {
  const q = async (label, sql) => {
    const [rows] = await sequelize.query(sql);
    console.log(`\n== ${label} ==`);
    if (!rows.length) console.log('  (none)');
    else console.table(rows);
    return rows;
  };
  // Hundreds of names are a file, not a terminal — fetch without printing.
  const qQuiet = async (label, sql) => {
    const [rows] = await sequelize.query(sql);
    console.log(`\n== ${label} ==\n  ${rows.length} row(s); pass --full to print them.`);
    if (process.argv.includes('--full')) console.table(rows);
    return rows;
  };

  await q('Scale of it, by template', `
    SELECT t.name AS template,
           ci.tier,
           COUNT(*)::int AS issued_unreviewed,
           MIN(ci.created_at) AS first_issued,
           MAX(ci.created_at) AS last_issued
      ${UNREVIEWED}
     GROUP BY 1,2 ORDER BY issued_unreviewed DESC`);

  await q('Which review state they are in', `
    SELECT COALESCE(cv.status, '(no review row)') AS review_state,
           COALESCE(cv.stage, '(no review row)')  AS stage,
           COALESCE(cv.final_tier, '(none)')      AS grade_on_row,
           ci.tier                                AS grade_issued,
           COUNT(*)::int                          AS people
      ${UNREVIEWED}
     GROUP BY 1,2,3,4 ORDER BY people DESC`);

  await q('The work, by clan — who has to review what', `
    SELECT COALESCE(c.name, '(no clan)') AS clan,
           COALESCE(lead.email, '(no lead mentor)') AS lead_mentor,
           COUNT(*)::int AS to_review
      ${SOURCE}
      LEFT JOIN clans c ON c.id = cv.clan_id
      LEFT JOIN users lead ON lead.id = c.lead_mentor_id
      ${ONLY_UNREVIEWED}
     GROUP BY 1,2 ORDER BY to_review DESC`);

  await q('Anyone whose issued grade already disagrees with their pending row', `
    SELECT u.email, ci.tier AS issued, cv.final_tier AS on_row, cv.decision
      ${SOURCE}
      JOIN users u ON u.id = ci.mentee_id
     WHERE cv.id IS NOT NULL
       AND cv.status <> 'verified'
       AND (cv.decision = 'no_certificate'
            OR (cv.final_tier IS NOT NULL AND cv.final_tier <> ci.tier))
     ORDER BY u.email`);

  // Only the templates with an open round are the defect, so only those are the
  // work. A template that was never reviewed was issued from directly, on
  // purpose, and its certificates are not in question.
  const people = await qQuiet('The work: bypassed certificates on templates with an open round', `
    SELECT u.email, u.first_name || ' ' || u.last_name AS name,
           COALESCE(c.name, '(no clan)') AS clan,
           t.name AS template, ci.tier AS issued_tier, ci.certificate_number
      ${SOURCE}
      JOIN users u ON u.id = ci.mentee_id
      LEFT JOIN clans c ON c.id = cv.clan_id
      ${ONLY_UNREVIEWED}
       AND EXISTS (SELECT 1 FROM certificate_verifications v WHERE v.template_id = ci.template_id)
     ORDER BY template, clan, u.email`);

  await q('Which of these were actually a bypass, and which a direct issue', `
    SELECT t.name AS template,
           (SELECT COUNT(*) FROM certificate_verifications v WHERE v.template_id = t.id)::int AS round_rows,
           CASE WHEN EXISTS (SELECT 1 FROM certificate_verifications v WHERE v.template_id = t.id)
                THEN 'round open — issuing unreviewed was the defect'
                ELSE 'no round ever — direct issue, legitimate' END AS verdict,
           COUNT(*)::int AS certificates
      ${UNREVIEWED}
     GROUP BY 1,2,3 ORDER BY certificates DESC`);

  await q('The two populations, which need different handling', `
    SELECT CASE WHEN cv.id IS NULL
                THEN 'no review row at all'
                ELSE 'pending row, carrying the AI grade' END AS population,
           COUNT(*)::int AS people,
           COUNT(DISTINCT ci.template_id)::int AS templates
      ${UNREVIEWED}
     GROUP BY 1 ORDER BY people DESC`);

  console.log(`\n${people.length} certificate(s) bypassed an open review round. Nothing has been changed.`);
  console.log('Their review rows are still pending, so they are already in their mentors\'');
  console.log('queues; revoke only the ones a mentor actually disagrees with.');
  console.log('\nCertificates from a template that never had a round are NOT counted here:');
  console.log('issuing directly from an unreviewed template is a real workflow, not the defect.');
}

report()
  .then(() => sequelize.close())
  .then(() => process.exit(0))
  .catch((error) => { console.error('Report failed:', error); process.exit(1); });
