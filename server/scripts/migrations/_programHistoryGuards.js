// Database enforcement also covers raw SQL and the race between an in-flight
// write and close. A work write holds a shared clan lock until it commits;
// close takes the exclusive clan lock before reading the final evidence.
module.exports = async function install(sequelize, transaction) {
  const q = sql => sequelize.query(sql, { transaction });
  await q(`CREATE OR REPLACE FUNCTION pathment_check_history(tbl TEXT, r JSONB) RETURNS VOID AS $$
    DECLARE cid UUID; pid UUID; parent JSONB; clan_kind TEXT; frozen TIMESTAMPTZ; program_status TEXT;
    BEGIN
      IF r IS NULL OR current_setting('pathment.lifecycle', true) = 'on' THEN RETURN; END IF;
      cid := NULLIF(r->>'clan_id','')::uuid;
      IF tbl = 'clans' THEN cid := (r->>'id')::uuid; END IF;
      IF cid IS NOT NULL THEN
        SELECT kind, frozen_at INTO clan_kind, frozen FROM clans WHERE id = cid FOR SHARE;
        IF clan_kind = 'standing' THEN
          IF r->>'enrollment_id' IS NOT NULL THEN RAISE EXCEPTION 'Standing clan work cannot reference a program enrollment'; END IF;
          RETURN;
        END IF;
        IF frozen IS NOT NULL THEN RAISE EXCEPTION 'This cohort clan is historical and read-only'; END IF;
        IF clan_kind IS NOT NULL THEN RETURN; END IF;
      END IF;
      IF tbl = 'clans' AND r->>'kind' = 'standing' THEN RETURN; END IF;
      IF tbl IN ('enrollments','cohorts','clans') THEN pid := (r->>'program_id')::uuid; END IF;
      IF pid IS NULL AND r->>'enrollment_id' IS NOT NULL THEN
        SELECT program_id INTO pid FROM enrollments WHERE id = (r->>'enrollment_id')::uuid;
      END IF;
      IF pid IS NOT NULL THEN
        SELECT closed_at INTO frozen FROM programs WHERE id = pid FOR SHARE;
        IF frozen IS NOT NULL THEN RAISE EXCEPTION 'This program is completed and read-only'; END IF;
      END IF;
      IF tbl = 'community_posts' THEN
        IF r->>'scope_type' = 'clan' THEN PERFORM pathment_check_history('clan_memberships', jsonb_build_object('clan_id',r->>'scope_id')); END IF;
        IF r->>'scope_type' = 'cohort' THEN
          SELECT to_jsonb(c) INTO parent FROM cohorts c WHERE id = (r->>'scope_id')::uuid;
          PERFORM pathment_check_history('cohorts',parent);
        END IF;
      ELSIF tbl IN ('community_comments','community_reactions') THEN
        SELECT to_jsonb(p) INTO parent FROM community_posts p WHERE id = (r->>'post_id')::uuid;
        PERFORM pathment_check_history('community_posts',parent);
      ELSIF tbl IN ('task_submissions','task_feedback','task_progress_entries','quiz_sessions','interview_sessions','blockers','delay_events') THEN
        SELECT to_jsonb(t) INTO parent FROM assigned_tasks t WHERE id = (r->>'assigned_task_id')::uuid;
        PERFORM pathment_check_history('assigned_tasks',parent);
      ELSIF tbl = 'task_submission_files' THEN
        SELECT to_jsonb(s) INTO parent FROM task_submissions s WHERE id = (r->>'submission_id')::uuid;
        PERFORM pathment_check_history('task_submissions',parent);
      ELSIF tbl = 'cohort_review_entries' THEN
        SELECT to_jsonb(s) INTO parent FROM cohort_review_sessions s WHERE id = (r->>'session_id')::uuid;
        PERFORM pathment_check_history('cohort_review_sessions',parent);
      END IF;
    END;
  $$ LANGUAGE plpgsql;
  CREATE OR REPLACE FUNCTION pathment_guard_history() RETURNS TRIGGER AS $$
    BEGIN
      IF TG_TABLE_NAME = 'enrollment_snapshots' AND TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Final snapshots are immutable'; END IF;
      IF current_setting('pathment.lifecycle', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
      IF TG_TABLE_NAME = 'clans' AND TG_OP = 'UPDATE' THEN
        IF OLD.kind IS DISTINCT FROM NEW.kind THEN RAISE EXCEPTION 'Clan kind cannot be converted'; END IF;
        IF OLD.frozen_at IS DISTINCT FROM NEW.frozen_at THEN RAISE EXCEPTION 'Use the program close or reopen action'; END IF;
      END IF;
      IF TG_TABLE_NAME = 'programs' AND TG_OP = 'UPDATE' THEN
        IF OLD.closed_at IS DISTINCT FROM NEW.closed_at OR OLD.current_closure_id IS DISTINCT FROM NEW.current_closure_id OR
          (OLD.status IS DISTINCT FROM NEW.status AND (OLD.status='completed' OR NEW.status='completed'))
          THEN RAISE EXCEPTION 'Use the program close or reopen action'; END IF;
      END IF;
      IF TG_OP <> 'INSERT' THEN PERFORM pathment_check_history(TG_TABLE_NAME,to_jsonb(OLD)); END IF;
      IF TG_OP <> 'DELETE' THEN PERFORM pathment_check_history(TG_TABLE_NAME,to_jsonb(NEW)); END IF;
      RETURN COALESCE(NEW, OLD);
    END;
  $$ LANGUAGE plpgsql;`);
  for (const table of ['programs', 'clans', 'clan_memberships', 'assigned_tasks', 'enrollments', 'cohorts', 'roadmap_progress', 'tracks',
    'mentee_schedules', 'review_schedules', 'cohort_review_sessions', 'cohort_review_entries', 'daily_log_entries', 'blockers', 'delay_events',
    'task_submissions', 'task_feedback', 'task_submission_files', 'task_progress_entries', 'community_posts', 'community_comments', 'community_reactions',
    'quiz_sessions', 'interview_sessions', 'enrollment_snapshots']) {
    await q(`DROP TRIGGER IF EXISTS pathment_history_guard ON ${table};
      CREATE TRIGGER pathment_history_guard BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION pathment_guard_history();`);
  }
};
