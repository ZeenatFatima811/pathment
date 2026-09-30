const express = require('express');
const router = express.Router();
const c = require('../controllers/clanRequestsController');
const { authenticate } = require('../middlewares/auth');
const { requirePermission, requirePermissionMinScope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');
const authzService = require('../services/authzService');
const { models } = require('../db');
const standing = require('../services/standingClanService');
const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');

router.get('/standing/eligible-programs', authenticate, catchAsync(async (req, res) => res.json(successResponse('Eligible programs', await standing.eligiblePrograms(req.user)))));
router.get('/standing', authenticate, catchAsync(async (req, res) => res.json(successResponse('Standing clan requests', await standing.list(req.user)))));
router.post('/standing', authenticate, catchAsync(async (req, res) => res.status(201).json(successResponse('Request submitted', await standing.request(req.body, req.user)))));
router.post('/standing/:id/decision', authenticate, catchAsync(async (req, res) => res.json(successResponse('Decision recorded', await standing.decide(req.params.id, req.body.decision, req.body.note, req.user)))));

const adminOnly = [authenticate, requirePermissionMinScope(PERMISSIONS.CLAN_MANAGE_MEMBERS)];
// Clan-scoped: admins (org) pass anywhere; a LEAD MENTOR passes for their own clan.
const onTargetClan = (getClanId) => requirePermission(
  PERMISSIONS.CLAN_MANAGE_MEMBERS,
  async (req) => authzService.scopeOfClan(await getClanId(req))
);

router.get('/', adminOnly, c.overview);

// Change requests: a mentee may create one; admin resolves.
router.post('/requests', authenticate, c.createRequest);
router.patch('/requests/:id/resolve', adminOnly, c.resolveRequest);

// The covering person's own surface: see + accept/decline cover requests for them.
router.get('/cross-clan/mine', authenticate, c.listMyCrossClan);
router.post('/cross-clan/:id/respond', authenticate, c.respondCrossClan);

// Cross-clan: admins manage org-wide; a clan's lead mentor manages cover for THEIR clan.
router.get('/cross-clan', authenticate, onTargetClan((req) => req.query.clanId), c.listCrossClan);
router.post('/cross-clan', authenticate, onTargetClan((req) => req.body.toClanId), c.createCrossClan);
router.delete('/cross-clan/:id', authenticate, onTargetClan(async (req) => {
  const a = await models.CrossClanAssignment.findByPk(req.params.id);
  return a ? a.toClanId : null;
}), c.removeCrossClan);

module.exports = router;
