import ShopSection from '../../sections/ShopSection';
import { formatPrice, useCustomerStore } from '../../context/CustomerStore';

export default function ShopPage() {
  const { products, status, error, addToCart } = useCustomerStore();

  return (
    <ShopSection
      products={products}
      status={status}
      error={error}
      onAddToCart={addToCart}
      formatPrice={formatPrice}
    />
  );
}
