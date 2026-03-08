import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiProducts } from '../../api/client';

const CART_KEY = 'customerCart';
const ORDER_HISTORY_KEY = 'customerOrderHistory';
const CustomerStoreContext = createContext(null);

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

function loadOrderHistory() {
  try {
    const raw = localStorage.getItem(ORDER_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOrderHistory(items) {
  localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(items));
}

export function formatPrice(value) {
  if (!Number.isFinite(value)) return 'PHP 0.00';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
}

export function CustomerStoreProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [cartItems, setCartItems] = useState([]);
  const [orderHistory, setOrderHistory] = useState([]);

  useEffect(() => {
    setCartItems(loadCart());
    setOrderHistory(loadOrderHistory());
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

  useEffect(() => {
    saveCart(cartItems);
  }, [cartItems]);

  useEffect(() => {
    saveOrderHistory(orderHistory);
  }, [orderHistory]);

  const cartCount = useMemo(
    () => cartItems.reduce((total, item) => total + Number(item.qty || 0), 0),
    [cartItems]
  );

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0),
    [cartItems]
  );

  function addToCart(product) {
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
      return next;
    });
  }

  function increaseCartItem(id) {
    setCartItems((prev) => prev.map((item) => (item.id === id ? { ...item, qty: item.qty + 1 } : item)));
  }

  function decreaseCartItem(id) {
    setCartItems((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, qty: Math.max(1, item.qty - 1) } : item))
        .filter((item) => item.qty > 0)
    );
  }

  function removeCartItem(id) {
    setCartItems((prev) => prev.filter((item) => item.id !== id));
  }

  function clearCart() {
    setCartItems([]);
  }

  function rememberOrder(order) {
    setOrderHistory((prev) => {
      const nextOrder = {
        id: Number(order.id),
        createdAt: order.createdAt || new Date().toISOString(),
      };
      const withoutDuplicate = prev.filter((item) => Number(item.id) !== nextOrder.id);
      return [nextOrder, ...withoutDuplicate].slice(0, 20);
    });
  }

  const value = {
    products,
    status,
    error,
    cartItems,
    cartCount,
    cartTotal,
    addToCart,
    increaseCartItem,
    decreaseCartItem,
    removeCartItem,
    clearCart,
    orderHistory,
    rememberOrder,
  };

  return <CustomerStoreContext.Provider value={value}>{children}</CustomerStoreContext.Provider>;
}

export function useCustomerStore() {
  const context = useContext(CustomerStoreContext);
  if (!context) {
    throw new Error('useCustomerStore must be used inside CustomerStoreProvider');
  }
  return context;
}
