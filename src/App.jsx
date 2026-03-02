import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminProtectedRoute from './admin/AdminProtectedRoute';
import AdminLayout from './admin/AdminLayout';
import AdminLogin from './admin/AdminLogin';
import AdminDashboard from './admin/AdminDashboard';
import AdminInventory from './admin/AdminInventory';
import AdminPlaceholder from './admin/AdminPlaceholder';
import { CustomerStoreProvider } from './customer/context/CustomerStore';
import CustomerLayout from './customer/layout/CustomerLayout';
import AboutPage from './customer/pages/about/AboutPage';
import CartPage from './customer/pages/cart/CartPage';
import ContactPage from './customer/pages/contact/ContactPage';
import CheckoutPage from './customer/pages/checkout/CheckoutPage';
import HomePage from './customer/pages/home/HomePage';
import ProfilePage from './customer/pages/profile/ProfilePage';
import ShopPage from './customer/pages/shop/ShopPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Customer (public) */}
        <Route
          element={
            <CustomerStoreProvider>
              <CustomerLayout />
            </CustomerStoreProvider>
          }
        >
          <Route path="/" element={<HomePage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
        </Route>

        {/* Admin */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <AdminProtectedRoute>
              <AdminLayout />
            </AdminProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="orders" element={<AdminPlaceholder title="Orders" />} />
          <Route path="inventory" element={<AdminInventory />} />
          <Route path="customers" element={<AdminPlaceholder title="Customers" />} />
          <Route path="reports" element={<AdminPlaceholder title="Reports" />} />
          <Route path="settings" element={<AdminPlaceholder title="Settings" />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
