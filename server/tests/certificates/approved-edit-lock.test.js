jest.mock('../../src/db', () => ({ models: {
 CertificateTemplate: { findByPk: jest.fn() }, CertificateVerification: { findOne: jest.fn() },
 CertificateClanApproval: { findOne: jest.fn(), findAll: jest.fn(), destroy: jest.fn() }, CertificateInstance: { count: jest.fn(), findAll: jest.fn() },
}, sequelize: { transaction: jest.fn(fn => fn({ LOCK: { UPDATE: 'UPDATE' } })) } }));
jest.mock('../../src/services/authzService', () => ({ hasAdminAccess: jest.fn(), actsAsAdmin: jest.fn() }));
const { models } = require('../../src/db');
const authz = require('../../src/services/authzService');
const service = require('../../src/services/certificateVerificationService');
let row;
beforeEach(() => {
 jest.clearAllMocks();
 models.CertificateTemplate.findByPk.mockResolvedValue({ criteria: [{ id: 'silver' }, { id: 'gold' }] });
 row = { templateId: 'template', menteeId: 'mentee', clanId: 'clan', finalTier: 'silver', aiTier: 'silver', decision: 'award', status: 'verified', save: jest.fn() };
 models.CertificateVerification.findOne.mockResolvedValue(row);
 models.CertificateClanApproval.findOne.mockResolvedValue({ approvedBy: 'admin' });
 models.CertificateInstance.count.mockResolvedValue(0);
 authz.actsAsAdmin.mockResolvedValue(false);
 jest.spyOn(service, '_assertCanReview').mockResolvedValue();
 jest.spyOn(service, '_serialize').mockImplementation(value => value);
});
afterEach(() => jest.restoreAllMocks());
test('issued mentor edits are rejected before saving', async () => {
 authz.hasAdminAccess.mockResolvedValue(false);
 models.CertificateInstance.count.mockResolvedValue(1);
 await expect(service.verify('template', 'mentee', { finalTier: 'gold', reason: 'Updated evidence' }, { id: 'mentor' }, { notify: false })).rejects.toThrow('Request a revoke and change');
 expect(row.save).not.toHaveBeenCalled();
});
test('admin approval locks a mentor edit before issuance', async () => {
 authz.hasAdminAccess.mockResolvedValue(false);
 row.stage = 'admin_approved';
 await expect(service.verify('template', 'mentee', { finalTier: 'gold', reason: 'Updated evidence' }, { id: 'mentor' }, { notify: false })).rejects.toThrow('Request a change');
 expect(row.save).not.toHaveBeenCalled();
});
test('admin may edit before issuance', async () => {
 authz.hasAdminAccess.mockResolvedValue(true);
 authz.actsAsAdmin.mockResolvedValue(true);
 await service.verify('template', 'mentee', { finalTier: 'gold', reason: 'Updated evidence' }, { id: 'admin' }, { notify: false });
 expect(row.finalTier).toBe('gold');
 expect(row.save).toHaveBeenCalled();
 expect(models.CertificateClanApproval.destroy).not.toHaveBeenCalled();
});
test('unapproved mentor decisions remain editable', async () => {
 authz.hasAdminAccess.mockResolvedValue(false);
 models.CertificateClanApproval.findOne.mockResolvedValue(null);
 await service.verify('template', 'mentee', { finalTier: 'gold', reason: 'Updated evidence' }, { id: 'mentor' }, { notify: false });
 expect(row.finalTier).toBe('gold');
});

test('AI refresh leaves approved clan grades untouched', async () => {
 models.CertificateClanApproval.findAll.mockResolvedValue([{ clanId: 'clan' }]);
 models.CertificateInstance.findAll.mockResolvedValue([]);
 jest.spyOn(service, '_clanOfMentees').mockResolvedValue(new Map([['mentee', 'clan']]));
 const result = await service.open('template', [{ mentee_id: 'mentee', certificate_tier: 'gold', match_score: 90 }], { notify: false });
 expect(result.updated).toBe(0);
 expect(result.created).toBe(0);
 expect(row.save).not.toHaveBeenCalled();
 expect(models.CertificateClanApproval.destroy).not.toHaveBeenCalled();
});
