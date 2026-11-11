/**
 * lib/utils/validation.js — Central input validation and error-handling helpers.
 *
 * Import from route handlers to get consistent, safe error responses that never
 * leak raw SQL, table names, or Sequelize internals to the client.
 */
import { NextResponse } from 'next/server';

// ── ID helpers ────────────────────────────────────────────────────────────────

/**
 * Returns true if `id` is a positive integer (number or numeric string).
 */
export function isValidId(id) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0;
}

/**
 * Parses `id` and returns a positive integer, or null if invalid.
 */
export function parsePositiveId(id) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Returns true if `value` is a strict YYYY-MM-DD date string that
 * actually represents a valid calendar date.
 */
export function isValidDateOnly(value) {
  if (!value || typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

// ── Domain helpers ────────────────────────────────────────────────────────────

const VALID_PATIENT_TYPES = new Set(['pregnant', 'immunization', 'both']);
const VALID_PAYMENT_METHODS = new Set(['UPI', 'Cash', 'Bank Transfer', 'Cheque', 'Card', 'Net Banking', 'Other']);

/**
 * Returns true if `type` is a valid patient type.
 */
export function isValidPatientType(type) {
  return typeof type === 'string' && VALID_PATIENT_TYPES.has(type);
}

/**
 * Returns true if `amount` is a finite positive number.
 * Accepts both numbers and numeric strings.
 */
export function isValidPaymentAmount(amount) {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0;
}

/**
 * Returns true if `method` is in the allowed payment methods list.
 * Pass `null` / `undefined` to skip validation (optional field).
 */
export function isValidPaymentMethod(method) {
  if (method == null) return true;
  return typeof method === 'string' && VALID_PAYMENT_METHODS.has(method);
}

// ── Pagination helper ─────────────────────────────────────────────────────────

/**
 * Parse and clamp pagination query parameters from a URLSearchParams instance.
 *
 * @param {URLSearchParams} searchParams
 * @param {number} [defaultLimit=20]  — rows per page when not specified
 * @param {number} [maxLimit=100]     — hard upper cap; prevents unbounded queries
 * @returns {{ page: number, limit: number, offset: number }}
 */
export function parsePagination(searchParams, defaultLimit = 20, maxLimit = 100) {
  let page  = parseInt(searchParams.get('page')  || '1', 10);
  let limit = parseInt(searchParams.get('limit') || String(defaultLimit), 10);

  if (!Number.isFinite(page)  || page  < 1) page  = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit)                     limit = maxLimit;

  return { page, limit, offset: (page - 1) * limit };
}

// ── Centralised API error handler ─────────────────────────────────────────────

/**
 * Convert any caught error into a safe JSON HTTP response.
 *
 * Rules:
 *  • SequelizeValidationError     → 400 with clean field messages (no SQL)
 *  • SequelizeUniqueConstraintError → 409 with field-specific duplicate message
 *  • SequelizeForeignKeyConstraintError → 400 without schema details
 *  • errors with a `.status` property (thrown manually) → that status code
 *  • everything else → 500 with `fallbackMessage`; full error logged server-side
 *
 * @param {unknown} err             — the caught error
 * @param {string}  fallbackMessage — human-readable message for unexpected errors
 * @param {string}  [logPrefix]     — optional prefix for server-side console.error
 * @returns {NextResponse}
 */
export function handleApiError(err, fallbackMessage = 'An unexpected error occurred', logPrefix = '') {
  // Manually thrown errors with an explicit HTTP status
  if (err && typeof err.status === 'number') {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }

  const name = err?.name || '';

  if (name === 'SequelizeValidationError') {
    // Collect field-level messages without exposing raw SQL
    const messages = (err.errors || []).map(e => `${e.path}: ${e.message}`);
    return NextResponse.json(
      { error: 'Validation failed', details: messages },
      { status: 400 }
    );
  }

  if (name === 'SequelizeUniqueConstraintError') {
    const field = err.errors?.[0]?.path || 'field';
    return NextResponse.json(
      { error: `A record with this ${field} already exists` },
      { status: 409 }
    );
  }

  if (name === 'SequelizeForeignKeyConstraintError') {
    return NextResponse.json(
      { error: 'Referenced record does not exist or cannot be deleted because other records depend on it' },
      { status: 400 }
    );
  }

  if (name === 'SequelizeDatabaseError' || name?.startsWith('Sequelize')) {
    // Log the full details server-side but do NOT send raw SQL to the client
    console.error(`${logPrefix} DB error:`, err.message);
    return NextResponse.json({ error: fallbackMessage }, { status: 500 });
  }

  console.error(`${logPrefix}`, err);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

