const sequelize = require('./_db');

/**
 * Program closeout + standing clans (slim schema).
 * - Close marker: programs.closed_at only (no closure/snapshot history tables).
 * - Standing work: assigned_tasks.assignment_kind + nullable enrollment_id when standing.
 */
async function up() {
  await sequelize.transaction(async transaction => {
    const q = sql => sequelize.query(sql, { transaction });

    await q(`ALTER TABLE clans ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'cohort';
      ALTER TABLE clans ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;
      ALTER TABLE programs ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;`);

    // Standing vs cohort assignment: enrollment required for cohort, optional for standing.
    await q(`ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS assignment_kind VARCHAR(20) NOT NULL DEFAULT 'cohort';
      UPDATE assigned_tasks a SET assignment_kind = 'standing'
        FROM clans c WHERE a.clan_id = c.id AND c.kind = 'standing' AND a.assignment_kind IS DISTINCT FROM 'standing';
      ALTER TABLE assigned_tasks ALTER COLUMN enrollment_id DROP NOT NULL;
      ALTER TABLE assigned_tasks DROP CONSTRAINT IF EXISTS assigned_tasks_assignment_kind_check;
      ALTER TABLE assigned_tasks ADD CONSTRAINT assigned_tasks_assignment_kind_check
        CHECK (assignment_kind IN ('cohort', 'standing'));
      ALTER TABLE assigned_tasks DROP CONSTRAINT IF EXISTS assigned_tasks_assignment_kind_enrollment;
      ALTER TABLE assigned_tasks ADD CONSTRAINT assigned_tasks_assignment_kind_enrollment
        CHECK (assignment_kind = 'standing' OR enrollment_id IS NOT NULL);`);

    for (const table of ['blockers', 'delay_events']) {
      await q(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS clan_id UUID REFERENCES clans(id);
        UPDATE ${table} f SET clan_id = t.clan_id FROM assigned_tasks t
        WHERE f.assigned_task_id = t.id AND f.organization_id = t.organization_id AND f.clan_id IS NULL;
        UPDATE ${table} f SET clan_id = m.clan_id FROM (
          SELECT organization_id, user_id, MIN(clan_id::text)::uuid AS clan_id FROM clan_memberships
          WHERE role = 'mentee' AND status IN ('active','paused') GROUP BY organization_id, user_id HAVING COUNT(DISTINCT clan_id) = 1
        ) m WHERE f.mentee_id = m.user_id AND f.organization_id = m.organization_id AND f.clan_id IS NULL;`);
    }

    // Only index that enforces a real invariant: one pending standing request per mentor+program.
    await q(`CREATE TABLE IF NOT EXISTS standing_clan_requests (
      id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id),
      program_id UUID NOT NULL REFERENCES programs(id), mentor_id UUID NOT NULL REFERENCES users(id),
      name VARCHAR(150) NOT NULL, description TEXT, status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      reviewed_by UUID REFERENCES users(id), reviewed_at TIMESTAMPTZ, decision_note TEXT,
      created_clan_id UUID REFERENCES clans(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(organization_id, created_clan_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS standing_request_pending_unique ON standing_clan_requests(organization_id, mentor_id, program_id) WHERE status='pending';`);
  });
}

module.exports = { up };
if (require.main === module) up().then(() => sequelize.close()).catch(error => { console.error(error.message); process.exitCode = 1; });
