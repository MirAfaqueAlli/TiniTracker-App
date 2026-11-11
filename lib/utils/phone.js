/**
 * Normalize a WhatsApp number to the canonical +91XXXXXXXXXX format.
 * Returns null when the input does not contain a usable 10-digit local number.
 */
export function normalizeWhatsappNumber(value) {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, '');
  const last10 = digits.slice(-10);
  return last10.length === 10 ? `+91${last10}` : null;
}

export function isValidWhatsappNumber(value) {
  return normalizeWhatsappNumber(value) !== null;
}
