const sequelize = require('./_db');

async function up() {
  await sequelize.transaction(async transaction => {
    const q = sql => sequelize.query(sql, { transaction });
    await q(`ALTER TABLE clans ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'cohort';
      ALTER TABLE clans ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;
      ALTER TABLE programs ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
      ALTER TABLE programs ADD COLUMN IF NOT EXISTS current_closure_id UUID;
      ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS final_outcome VARCHAR(30);
      ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS final_tier VARCHAR(50);
      ALTER TABLE assigned_tasks ALTER COLUMN enrollment_id DROP NOT NULL;`);
    for (const table of ['blockers', 'delay_events']) {
      await q(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS clan_id UUID REFERENCES clans(id);
        UPDATE ${table} f SET clan_id = t.clan_id FROM assigned_tasks t
        WHERE f.assigned_task_id = t.id AND f.organization_id = t.organization_id AND f.clan_id IS NULL;
        UPDATE ${table} f SET clan_id = m.clan_id FROM (
          SELECT organization_id, user_id, MIN(clan_id::text)::uuid AS clan_id FROM clan_memberships
          WHERE role = 'mentee' AND status IN ('active','paused') GROUP BY organization_id, user_id HAVING COUNT(DISTINCT clan_id) = 1
        ) m WHERE f.mentee_id = m.user_id AND f.organization_id = m.organization_id AND f.clan_id IS NULL;
        CREATE INDEX IF NOT EXISTS ${table}_clan_idx ON ${table}(organization_id, clan_id);`);
    }
    await q(`CREATE TABLE IF NOT EXISTS program_closures (
      id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id),
      program_id UUID NOT NULL REFERENCES programs(id), closed_by UUID NOT NULL REFERENCES users(id),
      closed_at TIMESTAMPTZ NOT NULL, previous_state JSONB NOT NULL,
      reopened_by UUID REFERENCES users(id), reopened_at TIMESTAMPTZ, reopen_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS program_closures_program_idx ON program_closures(organization_id, program_id);
    CREATE TABLE IF NOT EXISTS enrollment_snapshots (
      id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id),
      closure_id UUID NOT NULL REFERENCES program_closures(id), enrollment_id UUID NOT NULL REFERENCES enrollments(id),
      mentee_id UUID NOT NULL REFERENCES users(id), program_id UUID NOT NULL REFERENCES programs(id),
      cohort_id UUID REFERENCES cohorts(id), clan_ids UUID[] NOT NULL DEFAULT '{}',
      outcome VARCHAR(30) NOT NULL CHECK (outcome IN ('certified','completed_uncertified','dropped')),
      tier VARCHAR(50), decision JSONB NOT NULL, performance JSONB NOT NULL, cohort_rank INTEGER,
      previous_enrollment JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(organization_id, closure_id, enrollment_id)
    );
    CREATE INDEX IF NOT EXISTS enrollment_snapshots_program_idx ON enrollment_snapshots(organization_id, program_id, mentee_id);
    CREATE TABLE IF NOT EXISTS standing_clan_requests (
      id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id),
      program_id UUID NOT NULL REFERENCES programs(id), mentor_id UUID NOT NULL REFERENCES users(id),
      name VARCHAR(150) NOT NULL, description TEXT, status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      reviewed_by UUID REFERENCES users(id), reviewed_at TIMESTAMPTZ, decision_note TEXT,
      created_clan_id UUID REFERENCES clans(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(organization_id, created_clan_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS standing_request_pending_unique ON standing_clan_requests(organization_id, mentor_id, program_id) WHERE status='pending';
    CREATE INDEX IF NOT EXISTS standing_request_status_idx ON standing_clan_requests(organization_id, status);`);
    // Existing completed statuses were only labels, not formal closes. Preserve
    // them and let the admin finalize them through the same verified close flow.
    await q(`CREATE INDEX IF NOT EXISTS clans_program_kind_idx ON clans(organization_id, program_id, kind)`);
    await require('./_programHistoryGuards')(sequelize, transaction);
  });
}
module.exports = { up };
if (require.main === module) up().then(() => sequelize.close()).catch(error => { console.error(error.message); process.exitCode = 1; });
