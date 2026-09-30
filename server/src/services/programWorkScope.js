const { Op, literal } = require('sequelize');
const { sequelize } = require('../db');
const { requireWorkspaceId } = require('../utils/workspaceExecution');

// A program is derived from the work's enrollment or actual cohort clan, never
// from a person's newest membership. Standing work is excluded even on legacy rows.
function taskSql({ programId = null, clanId = null } = {}, alias = '') {
  const p = alias ? `${alias}.` : '';
  const org = sequelize.escape(requireWorkspaceId());
  return `${clanId ? `${p}clan_id = ${sequelize.escape(clanId)} AND ` : ''}
    (${p}clan_id IS NULL OR ${p}clan_id IN (SELECT id FROM clans WHERE organization_id = ${org} AND kind = 'cohort'))
    ${programId ? `AND ${p}enrollment_id IN (SELECT id FROM enrollments WHERE organization_id = ${org} AND program_id = ${sequelize.escape(programId)})` : ''}`;
}
function taskWhere(scope = {}) { return { [Op.and]: literal(taskSql(scope, '"AssignedTask"')) }; }
function clanWhere({ programId = null, clanId = null } = {}) {
  const org = sequelize.escape(requireWorkspaceId());
  if (clanId) return { clanId };
  return { clanId: { [Op.in]: literal(`(SELECT id FROM clans WHERE organization_id = ${org} AND kind = 'cohort'${programId ? ` AND program_id = ${sequelize.escape(programId)}` : ''})`) } };
}
module.exports = { taskSql, taskWhere, clanWhere };
