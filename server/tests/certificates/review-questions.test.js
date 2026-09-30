'use strict';

/**
 * Asking a mentor why they graded somebody the way they did.
 *
 * An admin who disagreed with a grade could only accept it or overrule it, and
 * overruling discards both the mentor's judgement and the reason for it — when
 * very often the mentor knows something the record does not. A question leaves
 * the grade alone and puts the reasoning on the record next to it.
 *
 * The precondition matters: you can only question a decision a MENTOR made.
 * There is nothing to ask when an admin graded it themselves, or when nobody
 * has signed it off yet.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const certificateService = require('../../src/services/certificateService');
const verification = require('../../src/services/certificateVerificationService');
const notificationOrchestrator = require('../../src/services/notificationOrchestrator');
const { cleanDb, createAdmin, createMentor, createMentee, createProgram } = require('../helpers/seed');

describe('questioning a grade', () => {
  let admin, lead, otherMentor, byMentor, byAdmin, unreviewed, program, clan, template;

  beforeEach(async () => {
    await cleanDb();
    for (const model of ['CertificateReviewQuestion', 'CertificateClanApproval', 'CertificateVerification', 'CertificateInstance', 'CertificateTemplate']) {
      await models[model].destroy({ where: {}, force: true });
    }

    admin = await createAdmin({ email: 'admin@test.com' });
    lead = await createMentor({ email: 'lead@test.com' });
    otherMentor = await createMentor({ email: 'other@test.com' });
    byMentor = await createMentee({ email: 'by-mentor@test.com' });
    byAdmin = await createMentee({ email: 'by-admin@test.com' });
    unreviewed = await createMentee({ email: 'unreviewed@test.com' });

    program = await createProgram({ createdBy: admin.id });
    clan = await models.Clan.create({ programId: program.id, name: 'Static Stream', leadMentorId: lead.id, createdBy: admin.id });
    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
    for (const person of [byMentor, byAdmin, unreviewed]) {
      await clanService.addMember(clan.id, { userId: person.id, role: 'mentee' });
    }

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
        results: [byMentor, byAdmin, unreviewed].map((m) => ({
          mentee_id: m.id, certificate_tier: 'bronze', match_score: 60
        })),
        ranAt: new Date().toISOString()
      }
    });
    await verification.sendToClans(template.id, {}, admin);
    await verification.verify(template.id, byMentor.id, {}, lead);
    await verification.verify(template.id, byAdmin.id, {}, admin);
    notificationOrchestrator.dispatch.mockClear();
  });

  const dispatchesTo = (userId) => notificationOrchestrator.dispatch.mock.calls
    .map(([args]) => args)
    .filter((args) => (args.recipients || []).some((r) => r.userId === userId));

  describe('only a mentor\'s decision can be questioned', () => {
    it('asks the mentor who actually decided it', async () => {
      const q = await verification.askMentor(template.id, byMentor.id, 'Why bronze and not silver?', admin);
      expect(q).toMatchObject({
        status: 'open',
        question: 'Why bronze and not silver?',
        addressedTo: lead.id,
        menteeId: byMentor.id
      });
      expect(dispatchesTo(lead.id)).toHaveLength(1);
    });

    it('refuses when the admin graded it themselves — nobody to ask', async () => {
      await expect(verification.askMentor(template.id, byAdmin.id, 'Why?', admin))
        .rejects.toThrow(/decided by an admin/i);
    });

    it('refuses when nobody has signed the grade off yet', async () => {
      await expect(verification.askMentor(template.id, unreviewed.id, 'Why?', admin))
        .rejects.toThrow(/signed this grade off/i);
    });

    it('refuses a mentor trying to question a grade', async () => {
      await expect(verification.askMentor(template.id, byMentor.id, 'Why?', lead))
        .rejects.toThrow(/Only an admin/i);
    });

    it('needs an actual question', async () => {
      await expect(verification.askMentor(template.id, byMentor.id, '   ', admin))
        .rejects.toThrow(/Write the question/i);
    });

    it('allows only one open question at a time', async () => {
      await verification.askMentor(template.id, byMentor.id, 'First?', admin);
      await expect(verification.askMentor(template.id, byMentor.id, 'Second?', admin))
        .rejects.toThrow(/already an open question/i);
    });
  });

  describe('the grade is untouched while a question is open', () => {
    it('does not change the decision, tier or stage', async () => {
      const before = await models.CertificateVerification.findOne({
        where: { templateId: template.id, menteeId: byMentor.id }
      });
      const snapshot = { decision: before.decision, finalTier: before.finalTier, stage: before.stage, status: before.status };

      await verification.askMentor(template.id, byMentor.id, 'Why bronze?', admin);

      await before.reload();
      expect({
        decision: before.decision, finalTier: before.finalTier, stage: before.stage, status: before.status
      }).toEqual(snapshot);
    });

    it('is reported separately from the stage, not folded into it', async () => {
      await verification.askMentor(template.id, byMentor.id, 'Why bronze?', admin);
      const summary = await verification.summary(template.id);
      expect(summary.questioned).toBe(1);
      // Still counted as what it is: a mentor-verified row.
      expect(summary.mentorVerified).toBeGreaterThanOrEqual(1);
    });

    it('marks the row on the roster so it can be spotted', async () => {
      await verification.askMentor(template.id, byMentor.id, 'Why bronze?', admin);
      const { rows } = await verification.listForReviewer(template.id, lead);
      const row = rows.find((r) => r.menteeId === byMentor.id);
      expect(row.hasOpenQuestion).toBe(true);
      expect(rows.find((r) => r.menteeId === byAdmin.id).hasOpenQuestion).toBe(false);
    });
  });

  describe('answering', () => {
    let question;
    beforeEach(async () => {
      question = await verification.askMentor(template.id, byMentor.id, 'Why bronze?', admin);
      notificationOrchestrator.dispatch.mockClear();
    });

    it('records the answer and closes the question', async () => {
      const answered = await verification.answerQuestion(question.id, 'They missed two reviews in August.', lead);
      expect(answered).toMatchObject({
        status: 'answered',
        answer: 'They missed two reviews in August.',
      });
      expect(answered.answeredAt).toBeTruthy();
    });

    it('tells the admin who asked', async () => {
      await verification.answerQuestion(question.id, 'They missed two reviews.', lead);
      expect(dispatchesTo(admin.id)).toHaveLength(1);
    });

    it('clears it from the open set', async () => {
      await verification.answerQuestion(question.id, 'Because of attendance.', lead);
      expect((await verification.summary(template.id)).questioned).toBe(0);
      const { rows } = await verification.listForReviewer(template.id, lead);
      expect(rows.find((r) => r.menteeId === byMentor.id).hasOpenQuestion).toBe(false);
    });

    it('refuses a mentor with no claim on that clan', async () => {
      await expect(verification.answerQuestion(question.id, 'Not mine', otherMentor))
        .rejects.toThrow(/Only the mentor who made this decision/i);
    });

    it('refuses an empty answer', async () => {
      await expect(verification.answerQuestion(question.id, '  ', lead))
        .rejects.toThrow(/Write an answer/i);
    });

    it('cannot be answered twice', async () => {
      await verification.answerQuestion(question.id, 'First answer', lead);
      await expect(verification.answerQuestion(question.id, 'Second answer', lead))
        .rejects.toThrow(/already been answered/i);
    });

    it('frees the mentee for a new question once answered', async () => {
      await verification.answerQuestion(question.id, 'Answered', lead);
      const second = await verification.askMentor(template.id, byMentor.id, 'And the attendance?', admin);
      expect(second.status).toBe('open');
      const thread = await verification.listQuestions(template.id, { menteeId: byMentor.id });
      expect(thread).toHaveLength(2);
    });
  });

  describe('withdrawing', () => {
    it('lets the admin take back a question, freeing the mentee', async () => {
      const q = await verification.askMentor(template.id, byMentor.id, 'Asked in error', admin);
      expect((await verification.withdrawQuestion(q.id, admin)).status).toBe('withdrawn');
      expect((await verification.summary(template.id)).questioned).toBe(0);
      await expect(verification.askMentor(template.id, byMentor.id, 'Proper question', admin))
        .resolves.toMatchObject({ status: 'open' });
    });

    it('refuses a mentor', async () => {
      const q = await verification.askMentor(template.id, byMentor.id, 'Why?', admin);
      await expect(verification.withdrawQuestion(q.id, lead)).rejects.toThrow(/Only an admin/i);
    });
  });

  describe('notifying one mentee\'s mentors', () => {
    it('writes to the clan mentors of just that mentee', async () => {
      const result = await verification.notifyMentorsForMentee(template.id, unreviewed.id, {}, admin);
      expect(result).toMatchObject({ notified: 1, clanName: 'Static Stream' });
      expect(dispatchesTo(lead.id)).toHaveLength(1);
    });

    it('refuses when the mentee has no clan — nobody owns the review', async () => {
      const stray = await createMentee({ email: 'stray@test.com' });
      await expect(verification.notifyMentorsForMentee(template.id, stray.id, {}, admin))
        .rejects.toThrow(/not in a clan/i);
    });

    it('refuses a mentor', async () => {
      await expect(verification.notifyMentorsForMentee(template.id, unreviewed.id, {}, lead))
        .rejects.toThrow(/Only an admin/i);
    });
  });
});
