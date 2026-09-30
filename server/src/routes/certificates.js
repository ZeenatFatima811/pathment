const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificateController');
const { authenticate, authorize } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

router.post(
  '/templates',
  authenticate,
  authorize(['admin']),
  certificateController.createTemplate
);

router.get(
  '/templates',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.listTemplates
);

router.get(
  '/templates/:id',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.getTemplate
);

router.get(
  '/templates/:id/qualification',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.getQualification
);

// Why one mentee is getting the certificate they are getting. Readable by the
// mentee themselves, the mentors of their clan, and admins — the service scopes
// it; the role list here only says who may ask.
router.get(
  '/templates/:id/mentees/:menteeId/evidence',
  authenticate,
  authorize(['admin', 'mentor', 'mentee']),
  certificateController.getMenteeEvidence
);

router.put(
  '/templates/:id',
  authenticate,
  authorize(['admin']),
  certificateController.updateTemplate
);

router.delete(
  '/templates/:id',
  authenticate,
  authorize(['admin']),
  certificateController.deleteTemplate
);

router.post(
  '/instances',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.issueCertificates
);

router.get(
  '/instances/mentee/:menteeId',
  authenticate,
  authorize(['admin', 'mentor', 'mentee']),
  certificateController.listMenteeCertificates
);

router.get(
  '/instances/:id',
  authenticate,
  authorize(['admin', 'mentor', 'mentee']),
  certificateController.getCertificateInstance
);

router.post(
  '/upload',
  authenticate,
  authorize(['admin']),
  upload.singleSafe('file'),
  certificateController.uploadAsset
);

router.post(
  '/templates/:id/send-to-mentors',
  authenticate,
  authorize(['admin']),
  certificateController.sendToMentors
);

router.get(
  '/templates/:id/history',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.getTemplateHistory
);

router.delete(
  '/instances/:id',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.deleteCertificateInstance
);

router.post(
  '/instances/:id/resend',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.resendCertificateInstance
);

router.delete(
  '/templates/:id/instances',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.revokeAllTemplateCertificates
);

router.post(
  '/templates/:id/resend',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.resendAllTemplateCertificates
);

router.post(
  '/templates/:id/ai-evaluate',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.runAIEvaluation
);

router.get(
  '/templates/:id/ai-evaluate/status',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.getAIEvaluationStatus
);

// ── Mentor verification of AI-assigned tiers ────────────────────────────────
// Mentors sign off on their own clans; admins see and can act on everything.
// Scope is enforced in the service (clan-derived, never the base role).

router.get(
  '/templates/:id/verifications',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.listVerifications
);

router.post(
  '/templates/:id/verifications/bulk',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.verifyMany
);

router.post(
  '/templates/:id/verifications/:menteeId',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.verifyOne
);

// The admin's banner: who has signed off, who is outstanding, what is overdue.
router.get(
  '/templates/:id/verification-summary',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.verificationSummary
);

// Hand the grades to the clans that must sign them off, with a deadline.
router.post(
  '/templates/:id/send-to-clans',
  authenticate,
  authorize(['admin']),
  certificateController.sendToClans
);

// Release a clan for issuing. Verified says the grades are right; approved
// says they may go out — and only the second lets a mentor press send.
router.post(
  '/templates/:id/clans/:clanId/approve',
  authenticate,
  authorize(['admin']),
  certificateController.approveClan
);

router.delete(
  '/templates/:id/clans/:clanId/approve',
  authenticate,
  authorize(['admin']),
  certificateController.revokeClanApproval
);

// Certificates that went out without a sign-off, and taking them back.
//
// Separate from `DELETE /templates/:id/instances`, which revokes EVERYTHING the
// template issued — no use when 215 of 410 were signed off correctly and only
// the rest have to go. Admin only: it is a real delete and the recipients are
// not notified.
router.get(
  '/templates/:id/unreviewed-issued',
  authenticate,
  authorize(['admin']),
  certificateController.unreviewedIssued
);

router.delete(
  '/templates/:id/unreviewed-issued',
  authenticate,
  authorize(['admin']),
  certificateController.revokeUnreviewed
);

// Re-open / re-notify the round, optionally moving the deadline.
router.post(
  '/templates/:id/verifications-remind',
  authenticate,
  authorize(['admin']),
  certificateController.remindReviewers
);

module.exports = router;
