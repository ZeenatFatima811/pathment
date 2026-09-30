'use strict';

/**
 * Verified and approved are different facts, and only the second lets a mentor
 * send.
 *
 *   admin sends   →  mentors review        (they CANNOT send)
 *   mentors done  →  clan is "verified"    (they still cannot send)
 *   admin approves→  clan is "approved"    (now they can)
 *
 * The middle step is the one that was missing: a mentor could issue the moment
 * the round opened, which skipped the admin's release entirely and meant
 * certificates could go out before anybody decided the cohort was ready.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const certificateService = require('../../src/services/certificateService');
const verification = require('../../src/services/certificateVerificationService');
const { cleanDb, createAdmin, createMentor, createMentee, createProgram } = require('../helpers/seed');

describe('admin approval gates issuing', () => {
  let admin, lead, mentee, program, clan, template;

  beforeEach(async () => {
    await cleanDb();
    for (const model of ['CertificateClanApproval', 'CertificateVerification', 'CertificateInstance', 'CertificateTemplate']) {
      await models[model].destroy({ where: {}, force: true });
    }

    admin = await createAdmin({ email: 'admin@test.com' });
    lead = await createMentor({ email: 'lead@test.com' });
    mentee = await createMentee({ email: 'mentee@test.com' });

    program = await createProgram({ createdBy: admin.id });
    clan = await models.Clan.create({ programId: program.id, name: 'Viral Loop', leadMentorId: lead.id, createdBy: admin.id });
    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });

    template = await certificateService.createTemplate({
      name: 'Fellowship',
      config: [],
      criteria: [{ id: 'bronze', name: 'Bronze Certificate', artworkUrl: 'https://cdn/b.png', layout: [] }],
      programId: program.id
    }, admin.id);

    await template.update({
      aiEvaluation: {
        results: [{ mentee_id: mentee.id, certificate_tier: 'bronze', match_score: 60 }],
        ranAt: new Date().toISOString()
      }
    });
    await verification.sendToClans(template.id, {}, admin);
  });

  const issueAs = (user) => certificateService.issueCertificates(
    { templateId: template.id, recipients: [{ menteeId: mentee.id, tier: 'bronze' }] }, user.id, user
  );

  describe('before the admin approves', () => {
    it('refuses a mentor even after their clan is fully verified', async () => {
      await verification.verify(template.id, mentee.id, {}, lead);
      await expect(issueAs(lead)).rejects.toThrow(/not been approved for release/i);
      expect(await models.CertificateInstance.count()).toBe(0);
    });

    it('refuses a mentor who has not reviewed at all', async () => {
      // The blocker here is the missing review, not the missing release, and the
      // error says so — the two need opposite things from whoever reads it.
      await expect(issueAs(lead)).rejects.toThrow(/have not been signed off/i);
    });

    /**
     * The admin's exemption is from the CLAN RELEASE, not from review.
     *
     * This suite used to assert "they are never gated" and issue to a mentee
     * nobody had looked at — encoding the defect. On production one press of
     * Issue then sent 410 participation certificates, 195 of them for grades no
     * human had ever confirmed: `hasAdminAccess` returned early from the gate,
     * and `resolveTiers` handed back the pending row's AI grade as if it were
     * final.
     */
    it('refuses even the admin while the grade is only the AI\'s', async () => {
      await expect(issueAs(admin)).rejects.toThrow(/have not been signed off/i);
      expect(await models.CertificateInstance.count()).toBe(0);
    });

    it('lets the admin issue without releasing the clan, once the grade is signed off', async () => {
      await verification.verify(template.id, mentee.id, {}, admin);
      const res = await issueAs(admin);
      expect(res.count).toBe(1);
    });

    it("tells the mentor their clan is waiting on the admin", async () => {
      await verification.verify(template.id, mentee.id, {}, lead);
      const { clans } = await verification.listForReviewer(template.id, lead);
      expect(clans).toHaveLength(1);
      expect(clans[0]).toMatchObject({ pending: 0, verified: 1, approved: false, canSend: false });
    });
  });

  describe('current roster, not historical review rows', () => {
    it('shows ten signed-off active mentees and ignores six paused pending records on both screens', async () => {
      const active = [mentee];
      const paused = [];
      for (let i = 0; i < 15; i++) {
        const person = await createMentee({ email: `roster-${i}@test.com` });
        await clanService.addMember(clan.id, { userId: person.id, role: 'mentee' });
        (i < 9 ? active : paused).push(person);
      }
      await verification.open(template.id, [...active, ...paused].map((m) => ({ mentee_id: m.id, certificate_tier: 'bronze' })), { notify: false });
      for (const person of paused) {
        await models.ClanMembership.update({ status: 'paused' }, { where: { clanId: clan.id, userId: person.id, role: 'mentee' } });
      }
      for (const person of active) await verification.verify(template.id, person.id, {}, lead);
      const reviewer = await verification.listForReviewer(template.id, lead);
      const summary = await verification.summary(template.id);
      expect(reviewer.rows).toHaveLength(10);
      expect(reviewer.clans[0]).toMatchObject({ pending: 0, verified: 10, canSend: false });
      expect(summary.clans[0]).toMatchObject({ total: 10, pending: 0, verified: 10, readyToApprove: true });
      expect(summary.allVerified).toBe(true);
      expect(await models.CertificateVerification.count({ where: { templateId: template.id } })).toBe(16);
      const release = await verification.approveClan(template.id, clan.id, {}, admin);
      expect(release).toMatchObject({ approvedBeforeVerified: false, outstandingAtApproval: 0 });
    });

    it.each(['removed', 'paused'])('excludes %s memberships and includes them again when reactivated', async (status) => {
      await models.ClanMembership.update({ status }, { where: { clanId: clan.id, userId: mentee.id, role: 'mentee' } });
      expect((await verification.summary(template.id)).total).toBe(0);
      expect((await verification.listForReviewer(template.id, lead)).rows).toHaveLength(0);
      await models.ClanMembership.update({ status: 'active' }, { where: { clanId: clan.id, userId: mentee.id, role: 'mentee' } });
      expect((await verification.summary(template.id)).pending).toBe(1);
    });

    it('does not count suspended accounts or move a historical sign-off to another clan', async () => {
      await mentee.update({ status: 'suspended' });
      expect((await verification.summary(template.id)).total).toBe(0);
      await mentee.update({ status: 'active' });
      const nextClan = await models.Clan.create({ programId: program.id, name: 'Next clan', leadMentorId: lead.id, createdBy: admin.id });
      await models.ClanMembership.update({ status: 'removed' }, { where: { clanId: clan.id, userId: mentee.id, role: 'mentee' } });
      await clanService.addMember(nextClan.id, { userId: mentee.id, role: 'mentee' });
      expect((await verification.summary(template.id)).total).toBe(0);
      expect(await models.CertificateVerification.count({ where: { templateId: template.id } })).toBe(1);
    });
  });

  describe('after the admin approves', () => {
    beforeEach(async () => {
      await verification.verify(template.id, mentee.id, {}, lead);
      await verification.approveClan(template.id, clan.id, {}, admin);
    });

    it('lets the clan\'s mentor send', async () => {
      const res = await issueAs(lead);
      expect(res.count).toBe(1);
    });

    it('tells the mentor they can send', async () => {
      const { clans } = await verification.listForReviewer(template.id, lead);
      expect(clans[0]).toMatchObject({ approved: true, canSend: true });
    });

    it('does not let the same certificate go out twice, whoever sends', async () => {
      await issueAs(lead);
      const adminAttempt = await issueAs(admin);
      expect(adminAttempt.count).toBe(0);
      expect(adminAttempt.skipped).toBe(1);
      expect(await models.CertificateInstance.count()).toBe(1);
    });

    it('stops sending again once the approval is withdrawn', async () => {
      await verification.revokeClanApproval(template.id, clan.id, admin);
      await expect(issueAs(lead)).rejects.toThrow(/not been approved/i);
    });
  });

  describe('the admin is informed but never blocked', () => {
    it('records approving a clan whose mentors had not finished', async () => {
      const res = await verification.approveClan(template.id, clan.id, {}, admin);
      expect(res.approvedBeforeVerified).toBe(true);
      expect(res.outstandingAtApproval).toBe(1);
    });

    it('does not flag an approval made after everyone signed off', async () => {
      await verification.verify(template.id, mentee.id, {}, lead);
      const res = await verification.approveClan(template.id, clan.id, {}, admin);
      expect(res.approvedBeforeVerified).toBe(false);
    });

    it('reports per-clan release state in the summary', async () => {
      await verification.verify(template.id, mentee.id, {}, lead);
      let summary = await verification.summary(template.id);
      expect(summary.awaitingApproval).toBe(1);
      expect(summary.approvedClans).toBe(0);
      expect(summary.clans[0].readyToApprove).toBe(true);

      await verification.approveClan(template.id, clan.id, {}, admin);
      summary = await verification.summary(template.id);
      expect(summary.approvedClans).toBe(1);
      expect(summary.awaitingApproval).toBe(0);
      expect(summary.clans[0].approved).toBe(true);
    });

    it('refuses a mentor trying to approve their own clan', async () => {
      await expect(verification.approveClan(template.id, clan.id, {}, lead))
        .rejects.toThrow(/Only an admin can release/i);
    });
  });
});
