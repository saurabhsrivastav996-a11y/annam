import mongoose from 'mongoose';

export const REPORT_TARGETS = ['reel', 'review'];
export const REPORT_REASONS = ['inappropriate', 'misleading', 'spam', 'not-food', 'offensive', 'other'];
export const REPORT_STATUSES = ['open', 'actioned', 'dismissed'];

/**
 * A user flagging a piece of content for an admin to look at.
 *
 * One row per person per target — the unique index stops one account filing
 * the same complaint repeatedly to make something look worse than it is, while
 * still letting genuinely separate people pile onto the same item, which is
 * the signal moderation actually wants.
 */
const reportSchema = new mongoose.Schema(
  {
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: REPORT_TARGETS, required: true },
    // Reel id, or the Order id carrying the review.
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },

    reason: { type: String, enum: REPORT_REASONS, default: 'other' },
    note: { type: String, maxlength: 500 },

    status: { type: String, enum: REPORT_STATUSES, default: 'open', index: true },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: Date,
    resolution: String,
  },
  { timestamps: true }
);

reportSchema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true });
reportSchema.index({ targetType: 1, targetId: 1 });

export default mongoose.model('Report', reportSchema);
