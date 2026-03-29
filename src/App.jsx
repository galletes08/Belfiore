import { useState } from "react";
import { BrowserRouter as Router, Navigate, Outlet, Route, Routes } from "react-router-dom";
import AdminDashboard from "./admin/AdminDashboard";
import AdminInventory from "./admin/AdminInventory";
import AdminLayout from "./admin/AdminLayout";
import AdminLogin from "./admin/AdminLogin";
import AdminOrders from "./admin/AdminOrders";
import AdminPlaceholder from "./admin/AdminPlaceholder";
import AdminProtectedRoute from "./admin/AdminProtectedRoute";
import AdminRiders from "./admin/AdminRiders";
import Navbar from "./components/Navbar";
import Footer from "./components/Footerlink/Footer";
import ScrollToTop from "./components/ScrollToTop";
import Home from "./components/Pages/Home";
import Login from "./components/Signup/Login";
import CustomerProtectedRoute from "./components/Signup/CustomerProtectedRoute";
import About from "./components/Pages/About";
import Contact from "./components/Pages/Contact";
import Signup from "./components/Signup/Signup";
import ForgotPassword from "./components/Signup/ForgotPassword";
import Products from "./components/Pages/Products";
import ProductDetail from "./components/Pages/ProductDetail";
import CheckoutPage from "./components/Pages/CheckoutPage";
import UserDashboard from "./components/Signup/UserDashboard";
import UserAccountPage from "./components/Signup/User";
import Order from "./components/Signup/Order";
import DriverOrderPage from "./driver/DriverOrderPage";
import RiderHomePage from "./rider/RiderHomePage";
import RiderLayout from "./rider/RiderLayout";
import RiderProtectedRoute from "./rider/RiderProtectedRoute";
import plantsImage from "./assets/Plants.jpg";
import { getImageUrl } from "./api/client";
import { savePlacedOrder } from "./utils/customerOrders";

const parsePrice = (value) => Number(String(value).replace(/[^\d.]/g, ""));

function App() {
  const [cartItems, setCartItems] = useState([]);

  const handleAddToCart = (product, quantity = 1) => {
    const safeQuantity = Number(quantity) > 0 ? Number(quantity) : 1;
    const productPrice = parsePrice(product.price);
    const resolvedImage = product.image && product.image !== "#" ? product.image : getImageUrl(product.imageUrl);
    const productImage = resolvedImage || plantsImage;

    setCartItems((previous) => {
      const existingItem = previous.find((item) => item.id === product.id);

      if (existingItem) {
        return previous.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + safeQuantity } : item
        );
      }

      return [
        ...previous,
        {
          id: product.id,
          name: product.name,
          price: productPrice,
          qty: safeQuantity,
          image: productImage
        }
      ];
    });
  };

  const handleIncreaseQty = (itemId) => {
    setCartItems((previous) =>
      previous.map((item) => (item.id === itemId ? { ...item, qty: item.qty + 1 } : item))
    );
  };

  const handleDecreaseQty = (itemId) => {
    setCartItems((previous) =>
      previous
        .map((item) => (item.id === itemId ? { ...item, qty: item.qty - 1 } : item))
        .filter((item) => item.qty > 0)
    );
  };

  const handleRemoveItem = (itemId) => {
    setCartItems((previous) => previous.filter((item) => item.id !== itemId));
  };

  const handleCheckout = () => {
    if (cartItems.length === 0) {
      return false;
    }
    return true;
  };

  const handleOrderPlaced = (order) => {
    savePlacedOrder(order);
    setCartItems([]);
  };

  const customerLayout = (
    <div className="min-h-screen flex flex-col bg-white text-black">
      <Navbar
        cartItems={cartItems}
        onIncreaseQty={handleIncreaseQty}
        onDecreaseQty={handleDecreaseQty}
        onRemoveItem={handleRemoveItem}
        onCheckout={handleCheckout}
      />
      <div className="flex-1 flex flex-col">
        <Outlet />
      </div>
      <Footer />
    </div>
  );

  return (
    <Router>
      <ScrollToTop />
      <Routes>
        <Route element={customerLayout}>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/login" element={<Login />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/products" element={<Products onAddToCart={handleAddToCart} />} />
          <Route path="/product/:id" element={<ProductDetail onAddToCart={handleAddToCart} />} />
          <Route
            path="/checkout"
            element={<CheckoutPage cartItems={cartItems} onOrderPlaced={handleOrderPlaced} />}
          />
          <Route path="/dashboard" element={<CustomerProtectedRoute><UserDashboard /></CustomerProtectedRoute>} />
          <Route path="/orders" element={<CustomerProtectedRoute><Order /></CustomerProtectedRoute>} />
          <Route path="/profile" element={<CustomerProtectedRoute><UserAccountPage /></CustomerProtectedRoute>} />
          <Route path="/account-details" element={<CustomerProtectedRoute><UserAccountPage /></CustomerProtectedRoute>} />
        </Route>

        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/rider/login" element={<AdminLogin />} />
        <Route path="/driver/:token" element={<DriverOrderPage />} />
        <Route
          path="/rider"
          element={
            <RiderProtectedRoute>
              <RiderLayout />
            </RiderProtectedRoute>
          }
        >
          <Route index element={<RiderHomePage />} />
          <Route path="delivery/:token" element={<DriverOrderPage />} />
        </Route>
        <Route
          path="/admin"
          element={
            <AdminProtectedRoute>
              <AdminLayout />
            </AdminProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="riders" element={<AdminRiders />} />
          <Route path="inventory" element={<AdminInventory />} />
          <Route path="customers" element={<AdminPlaceholder title="Customers" />} />
          <Route path="reports" element={<AdminPlaceholder title="Reports" />} />
          <Route path="settings" element={<AdminPlaceholder title="Settings" />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
