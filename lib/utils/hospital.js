/**
 * Safe hospital serializers. Never expose whatsapp_api_key in broad responses.
 */

function plain(hospital) {
  if (!hospital) return null;
  return typeof hospital.get === 'function'
    ? hospital.get({ plain: true })
    : hospital;
}

/** Minimal hospital info safe for login / session payloads. */
export function toPublicHospital(hospital) {
  const h = plain(hospital);
  if (!h) return null;
  return {
    id:         h.id,
    name:       h.name,
    address:    h.address,
    phone:      h.phone,
    is_blocked: Boolean(h.is_blocked),
  };
}

/**
 * Hospital summary for settings/list APIs.
 * The API key is always omitted. The endpoint URL is only included when the
 * caller is an administrator of that hospital.
 */
export function toHospitalSummary(hospital, { includeWhatsappUrl = false } = {}) {
  const h = plain(hospital);
  if (!h) return null;

  const summary = {
    id:                    h.id,
    name:                  h.name,
    address:               h.address,
    phone:                 h.phone,
    is_blocked:            Boolean(h.is_blocked),
    whatsapp_sender_id:    h.whatsapp_sender_id ?? null,
    whatsapp_api_provider: h.whatsapp_api_provider ?? null,
    whatsapp_configured:   Boolean(h.whatsapp_api_url && h.whatsapp_api_key),
  };

  if (includeWhatsappUrl) {
    summary.whatsapp_api_url = h.whatsapp_api_url ?? null;
  }

  return summary;
}
