const express = require('express');
const router = express.Router();
const programController = require('../controllers/programController');
const { authenticate, authorize, optionalAuth } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const programValidation = require('../validations/programValidation');
const lifecycle = require('../services/programLifecycleService');
const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');

router.get('/:id/completion', authenticate, catchAsync(async (req, res) => {
  res.json(successResponse('Program completion', await lifecycle.preview(req.params.id, req.user)));
}));
router.post('/:id/close', authenticate, catchAsync(async (req, res) => {
  res.json(successResponse('Program closed', await lifecycle.closeProgram(req.params.id, req.user)));
}));
router.post('/:id/reopen', authenticate, catchAsync(async (req, res) => {
  res.json(successResponse('Program reopened', await lifecycle.reopenProgram(req.params.id, req.body.reason, req.user)));
}));
router.get('/:id/results', authenticate, catchAsync(async (req, res) => {
  res.json(successResponse('Final results', await lifecycle.results(req.params.id, req.user)));
}));

/**
 * @route   GET /api/programs
 * @desc    Get all programs with filters
 * @access  Public (published), Admin/Creator (all)
 */
router.get(
  '/',
  optionalAuth,
  validate(programValidation.getProgramsFilters, 'query'),
  programController.getPrograms
);

/**
 * @route   GET /api/programs/:id
 * @desc    Get program by ID
 * @access  Public (published), Admin/Creator (all)
 */
router.get(
  '/:id',
  optionalAuth,
  programController.getProgramById
);

/**
 * @route   GET /api/programs/:id/stats
 * @desc    Get program statistics
 * @access  Admin, Creator
 */
router.get(
  '/:id/stats',
  authenticate,
  programController.getProgramStats
);

/**
 * @route   GET /api/programs/:id/enrollments
 * @desc    Get program enrollments
 * @access  Admin, Creator
 */
router.get(
  '/:id/enrollments',
  authenticate,
  programController.getProgramEnrollments
);

/**
 * @route   POST /api/programs
 * @desc    Create a new program
 * @access  Admin, Mentor
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'mentor'),
  validate(programValidation.createProgram),
  programController.createProgram
);

/**
 * @route   POST /api/programs/:id/enroll
 * @desc    Enroll in a program
 * @access  Mentee
 */
router.post(
  '/:id/enroll',
  authenticate,
  authorize('mentee'),
  programController.enrollInProgram
);

/**
 * @route   POST /api/programs/:id/clone
 * @desc    Clone a program
 * @access  Admin, Mentor
 */
router.post(
  '/:id/clone',
  authenticate,
  authorize('admin', 'mentor'),
  validate(programValidation.cloneProgram),
  programController.cloneProgram
);

/**
 * @route   PUT /api/programs/:id
 * @desc    Update a program
 * @access  Admin, Creator
 */
router.put(
  '/:id',
  authenticate,
  validate(programValidation.updateProgram),
  programController.updateProgram
);

/**
 * @route   DELETE /api/programs/:id
 * @desc    Delete a program
 * @access  Admin, Creator
 */
router.delete(
  '/:id',
  authenticate,
  programController.deleteProgram
);

module.exports = router;
