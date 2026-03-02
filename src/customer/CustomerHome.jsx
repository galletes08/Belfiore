import { useEffect, useMemo, useState } from 'react';
import { apiProducts } from '../api/client';
import CustomerFooter from './components/CustomerFooter';
import CustomerNav from './components/CustomerNav';
import AboutSection from './sections/AboutSection';
import CartSection from './sections/CartSection';
import ContactSection from './sections/ContactSection';
import HomeSection from './sections/HomeSection';
import ShopSection from './sections/ShopSection';

const CART_KEY = 'customerCart';

function formatPrice(value) {
  if (!Number.isFinite(value)) return 'PHP 0.00';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
}

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export default function CustomerHome() {
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [cartItems, setCartItems] = useState([]);

  useEffect(() => {
    setCartItems(loadCart());
  }, []);

  useEffect(() => {
    let mounted = true;
    setStatus('loading');
    apiProducts()
      .then((data) => {
        if (!mounted) return;
        setProducts(Array.isArray(data) ? data : []);
        setStatus('success');
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.message || 'Unable to load products.');
        setStatus('error');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const cartCount = useMemo(
    () => cartItems.reduce((total, item) => total + Number(item.qty || 0), 0),
    [cartItems]
  );

  function handleAddToCart(product) {
    setCartItems((prev) => {
      const next = [...prev];
      const index = next.findIndex((item) => item.id === product.id);
      if (index >= 0) {
        next[index] = { ...next[index], qty: next[index].qty + 1 };
      } else {
        next.push({
          id: product.id,
          name: product.name,
          price: product.price,
          imageUrl: product.imageUrl,
          qty: 1,
        });
      }
      saveCart(next);
      return next;
    });
  }

  function handleIncrease(id) {
    setCartItems((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, qty: item.qty + 1 } : item));
      saveCart(next);
      return next;
    });
  }

  function handleDecrease(id) {
    setCartItems((prev) => {
      const next = prev
        .map((item) => (item.id === id ? { ...item, qty: Math.max(1, item.qty - 1) } : item))
        .filter((item) => item.qty > 0);
      saveCart(next);
      return next;
    });
  }

  function handleRemove(id) {
    setCartItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveCart(next);
      return next;
    });
  }

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0),
    [cartItems]
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f6f4ef] via-white to-[#f1efe8] text-[#1f2f28]">
      <div className="bg-[#0b7a3c] text-white text-xs sm:text-sm tracking-[0.2em] uppercase text-center py-2">
        Free shipping on orders over PHP 2,000
      </div>

      <CustomerNav cartCount={cartCount} />

      <main className="border-t border-[#d8dfd3]">
        <HomeSection />
        <ShopSection
          products={products}
          status={status}
          error={error}
          onAddToCart={handleAddToCart}
          formatPrice={formatPrice}
        />
        <CartSection
          items={cartItems}
          onIncrease={handleIncrease}
          onDecrease={handleDecrease}
          onRemove={handleRemove}
          formatPrice={formatPrice}
          total={cartTotal}
        />
        <AboutSection />
        <ContactSection />
      </main>

      <CustomerFooter />
    </div>
  );
}
