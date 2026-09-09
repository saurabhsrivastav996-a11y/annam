import express from 'express';
import { body } from 'express-validator';
import {
  createReport,
  listReports,
  resolveReports,
  reportSummary,
} from '../controllers/reportController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/error.js';
import { REPORT_TARGETS, REPORT_REASONS } from '../models/Report.js';

const router = express.Router();

// Anyone signed in can report content.
router.post(
  '/',
  requireAuth,
  [
    body('targetType').isIn(REPORT_TARGETS),
    body('targetId').isMongoId(),
    body('reason').optional().isIn(REPORT_REASONS),
    body('note').optional({ values: 'falsy' }).isLength({ max: 500 }),
  ],
  validate,
  createReport
);

// Everything below is the moderation queue itself.
router.use(requireAuth, requireRole('admin'));

router.get('/', listReports);
router.get('/summary', reportSummary);
router.put(
  '/resolve',
  [
    body('targetType').isIn(REPORT_TARGETS),
    body('targetId').isMongoId(),
    body('action').isIn(['hide', 'restore', 'dismiss']),
  ],
  validate,
  resolveReports
);

export default router;
