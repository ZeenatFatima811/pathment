'use strict';

/**
 * A reminder reminds. It does not reopen the round.
 *
 * "Remind mentors" called `open(templateId, template.aiEvaluation.results)`,
 * which is the round-opening path: it rewrites every pending row back to the
 * AI's grade, clears `overridden`, and destroys the clan's approval wherever the
 * grade had moved. So an admin pressing a nudge button could un-approve clans
 * and silently discard staged decisions.
 *
 * It also mailed the wrong number to the wrong people: every mentor of every
 * clan holding a pending row, all told the same GLOBAL outstanding count.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const certificateService = require('../../src/services/certificateService');
const verification = require('../../src/services/certificateVerificationService');
const notificationOrchestrator = require('../../src/services/notificationOrchestrator');
const { cleanDb, createAdmin, createMentor, createMentee, createProgram } = require('../helpers/seed');

describe('reminding reviewers', () => {
  let admin, busyLead, doneLead, pendingMentee, otherPending, doneMentee;
  let program, busyClan, doneClan, template;

  beforeEach(async () => {
    await cleanDb();
    for (const model of ['CertificateClanApproval', 'CertificateVerification', 'CertificateInstance', 'CertificateTemplate']) {
      await models[model].destroy({ where: {}, force: true });
    }

    admin = await createAdmin({ email: 'admin@test.com' });
    busyLead = await createMentor({ email: 'busy@test.com' });
    doneLead = await createMentor({ email: 'done@test.com' });
    pendingMentee = await createMentee({ email: 'pending1@test.com' });
    otherPending = await createMentee({ email: 'pending2@test.com' });
    doneMentee = await createMentee({ email: 'done-mentee@test.com' });

    program = await createProgram({ createdBy: admin.id });
    busyClan = await models.Clan.create({ programId: program.id, name: 'Busy Clan', leadMentorId: busyLead.id, createdBy: admin.id });
    doneClan = await models.Clan.create({ programId: program.id, name: 'Done Clan', leadMentorId: doneLead.id, createdBy: admin.id });
    await clanService.addMember(busyClan.id, { userId: busyLead.id, role: 'lead_mentor' });
    await clanService.addMember(doneClan.id, { userId: doneLead.id, role: 'lead_mentor' });
    await clanService.addMember(busyClan.id, { userId: pendingMentee.id, role: 'mentee' });
    await clanService.addMember(busyClan.id, { userId: otherPending.id, role: 'mentee' });
    await clanService.addMember(doneClan.id, { userId: doneMentee.id, role: 'mentee' });

    template = await certificateService.createTemplate({
      name: 'Fellowship 2026 summer',
      config: [],
      criteria: [
        { id: 'bronze', name: 'Bronze', artworkUrl: 'https://cdn/b.png', layout: [] },
        { id: 'silver', name: 'Silver', artworkUrl: 'https://cdn/s.png', layout: [] }
      ],
      programId: program.id
    }, admin.id);
    await template.update({
      aiEvaluation: {
        results: [pendingMentee, otherPending, doneMentee].map((m) => ({
          mentee_id: m.id, certificate_tier: 'bronze', match_score: 60
        })),
        ranAt: new Date().toISOString()
      }
    });
    await verification.sendToClans(template.id, {}, admin);
    // Done Clan has finished; Busy Clan has two outstanding.
    await verification.verify(template.id, doneMentee.id, {}, doneLead);
    // The harness mocks the orchestrator, so reminders are observed as dispatch
    // calls rather than as rows. Clear what setup produced.
    notificationOrchestrator.dispatch.mockClear();
  });

  /** Every reminder addressed to this user. */
  const remindersFor = (userId) => notificationOrchestrator.dispatch.mock.calls
    .map(([args]) => args)
    .filter((args) => (args.recipients || []).some((r) => r.userId === userId));

  describe('it changes nothing', () => {
    it('leaves a staged grade change alone instead of resetting it to the AI grade', async () => {
      // The admin stages silver over the AI's bronze, but has not signed it off.
      const row = await models.CertificateVerification.findOne({
        where: { templateId: template.id, menteeId: pendingMentee.id }
      });
      await row.update({ finalTier: 'silver', overridden: true });

      await verification.remindReviewers(template.id, {}, admin);

      await row.reload();
      expect(row.finalTier).toBe('silver');
      expect(row.overridden).toBe(true);
    });

    it('does not withdraw a clan approval', async () => {
      await verification.approveClan(template.id, doneClan.id, {}, admin);
      expect(await models.CertificateClanApproval.count({ where: { templateId: template.id } })).toBe(1);

      await verification.remindReviewers(template.id, {}, admin);

      expect(await models.CertificateClanApproval.count({ where: { templateId: template.id } })).toBe(1);
    });

    it('does not create or re-open verification rows', async () => {
      const before = await models.CertificateVerification.count({ where: { templateId: template.id } });
      const verified = await models.CertificateVerification.count({ where: { templateId: template.id, status: 'verified' } });

      await verification.remindReviewers(template.id, {}, admin);

      expect(await models.CertificateVerification.count({ where: { templateId: template.id } })).toBe(before);
      expect(await models.CertificateVerification.count({ where: { templateId: template.id, status: 'verified' } })).toBe(verified);
    });
  });

  describe('who it reaches', () => {
    it('writes to the mentor who still owes reviews', async () => {
      const result = await verification.remindReviewers(template.id, {}, admin);
      expect(result.notified).toBe(1);
      expect(remindersFor(busyLead.id)).toHaveLength(1);
    });

    it('leaves alone a mentor whose clan is finished', async () => {
      await verification.remindReviewers(template.id, {}, admin);
      expect(remindersFor(doneLead.id)).toHaveLength(0);
    });

    it('tells each mentor their OWN outstanding count, not the global one', async () => {
      await verification.remindReviewers(template.id, {}, admin);
      const [note] = remindersFor(busyLead.id);
      // Busy Clan owes 2 of the 2 outstanding; the old notice said "3 of your
      // mentees have been graded" to everybody regardless.
      expect(note.payload.message).toMatch(/\b2 grades\b/);
    });

    it('reports nobody to remind once every grade is reviewed', async () => {
      for (const mentee of [pendingMentee, otherPending]) {
        await verification.verify(template.id, mentee.id, {}, busyLead);
      }
      // Finishing the clan tells the admins it is clear to issue; that dispatch
      // is not a reminder, so it must not count towards this assertion.
      notificationOrchestrator.dispatch.mockClear();
      const result = await verification.remindReviewers(template.id, {}, admin);
      expect(result).toMatchObject({ notified: 0, outstanding: 0 });
      expect(notificationOrchestrator.dispatch).not.toHaveBeenCalled();
    });

    it('can be sent more than once — a reminder is repeatable', async () => {
      await verification.remindReviewers(template.id, {}, admin);
      await verification.remindReviewers(template.id, {}, admin);
      expect(remindersFor(busyLead.id)).toHaveLength(2);
    });
  });

  describe('permission', () => {
    it('refuses a mentor', async () => {
      await expect(verification.remindReviewers(template.id, {}, busyLead))
        .rejects.toThrow(/Only an admin/i);
      expect(notificationOrchestrator.dispatch).not.toHaveBeenCalled();
    });

    it('refuses an unknown template', async () => {
      await expect(verification.remindReviewers('00000000-0000-4000-8000-000000000000', {}, admin))
        .rejects.toThrow(/not found/i);
    });
  });

  describe('the deadline', () => {
    it('moves it only when one is explicitly given', async () => {
      await verification.remindReviewers(template.id, {}, admin);
      await template.reload();
      expect(template.verificationDeadline).toBeNull();

      const deadline = new Date(Date.now() + 7 * 86400000);
      await verification.remindReviewers(template.id, { deadline }, admin);
      await template.reload();
      expect(template.verificationDeadline).toBeTruthy();
    });
  });
});
