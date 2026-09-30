jest.mock('../../src/db', () => ({ models: { Clan: { findByPk: jest.fn() }, ClanMembership: { findOne: jest.fn() } } }));
jest.mock('../../src/services/authzService', () => ({ can: jest.fn() }));
jest.mock('../../src/utils/cloudinaryUpload', () => ({ uploadToCloudinary: jest.fn() }));
const { models } = require('../../src/db');
const authz = require('../../src/services/authzService');
const { uploadToCloudinary } = require('../../src/utils/cloudinaryUpload');
const service = require('../../src/services/clanAvatarService');
let clan;
beforeEach(()=>{ jest.clearAllMocks();clan={id:'c',programId:'p',update:jest.fn(async values=>Object.assign(clan,values))};models.Clan.findByPk.mockResolvedValue(clan);authz.can.mockResolvedValue(false);models.ClanMembership.findOne.mockResolvedValue(null); });
test('rejects unrelated mentors before sending an image to storage', async()=>{
 await expect(service.setAvatar('c',{id:'outsider'},{mimetype:'image/png',size:10,buffer:Buffer.from('image')})).rejects.toThrow('Only this clan');
 expect(uploadToCloudinary).not.toHaveBeenCalled();
});
test('allows an active co-mentor to edit only the avatar',async()=>{
 models.ClanMembership.findOne.mockResolvedValue({role:'co_mentor'});
 uploadToCloudinary.mockResolvedValue({secure_url:'https://example.test/photo.png'});
 await service.setAvatar('c',{id:'co'},{mimetype:'image/png',size:10,buffer:Buffer.from('image')});
 expect(models.ClanMembership.findOne).toHaveBeenCalledWith({where:{clanId:'c',userId:'co',status:'active',role:['lead_mentor','co_mentor']}});
 expect(clan.update).toHaveBeenCalledWith({avatarUrl:'https://example.test/photo.png'});
});
test.each([{mimetype:'image/svg+xml',size:10},{mimetype:'image/png',size:6*1024*1024}])('rejects unsupported or oversized images',async file=>{
 authz.can.mockResolvedValue(true);
 await expect(service.setAvatar('c',{id:'admin'},file)).rejects.toThrow('Choose a PNG');
 expect(uploadToCloudinary).not.toHaveBeenCalled();
});
