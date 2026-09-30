module.exports = (sequelize, D) => {
  const model = sequelize.define('ProgramClosure', {
    id: { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true },
    programId: { type: D.UUID, allowNull: false, field: 'program_id' },
    closedBy: { type: D.UUID, allowNull: false, field: 'closed_by' },
    closedAt: { type: D.DATE, allowNull: false, field: 'closed_at' },
    previousState: { type: D.JSONB, allowNull: false, field: 'previous_state' },
    reopenedBy: { type: D.UUID, field: 'reopened_by' },
    reopenedAt: { type: D.DATE, field: 'reopened_at' },
    reopenReason: { type: D.TEXT, field: 'reopen_reason' },
  }, { tableName: 'program_closures', underscored: true, indexes: [{ fields: ['program_id'] }] });
  model.associate = m => {
    model.belongsTo(m.Program, { foreignKey: 'programId', as: 'program' });
    model.belongsTo(m.User, { foreignKey: 'closedBy', as: 'closer' });
    model.hasMany(m.EnrollmentSnapshot, { foreignKey: 'closureId', as: 'snapshots' });
  };
  return model;
};
