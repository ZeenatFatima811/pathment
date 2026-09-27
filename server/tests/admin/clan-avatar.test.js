jest.mock('../../src/db', () => ({ models: { Clan: { findByPk: jest.fn() } } }));
jest.mock('../../src/services/authzService', () => ({ can: jest.fn() }));
jest.mock('../../src/utils/cloudinaryUpload', () => ({ uploadToCloudinary: jest.fn() }));
const { models } = require('../../src/db');
const authz = require('../../src/services/authzService');
const { uploadToCloudinary } = require('../../src/utils/cloudinaryUpload');
const service = require('../../src/services/clanAvatarService');
let clan;
beforeEach(()=>{ jest.clearAllMocks();clan={id:'c',programId:'p',update:jest.fn(async values=>Object.assign(clan,values))};models.Clan.findByPk.mockResolvedValue(clan);authz.can.mockResolvedValue(false); });
test('rejects unrelated mentors before sending an image to storage', async()=>{
 await expect(service.setAvatar('c',{id:'outsider'},{mimetype:'image/png',size:10,buffer:Buffer.from('image')})).rejects.toThrow('permission to change this clan');
 expect(uploadToCloudinary).not.toHaveBeenCalled();
});
test('allows a co-mentor with the clan photo permission to edit the avatar',async()=>{
 authz.can.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
 uploadToCloudinary.mockResolvedValue({secure_url:'https://example.test/photo.png'});
 await service.setAvatar('c',{id:'co'},{mimetype:'image/png',size:10,buffer:Buffer.from('image')});
 expect(authz.can).toHaveBeenNthCalledWith(2,{id:'co'},'clan.avatar_manage',{clanId:'c',programId:'p'});
 expect(clan.update).toHaveBeenCalledWith({avatarUrl:'https://example.test/photo.png'});
});
test('preserves existing clan manager avatar access',async()=>{
 authz.can.mockResolvedValueOnce(true);
 uploadToCloudinary.mockResolvedValue({secure_url:'https://example.test/photo.png'});
 await service.setAvatar('c',{id:'admin'},{mimetype:'image/png',size:10,buffer:Buffer.from('image')});
 expect(authz.can).toHaveBeenCalledTimes(1);
 expect(clan.update).toHaveBeenCalledWith({avatarUrl:'https://example.test/photo.png'});
});
test('denies a co-mentor whose photo permission was revoked',async()=>{
 await expect(service.removeAvatar('c',{id:'co'})).rejects.toThrow('permission to change this clan');
 expect(clan.update).not.toHaveBeenCalled();
});
test.each([{mimetype:'image/svg+xml',size:10},{mimetype:'image/png',size:6*1024*1024}])('rejects unsupported or oversized images',async file=>{
 authz.can.mockResolvedValue(true);
 await expect(service.setAvatar('c',{id:'admin'},file)).rejects.toThrow('Choose a PNG');
 expect(uploadToCloudinary).not.toHaveBeenCalled();
});
