export const DEFAULT_DELIVERY_COUNTRY = 'Philippines';
export const DEFAULT_DELIVERY_COUNTRY_CODE = 'PH';

export function buildDeliveryLocation(parts) {
  const orderedParts = [
    parts.streetAddress,
    parts.barangay,
    parts.city,
    parts.province,
    parts.zipCode,
    parts.country,
  ];

  return orderedParts
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
}
