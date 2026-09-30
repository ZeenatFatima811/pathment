'use strict';

/**
 * What one mentor may do inside one clan.
 *
 * The phone used to gate its mentor screens on a role string and on two
 * booleans. Neither can answer the question a co-mentor's screens actually ask,
 * because a lead mentor revokes permissions one at a time and only for their own
 * clan. Worse, the account wide permission union cannot answer it either: a
 * mentor who leads one clan and co-mentors another holds task.review in the
 * union whether or not the second clan's lead turned it off, so a client gating
 * on the union offers a co-mentor buttons the API is going to refuse.
 *
 * These pin the clan scoped answer: the list is there, it drops exactly what
 * was revoked, revoking in one clan does not touch the other, and a lead is
 * never subject to it.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const {
  cleanDb,
  createAdmin,
  createMentor,
  createProgram,
  authHeader,
} = require('../helpers/seed');

let admin;
let lead;
let coMentor;
let program;
let clan;
let otherClan;

const accessOf = (clanId, user) =>
  request(app)
    .get(`/api/clans/${clanId}/members/me/access`)
    .set('Authorization', authHeader(user));

async function join(clanId, userId, role) {
  return models.ClanMembership.create({ clanId, userId, role, status: 'active' });
}

beforeEach(async () => {
  await cleanDb();
  admin = await createAdmin({ email: 'perm-admin@test.com' });
  lead = await createMentor({ email: 'perm-lead@test.com' });
  coMentor = await createMentor({ email: 'perm-co@test.com' });
  program = await createProgram({ createdBy: admin.id, name: 'Backend' });

  clan = await models.Clan.create({ name: 'Node Guild', programId: program.id, createdBy: admin.id });
  otherClan = await models.Clan.create({ name: 'React Guild', programId: program.id, createdBy: admin.id });

  await join(clan.id, lead.id, 'lead_mentor');
  await join(clan.id, coMentor.id, 'co_mentor');
});

describe('the clan access reply', () => {
  test('carries the permissions this person holds here', async () => {
    const response = await accessOf(clan.id, coMentor);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data.permissions)).toBe(true);
    expect(response.body.data.permissions).toContain('task.review');
    expect(response.body.data.role).toBe('co_mentor');
  });

  test('a co-mentor starts with everything a lead can turn off', async () => {
    const response = await accessOf(clan.id, coMentor);

    for (const key of ['mentee.view', 'task.assign', 'task.review', 'analytics.view']) {
      expect(response.body.data.permissions).toContain(key);
    }
  });

  test('drops exactly what the lead revoked, and nothing else', async () => {
    await request(app)
      .patch(`/api/clans/${clan.id}/members/${coMentor.id}/permissions`)
      .set('Authorization', authHeader(lead))
      .send({ denied: ['task.review'] })
      .expect(200);

    const response = await accessOf(clan.id, coMentor);

    expect(response.body.data.permissions).not.toContain('task.review');
    // The rest are untouched. A revoke is one permission, not a demotion.
    expect(response.body.data.permissions).toContain('task.assign');
    expect(response.body.data.permissions).toContain('mentee.view');
  });

  test('a revoke in one clan leaves the same person alone in another', async () => {
    await join(otherClan.id, coMentor.id, 'co_mentor');

    await request(app)
      .patch(`/api/clans/${clan.id}/members/${coMentor.id}/permissions`)
      .set('Authorization', authHeader(lead))
      .send({ denied: ['task.review'] })
      .expect(200);

    const here = await accessOf(clan.id, coMentor);
    const there = await accessOf(otherClan.id, coMentor);

    expect(here.body.data.permissions).not.toContain('task.review');
    expect(there.body.data.permissions).toContain('task.review');
  });

  test('a lead mentor keeps everything, because there is nobody above them here', async () => {
    const response = await accessOf(clan.id, lead);

    expect(response.body.data.role).toBe('lead_mentor');
    expect(response.body.data.canManageTeam).toBe(true);
    expect(response.body.data.permissions).toContain('task.review');
    expect(response.body.data.permissions).toContain('mentee.add');
  });

  test('somebody who mentors neither clan is refused rather than answered', async () => {
    const stranger = await createMentor({ email: 'perm-stranger@test.com' });

    const response = await accessOf(clan.id, stranger);

    expect(response.status).toBe(403);
  });
});

describe('the clans one person mentors', () => {
  test('names both when they lead one and co-mentor another', async () => {
    await join(otherClan.id, lead.id, 'co_mentor');

    const response = await request(app)
      .get('/api/clans/me/memberships')
      .set('Authorization', authHeader(lead));

    expect(response.status).toBe(200);

    const rows = response.body.data.memberships;
    const byClan = new Map(rows.map((row) => [row.clanId, row.role]));

    expect(byClan.get(clan.id)).toBe('lead_mentor');
    expect(byClan.get(otherClan.id)).toBe('co_mentor');
  });

  test('carries the clan name, which the switcher has nothing to show without', async () => {
    const response = await request(app)
      .get('/api/clans/me/memberships')
      .set('Authorization', authHeader(lead));

    const row = response.body.data.memberships.find((one) => one.clanId === clan.id);
    expect(row.clan && row.clan.name).toBe('Node Guild');
  });
});
