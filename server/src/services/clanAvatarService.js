const { models } = require('../db');
const authz = require('./authzService');
const { PERMISSIONS } = require('../config/permissions');
const { ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

async function editableClan(id, user) {
  const clan = await models.Clan.findByPk(id);
  if (!clan) throw new NotFoundError('Clan not found');
  const resource = { clanId: id, programId: clan.programId };
  const allowed = await authz.can(user, PERMISSIONS.CLAN_MANAGE_MEMBERS, resource)
    || await authz.can(user, PERMISSIONS.CLAN_AVATAR_MANAGE, resource);
  if (!allowed) throw new ForbiddenError('You do not have permission to change this clan’s photo');
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
