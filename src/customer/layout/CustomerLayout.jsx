import { Outlet } from 'react-router-dom';
import CustomerFooter from '../components/CustomerFooter';
import CustomerNav from '../components/CustomerNav';
import { useCustomerStore } from '../context/CustomerStore';

export default function CustomerLayout() {
  const { cartCount, cartItems } = useCustomerStore();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f6f4ef] via-white to-[#f1efe8] text-[#1f2f28]">
      <div className="bg-[#0b7a3c] text-white text-xs sm:text-sm tracking-[0.2em] uppercase text-center py-2">
        Free shipping on orders over PHP 2,000
      </div>

      <CustomerNav cartCount={cartCount} cartItems={cartItems} />

      <main className="border-t border-[#d8dfd3]">
        <Outlet />
      </main>

      <CustomerFooter />
    </div>
  );
}
