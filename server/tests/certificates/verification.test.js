'use strict';

/**
 * Mentors sign off on AI-assigned certificate grades before anything is issued.
 *
 * The AI grades from the record and cannot know the things a mentor knows, so a
 * human confirms or corrects the grade. The rules that matter:
 *
 *   - a mentor signs off on THEIR clan, and nobody else's
 *   - an override keeps the AI's original grade beside the new one, with a
 *     reason, so the admin can see what changed and why
 *   - the mentor's decision is what gets issued, even if the admin clicks
 *     Issue from a screen still showing the AI's grade
 *   - the deadline is a nudge: nothing issues on its own and the admin is
 *     never blocked
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const certificateService = require('../../src/services/certificateService');
const verification = require('../../src/services/certificateVerificationService');
const { cleanDb, createAdmin, createMentor, createMentee, createProgram } = require('../helpers/seed');

const CRITERIA = [
  { id: 'gold', name: 'Gold Certificate', artworkUrl: 'https://cdn/gold.png', layout: [] },
  { id: 'silver', name: 'Silver Certificate', artworkUrl: 'https://cdn/silver.png', layout: [] },
  { id: 'bronze', name: 'Bronze Certificate', artworkUrl: 'https://cdn/bronze.png', layout: [] }
];

describe('mentor verification of certificate grades', () => {
  let admin, lead, otherLead, mentee, otherMentee, program, clan, otherClan, template;

  beforeEach(async () => {
    await cleanDb();
    await models.CertificateVerification.destroy({ where: {}, force: true });
    await models.CertificateInstance.destroy({ where: {}, force: true });
    await models.CertificateTemplate.destroy({ where: {}, force: true });

    admin = await createAdmin({ email: 'admin@test.com' });
    lead = await createMentor({ email: 'lead@test.com' });
    otherLead = await createMentor({ email: 'other-lead@test.com' });
    mentee = await createMentee({ email: 'mine@test.com' });
    otherMentee = await createMentee({ email: 'theirs@test.com' });

    program = await createProgram({ createdBy: admin.id });
    clan = await models.Clan.create({ programId: program.id, name: 'Viral Loop', leadMentorId: lead.id, createdBy: admin.id });
    otherClan = await models.Clan.create({ programId: program.id, name: 'Core Team', leadMentorId: otherLead.id, createdBy: admin.id });

    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });
    await clanService.addMember(otherClan.id, { userId: otherLead.id, role: 'lead_mentor' });
    await clanService.addMember(otherClan.id, { userId: otherMentee.id, role: 'mentee' });

    template = await certificateService.createTemplate(
      { name: 'Fellowship', config: [], criteria: CRITERIA, programId: program.id }, admin.id
    );
  });

  const openRound = (deadline = null) => verification.open(template.id, [
    { mentee_id: mentee.id, certificate_tier: 'bronze', match_score: 62 },
    { mentee_id: otherMentee.id, certificate_tier: 'silver', match_score: 74 }
  ], { deadline, notify: false });

  describe('opening the round', () => {
    it('creates one pending row per graded mentee, routed to their clan', async () => {
      const res = await openRound();
      expect(res.created).toBe(2);

      const row = await models.CertificateVerification.findOne({ where: { templateId: template.id, menteeId: mentee.id } });
      expect(row.status).toBe('pending');
      expect(row.aiTier).toBe('bronze');
      expect(row.finalTier).toBe('bronze');   // defaults to what the AI said
      expect(row.overridden).toBe(false);
      expect(row.clanId).toBe(clan.id);
    });

    it('re-grading updates a pending row rather than stacking a second opinion', async () => {
      await openRound();
      const again = await verification.open(template.id,
        [{ mentee_id: mentee.id, certificate_tier: 'silver', match_score: 71 }], { notify: false });
      expect(again.created).toBe(0);
      expect(again.updated).toBe(1);

      const rows = await models.CertificateVerification.findAll({ where: { templateId: template.id, menteeId: mentee.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].finalTier).toBe('silver');
    });

    it('re-grading NEVER undoes a mentor who already signed off', async () => {
      await openRound();
      await verification.verify(template.id, mentee.id, { finalTier: 'gold', reason: 'Carried the clan' }, lead);

      await verification.open(template.id,
        [{ mentee_id: mentee.id, certificate_tier: 'bronze', match_score: 55 }], { notify: false });

      const row = await models.CertificateVerification.findOne({ where: { templateId: template.id, menteeId: mentee.id } });
      expect(row.status).toBe('verified');
      expect(row.finalTier).toBe('gold');     // the human's decision stands
      expect(row.aiTier).toBe('bronze');      // the AI's latest view is recorded
    });
  });

  describe('who may sign off', () => {
    beforeEach(openRound);

    it('lets a mentor verify their own clan', async () => {
      const row = await verification.verify(template.id, mentee.id, {}, lead);
      expect(row.status).toBe('verified');
      expect(row.overridden).toBe(false);
    });

    it('refuses a mentor another clan', async () => {
      await expect(verification.verify(template.id, otherMentee.id, {}, lead))
        .rejects.toThrow(/only verify certificates for mentees in your clan/i);
    });

    it('shows a mentor only their own clan\'s queue', async () => {
      const { rows } = await verification.listForReviewer(template.id, lead);
      expect(rows.map((r) => r.menteeId)).toEqual([mentee.id]);
    });

    it('shows an admin every clan', async () => {
      const { rows } = await verification.listForReviewer(template.id, admin);
      expect(rows).toHaveLength(2);
    });

    it('returns the same per-clan review facts used by the roster filters', async () => {
      await verification.verify(template.id, mentee.id,
        { finalTier: 'gold', reason: 'Led the clan project' }, lead, { notify: false });

      const { clans } = await verification.listForReviewer(template.id, admin);
      const viral = clans.find((entry) => entry.clanId === clan.id);

      expect(viral).toMatchObject({
        total: 1,
        pending: 0,
        verified: 1,
        overridden: 1,
        noCertificate: 0,
        complete: true
      });
    });
  });

  describe('overriding a grade', () => {
    beforeEach(openRound);

    it('records the change, the reason, and what the AI had said', async () => {
      const row = await verification.verify(
        template.id, mentee.id, { finalTier: 'gold', reason: 'Mentored two juniors all season' }, lead
      );
      expect(row.finalTier).toBe('gold');
      expect(row.aiTier).toBe('bronze');
      expect(row.overridden).toBe(true);
      expect(row.overrideReason).toBe('Mentored two juniors all season');
    });

    it('works downwards too', async () => {
      const row = await verification.verify(template.id, mentee.id, { finalTier: 'silver', reason: 'Much of it was pair work' }, lead);
      expect(row.finalTier).toBe('silver');
      expect(row.overridden).toBe(true);
    });

    it('demands a reason — an admin reviewing this later needs to know why', async () => {
      await expect(verification.verify(template.id, mentee.id, { finalTier: 'gold' }, lead))
        .rejects.toThrow(/why you are changing this grade/i);
    });

    it('needs no reason when confirming the AI', async () => {
      const row = await verification.verify(template.id, mentee.id, { finalTier: 'bronze' }, lead);
      expect(row.overridden).toBe(false);
    });

    it('refuses a tier the template does not have', async () => {
      await expect(verification.verify(template.id, mentee.id, { finalTier: 'platinum', reason: 'x' }, lead))
        .rejects.toThrow(/not a certificate type/i);
    });
  });

  describe('what the admin sees', () => {
    it('reports per-clan progress and overrides', async () => {
      await openRound();
      await verification.verify(template.id, mentee.id, { finalTier: 'gold', reason: 'Outstanding' }, lead);

      const summary = await verification.summary(template.id);
      expect(summary.total).toBe(2);
      expect(summary.verified).toBe(1);
      expect(summary.pending).toBe(1);
      expect(summary.overridden).toBe(1);
      expect(summary.allVerified).toBe(false);

      const viral = summary.clans.find((c) => c.clanName === 'Viral Loop');
      expect(viral).toMatchObject({ total: 1, verified: 1, pending: 0, overridden: 1, complete: true });
      const core = summary.clans.find((c) => c.clanName === 'Core Team');
      expect(core).toMatchObject({ verified: 0, pending: 1, complete: false });
    });

    it('flags an expired deadline as overdue while work is outstanding', async () => {
      await openRound(new Date(Date.now() - 86400000));
      const summary = await verification.summary(template.id);
      expect(summary.overdue).toBe(true);
    });

    it('is not overdue once everybody has signed off, deadline or not', async () => {
      await openRound(new Date(Date.now() - 86400000));
      await verification.verify(template.id, mentee.id, {}, lead);
      await verification.verify(template.id, otherMentee.id, {}, otherLead);
      const summary = await verification.summary(template.id);
      expect(summary.overdue).toBe(false);
      expect(summary.allVerified).toBe(true);
    });
  });

  describe('issuance honours the mentor', () => {
    it('issues the verified tier even when the caller sends the AI\'s', async () => {
      await openRound();
      await verification.verify(template.id, mentee.id, { finalTier: 'gold', reason: 'Exceptional' }, lead);

      // An admin clicking Issue from a screen still showing "bronze".
      await certificateService.issueCertificates(
        { templateId: template.id, recipients: [{ menteeId: mentee.id, tier: 'bronze' }] }, admin.id, admin
      );

      const issued = await models.CertificateInstance.findOne({ where: { menteeId: mentee.id } });
      expect(issued.tier).toBe('gold');
    });

    /**
     * Inside an open round the admin is exempt from the CLAN RELEASE, not from
     * review. This asserted the opposite and issued to a mentee nobody had
     * looked at; on production that shape sent 195 certificates for grades no
     * human had confirmed.
     */
    it('blocks even the admin from issuing an unverified grade inside an open round', async () => {
      await openRound();
      await expect(certificateService.issueCertificates(
        { templateId: template.id, recipients: [{ menteeId: mentee.id, tier: 'bronze' }] }, admin.id, admin
      )).rejects.toThrow(/have not been signed off/i);
      expect(await models.CertificateInstance.count({ where: { templateId: template.id } })).toBe(0);
    });

    it('lets the admin issue once the grade is signed off, without releasing the clan', async () => {
      await openRound();
      await verification.verify(template.id, mentee.id, {}, admin);
      const res = await certificateService.issueCertificates(
        { templateId: template.id, recipients: [{ menteeId: mentee.id, tier: 'bronze' }] }, admin.id, admin
      );
      expect(res.count).toBe(1);
    });

    it('still works for a template that never had a review round', async () => {
      const res = await certificateService.issueCertificates(
        { templateId: template.id, recipients: [{ menteeId: mentee.id, tier: 'silver' }] }, admin.id, admin
      );
      expect(res.count).toBe(1);
      const issued = await models.CertificateInstance.findOne({ where: { menteeId: mentee.id } });
      expect(issued.tier).toBe('silver');
    });
  });

  describe('bulk sign-off', () => {
    it('verifies several at once — "these all look right"', async () => {
      await openRound();
      const res = await verification.verifyMany(template.id, [{ menteeId: mentee.id }], lead);
      expect(res.verified).toBe(1);
      expect(res.rows[0].status).toBe('verified');
    });

    it('refuses the whole batch if one row is out of scope', async () => {
      await openRound();
      await expect(verification.verifyMany(template.id, [
        { menteeId: mentee.id }, { menteeId: otherMentee.id }
      ], lead)).rejects.toThrow(/only verify/i);
    });
  });
});
