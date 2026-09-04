export const DELIVERY_CONFIG = Object.freeze({
  country: 'Philippines',
  province: 'Laguna',
  freeShippingThreshold: 2000, // Set to null to disable the existing free-shipping offer.
  // Add barangays or postalCodes arrays to an area when coverage must be narrower than the whole city.
  localAreas: [
    { city: 'Calamba', aliases: ['Calamba City', 'City of Calamba'], fee: 80 },
    { city: 'Cabuyao', aliases: ['Cabuyao City', 'City of Cabuyao'], fee: 100 },
    { city: 'Los Baños', aliases: ['Los Banos', 'Municipality of Los Baños'], fee: 120 },
    { city: 'Santa Rosa', aliases: ['Santa Rosa City', 'City of Santa Rosa'], fee: 150 },
  ],
  standardCourier: {
    name: 'Standard Courier Delivery',
    options: ['J&T Express', 'LBC', 'Other available courier'],
    pricingStrategy: 'manual',
  },
});

function normalizeAddressPart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function matchesOne(value, expectedValues) {
  const normalizedValue = normalizeAddressPart(value);
  return expectedValues.some((expected) => normalizeAddressPart(expected) === normalizedValue);
}

export function findLocalDeliveryArea({ country, province, city, barangay, postalCode }) {
  if (!matchesOne(country, [DELIVERY_CONFIG.country, 'PH'])) return null;
  if (!matchesOne(province, [DELIVERY_CONFIG.province, `Province of ${DELIVERY_CONFIG.province}`])) return null;

  return DELIVERY_CONFIG.localAreas.find((area) => {
    if (!matchesOne(city, [area.city, ...(area.aliases || [])])) return false;
    if (area.barangays?.length && !matchesOne(barangay, area.barangays)) return false;
    if (area.postalCodes?.length && !matchesOne(postalCode, area.postalCodes)) return false;
    return true;
  }) || null;
}

// Replace this implementation when J&T/LBC rate APIs or a rate table are available.
export function calculateStandardCourierFee(details) {
  void details;
  return null;
}

export function getConfiguredDeliveryQuote({
  country,
  province,
  city,
  barangay,
  postalCode,
  subtotal,
  parcelWeightKg = null,
}) {
  const numericSubtotal = Math.max(0, Number(subtotal) || 0);
  const numericWeight = Number(parcelWeightKg);
  const normalizedWeight = Number.isFinite(numericWeight) && numericWeight > 0 ? numericWeight : null;

  if (!String(country || '').trim() || !String(province || '').trim() || !String(city || '').trim()) {
    return {
      courierName: '',
      deliveryMethod: '',
      deliveryMode: '',
      fee: null,
      isConfirmed: false,
      isLocalDelivery: false,
      status: 'To be confirmed',
      parcelWeightKg: normalizedWeight,
      message: 'Complete the delivery location to see the delivery method and shipping fee.',
      trackingMessage: '',
    };
  }

  const localArea = findLocalDeliveryArea({ country, province, city, barangay, postalCode });
  if (localArea) {
    const qualifiesForFreeShipping = Number.isFinite(DELIVERY_CONFIG.freeShippingThreshold)
      && numericSubtotal >= DELIVERY_CONFIG.freeShippingThreshold;

    return {
      courierName: 'Belfiore Local Delivery',
      deliveryMethod: 'Belfiore Local Delivery',
      deliveryMode: 'rider',
      fee: qualifiesForFreeShipping ? 0 : localArea.fee,
      baseFee: localArea.fee,
      isConfirmed: true,
      isLocalDelivery: true,
      status: 'Confirmed',
      localArea: localArea.city,
      parcelWeightKg: normalizedWeight,
      message: 'Your address is within our local delivery area.',
      trackingMessage: 'Live GPS tracking available once the rider starts delivery.',
    };
  }

  const courierFee = calculateStandardCourierFee({
    country,
    province,
    city,
    barangay,
    postalCode,
    parcelWeightKg: normalizedWeight,
    subtotal: numericSubtotal,
  });

  return {
    courierName: DELIVERY_CONFIG.standardCourier.name,
    deliveryMethod: DELIVERY_CONFIG.standardCourier.name,
    deliveryMode: 'logistics',
    courierOptions: DELIVERY_CONFIG.standardCourier.options,
    fee: courierFee,
    isConfirmed: courierFee != null,
    isLocalDelivery: false,
    status: courierFee == null ? 'To be confirmed' : 'Confirmed',
    parcelWeightKg: normalizedWeight,
    message: "Your address is outside Belfiore's local rider coverage.",
    trackingMessage: 'Tracking information will be available after shipment.',
  };
}
