const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const authz = require('./authzService');

// Internal-only option used by the atomic close/reopen operations, never request input.
const LIFECYCLE = Symbol.for('pathment.programLifecycle');
const ACTIVE = ['approved', 'pending_match', 'matched', 'active', 'pending_completion', 'level_completed', 'program_completed', 'dropped'];
const plain = row => row.toJSON ? row.toJSON() : row;

class ProgramLifecycleService {
  async assertAdmin(actor, programId) {
    if (!await authz.hasAdminAccess(actor)) throw new ForbiddenError('Only an admin can close or reopen a program');
    if (programId && !await authz.can(actor, require('../config/permissions').PERMISSIONS.PROGRAM_MANAGE, { programId })) throw new ForbiddenError('You cannot manage this program');
  }

  async assertCloseoutPlan(organizationId) {
    await require('./organizationService').requireEntitlement(
      organizationId,
      'programCompletionStanding',
      'Program closeout and standing clans are available on Growth and Scale plans',
    );
  }

  async hasEnded(program, now = new Date()) {
    const org = await models.Organization.findByPk(program.organizationId, { attributes: ['timezone'] });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: org?.timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    return Boolean(program.endDate && program.endDate <= today);
  }

  async decisions(programId, transaction) {
    const templates = await models.CertificateTemplate.findAll({ where: { programId }, transaction, lock: transaction ? transaction.LOCK.UPDATE : undefined });
    const enrollments = await models.Enrollment.findAll({ where: { programId, status: { [Op.in]: ACTIVE } }, transaction });
    const rows = templates.length ? await models.CertificateVerification.findAll({
      where: { templateId: { [Op.in]: templates.map(t => t.id) } }, transaction,
      order: [['verifiedAt', 'DESC'], ['createdAt', 'DESC']],
    }) : [];
    const byMentee = new Map();
    const unresolved = [];
    for (const enrollment of enrollments) {
      const decisions = rows.filter(r => r.menteeId === enrollment.menteeId);
      const settled = decisions.filter(r => r.status === 'verified' && ['award', 'no_certificate', 'inactive'].includes(r.decision));
      const signatures = new Set(settled.map(r => `${r.decision}:${r.finalTier || ''}`));
      if (!settled.length || decisions.some(r => r.status !== 'verified' || r.decision === 'undecided') || signatures.size > 1) {
        unresolved.push(enrollment.menteeId);
        continue;
      }
      const decision = settled[0];
      if (decision.decision === 'award' && !decision.finalTier) { unresolved.push(enrollment.menteeId); continue; }
      byMentee.set(enrollment.menteeId, decision);
    }
    return { enrollments, byMentee, unresolved };
  }

  async preview(programId, actor) {
    await this.assertAdmin(actor, programId);
    const program = await models.Program.findByPk(programId);
    if (!program) throw new NotFoundError('Program not found');
    const featureAvailable = await require('./organizationService').entitlement(
      program.organizationId,
      'programCompletionStanding',
    );
    const { enrollments, unresolved } = await this.decisions(programId);
    const ended = await this.hasEnded(program);
    const pending = unresolved.length ? await models.User.findAll({ where: { id: { [Op.in]: unresolved } }, attributes: ['id', 'firstName', 'lastName'] }) : [];
    return {
      ended,
      closed: Boolean(program.closedAt),
      canClose: featureAvailable && ended && !program.closedAt && !unresolved.length,
      featureAvailable,
      enrollmentCount: enrollments.length,
      unresolved: pending,
      currentClosureId: program.currentClosureId,
    };
  }

  async closeProgram(programId, actor) {
    await this.assertAdmin(actor, programId);
    return sequelize.transaction(async transaction => {
      await sequelize.query("SELECT set_config('pathment.lifecycle', 'on', true)", { transaction });
      const options = { transaction, [LIFECYCLE]: true };
      const program = await models.Program.findByPk(programId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!program) throw new NotFoundError('Program not found');
      await this.assertCloseoutPlan(program.organizationId);
      if (program.closedAt && program.currentClosureId) return models.ProgramClosure.findByPk(program.currentClosureId, { transaction });
      if (!await this.hasEnded(program)) throw new ValidationError('The program end date must be reached before closing');
      // Lock the cohort clans before reading evidence. Standing work has its own locks.
      const clans = await models.Clan.findAll({ where: { programId, kind: 'cohort' }, transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] });
      const { enrollments, byMentee, unresolved } = await this.decisions(programId, transaction);
      if (unresolved.length) throw new ValidationError(`Settle certificate verification for ${unresolved.length} mentee(s) before closing. Conflicting or pending decisions must be resolved.`);
      const cohorts = await models.Cohort.findAll({ where: { programId }, transaction });
      const memberships = clans.length ? await models.ClanMembership.findAll({ where: { clanId: { [Op.in]: clans.map(c => c.id) }, role: 'mentee' }, transaction }) : [];
      const closedAt = new Date();
      const closure = await models.ProgramClosure.create({ programId, closedBy: actor.id, closedAt,
        previousState: { status: program.status, cohorts: cohorts.map(c => ({ id: c.id, status: c.status })) } }, options);
      const groups = new Map();
      for (const enrollment of enrollments) {
        const key = enrollment.cohortId || 'program';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(enrollment);
      }
      for (const group of groups.values()) {
        const scores = await require('./performanceService').scoreMentees(group.map(e => e.menteeId), { programId, transaction, live: true });
        const ranked = scores.mentees.filter(m => m.eligible).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
        for (const enrollment of group) {
          const verification = byMentee.get(enrollment.menteeId);
          const outcome = verification.decision === 'award' ? 'certified'
            : verification.decision === 'inactive' || enrollment.status === 'dropped' ? 'dropped'
            : 'completed_uncertified';
          const tier = outcome === 'certified' ? verification.finalTier : null;
          const performance = scores.mentees.find(m => m.id === enrollment.menteeId);
          if (!performance) throw new ValidationError('Unable to snapshot a mentee. Restore their workspace record before closing.');
          await models.EnrollmentSnapshot.create({ closureId: closure.id, enrollmentId: enrollment.id, menteeId: enrollment.menteeId,
            programId, cohortId: enrollment.cohortId, clanIds: memberships.filter(m => m.userId === enrollment.menteeId).map(m => m.clanId),
            outcome, tier, decision: plain(verification), performance: { ...performance, weights: scores.weights },
            cohortRank: ranked.findIndex(m => m.id === enrollment.menteeId) + 1 || null,
            previousEnrollment: { status: enrollment.status, completedAt: enrollment.completedAt, droppedAt: enrollment.droppedAt,
              finalOutcome: enrollment.finalOutcome, finalTier: enrollment.finalTier } }, options);
          await enrollment.update({ finalOutcome: outcome, finalTier: tier, status: outcome === 'dropped' ? 'dropped' : 'program_completed',
            tasksCompleted: performance.evidence.tasksCompleted, overallProgressPercentage: performance.evidence.absoluteProgress,
            ...(outcome === 'dropped' ? { droppedAt: enrollment.droppedAt || closedAt } : { completedAt: enrollment.completedAt || closedAt }) }, options);
        }
      }
      await models.Clan.update({ frozenAt: closedAt }, { ...options, where: { programId, kind: 'cohort' } });
      await models.Cohort.update({ status: 'completed' }, { ...options, where: { programId } });
      await program.update({ status: 'completed', closedAt, currentClosureId: closure.id }, options);
      transaction.afterCommit(() => require('./clanHealthService').invalidate());
      return closure;
    });
  }

  async reopenProgram(programId, reason, actor) {
    await this.assertAdmin(actor, programId);
    if (!String(reason || '').trim()) throw new ValidationError('Explain why the program is being reopened');
    return sequelize.transaction(async transaction => {
      await sequelize.query("SELECT set_config('pathment.lifecycle', 'on', true)", { transaction });
      const options = { transaction, [LIFECYCLE]: true };
      const program = await models.Program.findByPk(programId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!program) throw new NotFoundError('Program not found');
      await this.assertCloseoutPlan(program.organizationId);
      if (!program.closedAt || !program.currentClosureId) throw new ValidationError('This program has no formal close to reopen');
      const closure = await models.ProgramClosure.findByPk(program.currentClosureId, { transaction });
      await closure.update({ reopenedAt: new Date(), reopenedBy: actor.id, reopenReason: reason.trim() }, options);
      await program.update({ status: closure.previousState.status === 'completed' ? 'published' : closure.previousState.status, closedAt: null }, options);
      await models.Clan.update({ frozenAt: null }, { ...options, where: { programId, kind: 'cohort' } });
      for (const cohort of closure.previousState.cohorts) await models.Cohort.update({ status: cohort.status }, { ...options, where: { id: cohort.id, programId } });
      const snapshots = await models.EnrollmentSnapshot.findAll({ where: { closureId: closure.id }, transaction });
      for (const snapshot of snapshots) await models.Enrollment.update(snapshot.previousEnrollment, { ...options, where: { id: snapshot.enrollmentId } });
      transaction.afterCommit(() => require('./clanHealthService').invalidate());
      return closure;
    });
  }

  async results(programId, actor) {
    await require('./programService').getProgramById(programId, actor.id, await authz.hasAdminAccess(actor) ? 'admin' : actor.role);
    const admin = await authz.hasAdminAccess(actor);
    if (admin) await authz.assertProgramInScope(actor, programId);
    const mentorClans = admin ? [] : await authz.mentoredClanIds(actor.id);
    const program = await models.Program.findByPk(programId);
    const history = await models.ProgramClosure.findAll({ where: { programId }, order: [['closedAt', 'DESC']] });
    const snapshots = await models.EnrollmentSnapshot.findAll({ where: { programId }, include: [{ model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName'] }], order: [['cohortRank', 'ASC']] });
    return { closed: Boolean(program.closedAt), currentClosureId: program.currentClosureId, history: history.map(h => ({ id: h.id, closedAt: h.closedAt, closedBy: h.closedBy, reopenedAt: h.reopenedAt, reopenedBy: h.reopenedBy, reopenReason: h.reopenReason })),
      snapshots: snapshots.filter(s => admin || s.menteeId === actor.id || s.clanIds.some(id => mentorClans.includes(id))) };
  }
}
module.exports = new ProgramLifecycleService();
module.exports.LIFECYCLE = LIFECYCLE;
