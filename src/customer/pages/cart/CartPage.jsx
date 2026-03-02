import { useNavigate } from 'react-router-dom';
import CartSection from '../../sections/CartSection';
import { formatPrice, useCustomerStore } from '../../context/CustomerStore';

export default function CartPage() {
  const navigate = useNavigate();
  const { cartItems, cartTotal, increaseCartItem, decreaseCartItem, removeCartItem } = useCustomerStore();

  return (
    <CartSection
      items={cartItems}
      onIncrease={increaseCartItem}
      onDecrease={decreaseCartItem}
      onRemove={removeCartItem}
      onCheckout={() => navigate('/checkout')}
      formatPrice={formatPrice}
      total={cartTotal}
    />
  );
}
