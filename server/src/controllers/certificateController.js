const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const certificateService = require('../services/certificateService');
const { portalOf } = require('../middlewares/portalScope');
const certificateVerificationService = require('../services/certificateVerificationService');

// The default review window when an admin sends without naming a date. A
// working week: long enough to fit around teaching, short enough that issuance
// is not held for a fortnight.
const VERIFICATION_WINDOW_DAYS = Number(process.env.CERTIFICATE_VERIFICATION_WINDOW_DAYS) || 7;

const createTemplate = catchAsync(async (req, res) => {
  const template = await certificateService.createTemplate(req.body, req.user.id);
  res.status(201).json(successResponse('Certificate template created successfully', template, 201));
});

const listTemplates = catchAsync(async (req, res) => {
  const templates = await certificateService.listTemplates(req.query.programId, req.user);
  res.status(200).json(successResponse('Certificate templates retrieved', templates));
});

const getTemplate = catchAsync(async (req, res) => {
  const template = await certificateService.getTemplate(req.params.id);
  res.status(200).json(successResponse('Certificate template details', template));
});

const updateTemplate = catchAsync(async (req, res) => {
  const template = await certificateService.updateTemplate(req.params.id, req.body);
  res.status(200).json(successResponse('Certificate template updated successfully', template));
});

const deleteTemplate = catchAsync(async (req, res) => {
  await certificateService.deleteTemplate(req.params.id);
  res.status(200).json(successResponse('Certificate template deleted successfully'));
});

const issueCertificates = catchAsync(async (req, res) => {
  const result = await certificateService.issueCertificates(req.body, req.user.id, req.user);
  res.status(201).json(successResponse(`Enqueued ${result.count} certificate(s) for generation`, result, 201));
});

const listMenteeCertificates = catchAsync(async (req, res) => {
  const certificates = await certificateService.listMenteeCertificates(req.params.menteeId, req.user);
  res.status(200).json(successResponse('Mentee certificates retrieved', certificates));
});

const getCertificateInstance = catchAsync(async (req, res) => {
  const instance = await certificateService.getCertificateInstance(req.params.id, req.user);
  res.status(200).json(successResponse('Certificate details retrieved', instance));
});

const uploadAsset = catchAsync(async (req, res) => {
  const url = await certificateService.uploadAsset(req.file?.buffer);
  res.status(200).json(successResponse('Asset uploaded successfully', { url }));
});

/**
 * The case for one mentee's certificate: live metrics, how they measure against
 * each tier, what the AI proposed, and what a mentor decided — including why,
 * when they overruled it.
 */
const getMenteeEvidence = catchAsync(async (req, res) => {
  const data = await certificateService.getMenteeEvidence(req.params.id, req.params.menteeId, req.user);
  res.status(200).json(successResponse('Certificate evidence retrieved', data));
});

const getQualification = catchAsync(async (req, res) => {
  const result = await certificateService.getQualification(req.params.id, req.query.mentorId, req.user, { clanId: portalOf(req).clanId });
  res.status(200).json(successResponse('Qualification calculation complete', result));
});

/**
 * The admin hands the grades to the clans that must sign them off.
 *
 * `deadline` is optional: without one the mentors get the default review
 * window, which is a nudge and never a gate.
 */
const sendToClans = catchAsync(async (req, res) => {
  const deadline = req.body?.deadline
    || new Date(Date.now() + VERIFICATION_WINDOW_DAYS * 86400000).toISOString();
  const result = await certificateVerificationService.sendToClans(
    req.params.id, { deadline, clanIds: req.body?.clanIds || null }, req.user
  );
  res.status(200).json(successResponse(
    `Sent to ${result.notified} mentor(s) for verification`,
    { ...result, deadline }
  ));
});

const sendToMentors = catchAsync(async (req, res) => {
  const result = await certificateService.sendToMentors(req.params.id);
  if (result.sent === 0) {
    return res.status(200).json(successResponse('No active mentors found in this program.', { sent: 0 }));
  }
  res.status(200).json(successResponse(`Sent to ${result.sent} mentor(s).`, result));
});

const getTemplateHistory = catchAsync(async (req, res) => {
  const history = await certificateService.getTemplateHistory(req.params.id, req.user);
  res.status(200).json(successResponse('Template history retrieved', history));
});

const deleteCertificateInstance = catchAsync(async (req, res) => {
  await certificateService.deleteCertificateInstance(req.params.id, req.user);
  res.status(200).json(successResponse('Certificate instance deleted/revoked successfully'));
});

const resendCertificateInstance = catchAsync(async (req, res) => {
  await certificateService.resendCertificateInstance(req.params.id);
  res.status(200).json(successResponse('Certificate queued for regeneration successfully'));
});

const revokeAllTemplateCertificates = catchAsync(async (req, res) => {
  const result = await certificateService.revokeAllTemplateCertificates(req.params.id, req.user);
  res.status(200).json(successResponse(`Successfully revoked all ${result.count} certificates for this template`, result));
});

const resendAllTemplateCertificates = catchAsync(async (req, res) => {
  const result = await certificateService.resendAllTemplateCertificates(req.params.id, req.body.failedOnly, req.user);
  if (result.updated === 0) {
    return res.status(200).json(successResponse('No certificate instances found to resend.', { updated: 0 }));
  }
  res.status(200).json(successResponse(`Successfully queued ${result.updated} certificate(s) for regeneration`, result));
});

const runAIEvaluation = catchAsync(async (req, res) => {
  const result = await certificateService.runAIEvaluation(req.params.id, req.query.mentorId, req.user, { clanId: portalOf(req).clanId });
  if (result.total === 0) {
    return res.status(200).json(successResponse('No active mentees found in this program.', [], 200));
  }
  res.status(202).json(successResponse(
    `Queued ${result.total} mentee evaluations. Results will arrive via real-time updates.`,
    result,
    202
  ));
});

const getAIEvaluationStatus = catchAsync(async (req, res) => {
  const status = await certificateService.getAIEvaluationStatus(req.query.runId, req.params.id);
  res.status(200).json(successResponse('AI evaluation status', status));
});


// ── Mentor verification of AI-assigned tiers ────────────────────────────────

const listVerifications = catchAsync(async (req, res) => {
  const result = await certificateVerificationService.listForReviewer(
    req.params.id, req.user, { clanId: req.query.clanId || portalOf(req).clanId }
  );
  res.status(200).json(successResponse('Verification queue retrieved', result));
});

const verifyOne = catchAsync(async (req, res) => {
  const row = await certificateVerificationService.verify(
    req.params.id, req.params.menteeId,
    { decision: req.body.decision, finalTier: req.body.finalTier, reason: req.body.reason },
    req.user
  );
  res.status(200).json(successResponse('Grade verified', { verification: row }));
});

const verifyMany = catchAsync(async (req, res) => {
  const result = await certificateVerificationService.verifyMany(
    req.params.id, req.body.decisions, req.user
  );
  res.status(200).json(successResponse(`Verified ${result.verified} grade(s)`, result));
});

const verificationSummary = catchAsync(async (req, res) => {
  const summary = await certificateVerificationService.summary(req.params.id);
  res.status(200).json(successResponse('Verification summary retrieved', summary));
});

const remindReviewers = catchAsync(async (req, res) => {
  const template = await certificateService.getTemplate(req.params.id);
  const result = await certificateVerificationService.open(
    req.params.id,
    (template.aiEvaluation?.results) || [],
    { deadline: req.body.deadline || null }
  );
  res.status(200).json(successResponse(`Reminded ${result.notified} mentor(s)`, result));
});


const approveClan = catchAsync(async (req, res) => {
  const result = await certificateVerificationService.approveClan(
    req.params.id, req.params.clanId, { note: req.body?.note }, req.user
  );
  res.status(200).json(successResponse('Clan approved — its mentors can now send', result));
});

const revokeClanApproval = catchAsync(async (req, res) => {
  const result = await certificateVerificationService.revokeClanApproval(
    req.params.id, req.params.clanId, req.user
  );
  res.status(200).json(successResponse('Clan approval withdrawn', result));
});

/**
 * What this template issued without anyone signing it off. Read-only, so the
 * admin sees exactly who is affected before choosing to revoke.
 */
const unreviewedIssued = catchAsync(async (req, res) => {
  const certificates = await certificateVerificationService.unreviewedIssued(req.params.id);
  res.status(200).json(successResponse(
    `${certificates.length} certificate(s) were issued without a signed-off grade`,
    { count: certificates.length, certificates }
  ));
});

const revokeUnreviewed = catchAsync(async (req, res) => {
  const result = await certificateVerificationService.revokeUnreviewed(req.params.id, req.user);
  res.status(200).json(successResponse(
    result.revoked
      ? `Revoked ${result.revoked} certificate(s) that had no signed-off grade`
      : 'Nothing to revoke — every issued certificate has a signed-off grade',
    result
  ));
});

module.exports = {
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  issueCertificates,
  listMenteeCertificates,
  getCertificateInstance,
  uploadAsset,
  getQualification,
  getMenteeEvidence,
  sendToMentors,
  getTemplateHistory,
  deleteCertificateInstance,
  resendCertificateInstance,
  revokeAllTemplateCertificates,
  resendAllTemplateCertificates,
  runAIEvaluation,
  getAIEvaluationStatus,
  listVerifications,
  verifyOne,
  verifyMany,
  verificationSummary,
  remindReviewers,
  sendToClans,
  approveClan,
  revokeClanApproval,
  unreviewedIssued,
  revokeUnreviewed
};
