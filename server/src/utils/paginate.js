/**
 * Cursor pagination for list endpoints.
 *
 * Offset paging (`skip`) drifts when rows are inserted mid-scroll — a busy
 * orders list would show the same record twice, or skip one. Paging from the
 * last id seen is stable under writes, and stays fast because it rides the
 * existing index instead of counting past N documents.
 *
 * Cursors are opaque to callers: pass back whatever `nextCursor` was returned.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Clamps a caller-supplied limit into something sane. */
export function pageSize(value, fallback = DEFAULT_LIMIT) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/**
 * Filter fragment for "everything after this cursor", assuming a descending
 * `_id` sort. MongoDB ids are monotonic, so this doubles as newest-first.
 */
export function cursorFilter(cursor) {
  if (!cursor || !/^[a-f\d]{24}$/i.test(String(cursor))) return {};
  return { _id: { $lt: cursor } };
}

/**
 * Wraps a page of results. Fetch `limit + 1` rows and pass them in: the extra
 * row is how we know another page exists without a second count query.
 */
export function pageResult(rows, limit) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  return {
    items,
    nextCursor: hasMore && last ? String(last._id) : null,
    hasMore,
  };
}
