import CheckoutSection from '../../sections/CheckoutSection';
import { formatPrice, useCustomerStore } from '../../context/CustomerStore';
import { apiPlaceOrder } from '../../../api/client';

export default function CheckoutPage() {
  const { cartItems, cartTotal, clearCart } = useCustomerStore();

  async function placeOrder(payload) {
    return apiPlaceOrder(payload);
  }

  return (
    <CheckoutSection
      items={cartItems}
      total={cartTotal}
      formatPrice={formatPrice}
      onOrderPlaced={clearCart}
      onPlaceOrder={placeOrder}
    />
  );
}
