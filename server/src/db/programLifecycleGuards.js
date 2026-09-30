const { Op } = require('sequelize');
const { ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');
const LIFECYCLE = Symbol.for('pathment.programLifecycle');

/** Keep historical records read-only at the ORM boundary, including workers and bulk writes. */
module.exports = function installProgramLifecycleGuards(sequelize, models) {
  const parents = {
    TaskSubmission: ['AssignedTask', 'assignedTaskId'], TaskFeedback: ['AssignedTask', 'assignedTaskId'],
    TaskSubmissionFile: ['TaskSubmission', 'submissionId'], TaskProgressEntry: ['AssignedTask', 'assignedTaskId'],
    CohortReviewEntry: ['CohortReviewSession', 'sessionId'],
    CommunityComment: ['CommunityPost', 'postId'], CommunityReaction: ['CommunityPost', 'postId'],
    InterviewSession: ['AssignedTask', 'assignedTaskId'], QuizSession: ['AssignedTask', 'assignedTaskId'],
    Blocker: ['AssignedTask', 'assignedTaskId'], DelayEvent: ['AssignedTask', 'assignedTaskId'],
  };
  const direct = ['Clan', 'ClanMembership', 'AssignedTask', 'RoadmapProgress', 'Track', 'MenteeSchedule', 'ReviewSchedule',
    'CohortReviewSession', 'DailyLogEntry', 'DelayEvent', 'Blocker', 'CommunityPost', 'Enrollment', 'Cohort', 'Roadmap'];

  async function assertProgram(programId, options) {
    if (!programId) return;
    const program = await models.Program.findByPk(programId, { transaction: options.transaction });
    if (program?.closedAt || program?.status === 'completed') throw new ForbiddenError('This program is completed. An admin must reopen it before its historical work can change.');
  }

  async function check(model, row, options = {}) {
    if (options[LIFECYCLE]) return;
    if (!row) return;
    const get = key => row[key] ?? row[model.rawAttributes[key]?.field];
    const clanId = model.name === 'Clan' ? get('id') : get('clanId');
    if (clanId) {
      const clan = model.name === 'Clan' && row.isNewRecord ? row : await models.Clan.findByPk(clanId, { transaction: options.transaction });
      if (clan?.kind === 'standing') {
        if (get('enrollmentId')) throw new ValidationError('Standing clan work and memberships cannot be linked to a program enrollment');
        return;
      }
      if (clan?.frozenAt) throw new ForbiddenError('This cohort clan is historical and read-only. An admin can reopen its program for corrections.');
      if (clan) await assertProgram(clan.programId, options);
    }
    if (model.name === 'Clan' && get('kind') !== 'standing') await assertProgram(get('programId'), options);
    if (['Enrollment', 'Cohort'].includes(model.name)) await assertProgram(get('programId'), options);
    if (get('enrollmentId')) {
      const enrollment = await models.Enrollment.findByPk(get('enrollmentId'), { transaction: options.transaction });
      if (enrollment) await assertProgram(enrollment.programId, options);
    }
    if (model.name === 'CommunityPost') {
      if (get('scopeType') === 'clan') await check(models.ClanMembership, { clanId: get('scopeId') }, options);
      if (get('scopeType') === 'cohort') {
        const cohort = await models.Cohort.findByPk(get('scopeId'), { transaction: options.transaction });
        if (cohort?.status === 'completed') throw new ForbiddenError('This cohort community is read-only. You can still post in the program community.');
        if (cohort) await assertProgram(cohort.programId, options);
      }
    }
    const parent = parents[model.name];
    if (parent && get(parent[1])) {
      const value = await models[parent[0]].findByPk(get(parent[1]), { transaction: options.transaction });
      await check(models[parent[0]], value, options);
    }
    // A task must be attached to the selected clan's enrollment, never another program.
    if (model.name === 'AssignedTask' && clanId) {
      const clan = await models.Clan.findByPk(clanId, { transaction: options.transaction });
      if (clan?.kind !== 'standing') {
        const enrollment = get('enrollmentId') && await models.Enrollment.findByPk(get('enrollmentId'), { transaction: options.transaction });
        if (!enrollment || enrollment.programId !== clan.programId || enrollment.menteeId !== get('menteeId')) throw new ValidationError('The task enrollment must belong to this mentee and clan program');
      }
    }
  }

  for (const name of new Set([...direct, ...Object.keys(parents)])) {
    const model = models[name];
    if (!model) continue;
    const save = async (row, options) => {
      if (options[LIFECYCLE]) return;
      if (!row.isNewRecord) await check(model, row._previousDataValues, options);
      await check(model, row, options);
    };
    model.addHook('beforeSave', save);
    model.addHook('beforeDestroy', (row, options) => check(model, row, options));
    model.addHook('beforeBulkCreate', async (rows, options) => { for (const row of rows) await check(model, row, options); });
    for (const hook of ['beforeBulkUpdate', 'beforeBulkDestroy']) model.addHook(hook, async options => {
      if (options[LIFECYCLE]) return;
      const rows = await model.findAll({ where: options.where, transaction: options.transaction });
      for (const row of rows) {
        await check(model, row, options);
        if (options.attributes) await check(model, { ...row.get({ plain: true }), ...options.attributes }, options);
      }
    });
  }
  models.Clan.addHook('beforeUpdate', row => {
    if (row.changed('kind')) throw new ValidationError('Clan kind cannot be converted. Approve a standing clan request to create a new clan.');
  });
  models.Program.addHook('beforeUpdate', (row, options) => {
    if (options[LIFECYCLE]) return;
    if (row.changed('closedAt') || row.changed('currentClosureId') || (row.changed('status') && (row.status === 'completed' || row.previous('status') === 'completed'))) throw new ValidationError('Use the formal close or reopen action to change program completion');
  });
  for (const hook of ['beforeUpdate', 'beforeDestroy', 'beforeBulkUpdate', 'beforeBulkDestroy']) {
    models.EnrollmentSnapshot.addHook(hook, () => { throw new ForbiddenError('Final snapshots are immutable. Reopen and close the program to save a revised result.'); });
  }
};
