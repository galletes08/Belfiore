import { getConfiguredDeliveryQuote } from '../../../delivery.config.js';

export function getShippingQuote(details) {
  return getConfiguredDeliveryQuote(details);
}
