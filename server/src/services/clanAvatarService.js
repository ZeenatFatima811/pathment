const { models } = require('../db');
const authz = require('./authzService');
const { ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

async function editableClan(id, user) {
  const clan = await models.Clan.findByPk(id);
  if (!clan) throw new NotFoundError('Clan not found');
  const manager = await authz.can(user, 'clan.manage_members', { clanId: id, programId: clan.programId });
  const membership = manager ? null : await models.ClanMembership.findOne({
    where: { clanId: id, userId: user.id, status: 'active', role: ['lead_mentor', 'co_mentor'] },
  });
  if (!manager && !membership) throw new ForbiddenError('Only this clan’s mentors can change its photo');
  return clan;
}
async function setAvatar(id, user, file) {
  const clan = await editableClan(id, user);
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype) || file.size > 5 * 1024 * 1024) {
    throw new ValidationError('Choose a PNG, JPG or WebP image up to 5 MB');
  }
  const result = await uploadToCloudinary(file.buffer, 'pathment/clan-avatars', 'image');
  await clan.update({ avatarUrl: result.secure_url });
  return { avatarUrl: clan.avatarUrl };
}
async function removeAvatar(id, user) {
  const clan = await editableClan(id, user);
  await clan.update({ avatarUrl: null });
  return { avatarUrl: null };
}
module.exports = { editableClan, setAvatar, removeAvatar };
