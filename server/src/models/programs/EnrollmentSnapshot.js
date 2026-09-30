module.exports = (sequelize, D) => {
  const model = sequelize.define('EnrollmentSnapshot', {
    id: { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true },
    closureId: { type: D.UUID, allowNull: false, field: 'closure_id' },
    enrollmentId: { type: D.UUID, allowNull: false, field: 'enrollment_id' },
    menteeId: { type: D.UUID, allowNull: false, field: 'mentee_id' },
    programId: { type: D.UUID, allowNull: false, field: 'program_id' },
    cohortId: { type: D.UUID, field: 'cohort_id' },
    clanIds: { type: D.ARRAY(D.UUID), defaultValue: [], allowNull: false, field: 'clan_ids' },
    outcome: { type: D.STRING(30), allowNull: false },
    tier: { type: D.STRING(50) },
    decision: { type: D.JSONB, allowNull: false },
    performance: { type: D.JSONB, allowNull: false },
    cohortRank: { type: D.INTEGER, field: 'cohort_rank' },
    previousEnrollment: { type: D.JSONB, allowNull: false, field: 'previous_enrollment' },
  }, { tableName: 'enrollment_snapshots', underscored: true, indexes: [
    { unique: true, fields: ['closure_id', 'enrollment_id'] }, { fields: ['program_id', 'mentee_id'] },
  ] });
  model.associate = m => {
    model.belongsTo(m.ProgramClosure, { foreignKey: 'closureId', as: 'closure' });
    model.belongsTo(m.Enrollment, { foreignKey: 'enrollmentId', as: 'enrollment' });
    model.belongsTo(m.User, { foreignKey: 'menteeId', as: 'mentee' });
  };
  return model;
};
