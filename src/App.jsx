import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter as Router, Navigate, Outlet, Route, Routes } from "react-router-dom";
import AdminProtectedRoute from "./admin/AdminProtectedRoute";
import Navbar from "./components/Navbar";
import Footer from "./components/Footerlink/Footer";
import NewVisitorSignup from "./components/NewVisitorSignup";
import ScrollToTop from "./components/ScrollToTop";
import Home from "./components/Pages/Home";
import CustomerProtectedRoute from "./components/Signup/CustomerProtectedRoute";
import RiderProtectedRoute from "./rider/RiderProtectedRoute";
import plantsImage from "./assets/Plants.jpg";
import { getImageUrl } from "./api/client";
import {
  clearCustomerCart,
  hasAuthenticatedCustomer,
  isLettuceProduct,
  loadCustomerCart,
  saveCustomerCart
} from "./utils/customerCart";
import { savePlacedOrder } from "./utils/customerOrders";

const About = lazy(() => import("./components/Pages/About"));
const Contact = lazy(() => import("./components/Pages/Contact"));
const Products = lazy(() => import("./components/Pages/Products"));
const ProductDetail = lazy(() => import("./components/Pages/ProductDetail"));
const CheckoutPage = lazy(() => import("./components/Pages/CheckoutPage"));
const Login = lazy(() => import("./components/Signup/Login"));
const Signup = lazy(() => import("./components/Signup/Signup"));
const ForgotPassword = lazy(() => import("./components/Signup/ForgotPassword"));
const UserDashboard = lazy(() => import("./components/Signup/UserDashboard"));
const UserAccountPage = lazy(() => import("./components/Signup/User"));
const Addresses = lazy(() => import("./components/Signup/Addresses"));
const AccountSettings = lazy(() => import("./components/Signup/AccountSettings"));
const Order = lazy(() => import("./components/Signup/Order"));
const AdminDashboard = lazy(() => import("./admin/AdminDashboard"));
const AdminCustomers = lazy(() => import("./admin/AdminCustomers"));
const AdminInventory = lazy(() => import("./admin/AdminInventory"));
const AdminLayout = lazy(() => import("./admin/AdminLayout"));
const AdminLogin = lazy(() => import("./admin/AdminLogin"));
const AdminOrders = lazy(() => import("./admin/AdminOrders"));
const AdminReports = lazy(() => import("./admin/AdminReports"));
const AdminRiders = lazy(() => import("./admin/AdminRiders"));
const DriverOrderPage = lazy(() => import("./driver/DriverOrderPage"));
const RiderHomePage = lazy(() => import("./rider/RiderHomePage"));
const RiderLayout = lazy(() => import("./rider/RiderLayout"));
const RiderProfilePage = lazy(() => import("./rider/RiderProfilePage"));

const parsePrice = (value) => Number(String(value).replace(/[^\d.]/g, ""));
function App() {
  const [cartItems, setCartItems] = useState(loadCustomerCart);
  const [isCustomerLoggedIn, setIsCustomerLoggedIn] = useState(hasAuthenticatedCustomer);

  useEffect(() => {
    saveCustomerCart(cartItems);
  }, [cartItems]);

  useEffect(() => {
    const syncCustomerCart = () => {
      const authenticated = hasAuthenticatedCustomer();
      setIsCustomerLoggedIn(authenticated);
      setCartItems(authenticated ? loadCustomerCart() : []);
    };

    window.addEventListener("belfiore-customer-session-changed", syncCustomerCart);
    window.addEventListener("storage", syncCustomerCart);
    return () => {
      window.removeEventListener("belfiore-customer-session-changed", syncCustomerCart);
      window.removeEventListener("storage", syncCustomerCart);
    };
  }, []);

  const handleAddToCart = (product, quantity = 1) => {
    if (!hasAuthenticatedCustomer()) {
      window.location.assign("/login");
      return false;
    }

    const safeQuantity = Number(quantity) > 0 ? Number(quantity) : 1;
    const productPrice = parsePrice(product.price);
    const resolvedImage = product.image && product.image !== "#" ? product.image : getImageUrl(product.imageUrl);
    const productImage = resolvedImage || plantsImage;
    const allowsMultipleQuantity = isLettuceProduct(product);
    const availableStock = Number(product.stock);
    const requestedQuantity = allowsMultipleQuantity ? safeQuantity : 1;
    const cartQuantity =
      allowsMultipleQuantity && Number.isFinite(availableStock) && availableStock > 0
        ? Math.min(requestedQuantity, availableStock)
        : requestedQuantity;

    setCartItems((previous) => {
      const existingItem = previous.find((item) => item.id === product.id);

      if (existingItem) {
        return previous.map((item) =>
          item.id === product.id
            ? {
                ...item,
                qty: allowsMultipleQuantity
                  ? Number.isFinite(availableStock) && availableStock > 0
                    ? Math.min(item.qty + cartQuantity, availableStock)
                    : item.qty + cartQuantity
                  : 1,
                allowsMultipleQuantity
              }
            : item
        );
      }

      return [
        ...previous,
        {
          id: product.id,
          name: product.name,
          price: productPrice,
          qty: cartQuantity,
          stock: product.stock,
          category: product.category || "",
          tag: product.tag || "",
          allowsMultipleQuantity,
          image: productImage,
          imageUrl: product.imageUrl || null
        }
      ];
    });
  };

  const handleIncreaseQty = (itemId) => {
    setCartItems((previous) =>
      previous.map((item) => {
        if (item.id !== itemId || !item.allowsMultipleQuantity) return item;
        const availableStock = Number(item.stock);
        const nextQuantity =
          Number.isFinite(availableStock) && availableStock > 0
            ? Math.min(item.qty + 1, availableStock)
            : item.qty + 1;
        return { ...item, qty: nextQuantity };
      })
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
    clearCustomerCart();
    setCartItems([]);
  };

  const customerLayout = (
    <div className="min-h-screen flex flex-col bg-white text-black">
      <Navbar
        cartItems={cartItems}
        isCustomerLoggedIn={isCustomerLoggedIn}
        onIncreaseQty={handleIncreaseQty}
        onDecreaseQty={handleDecreaseQty}
        onRemoveItem={handleRemoveItem}
        onCheckout={handleCheckout}
      />
      <div className="flex-1 flex flex-col">
        <Outlet />
      </div>
      <Footer />
      <NewVisitorSignup />
    </div>
  );

  return (
    <Router>
      <ScrollToTop />
      <Suspense
        fallback={
          <div className="grid min-h-[45vh] place-items-center bg-[#f8faf6] px-6 text-center text-sm font-semibold text-[#0f4d2e]" role="status">
            Loading Belfiore…
          </div>
        }
      >
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
            element={
              <CustomerProtectedRoute>
                <CheckoutPage cartItems={cartItems} onOrderPlaced={handleOrderPlaced} />
              </CustomerProtectedRoute>
            }
          />
          <Route path="/dashboard" element={<CustomerProtectedRoute><UserDashboard /></CustomerProtectedRoute>} />
          <Route path="/orders" element={<CustomerProtectedRoute><Order /></CustomerProtectedRoute>} />
          <Route path="/profile" element={<CustomerProtectedRoute><UserAccountPage /></CustomerProtectedRoute>} />
          <Route path="/account-details" element={<CustomerProtectedRoute><UserAccountPage /></CustomerProtectedRoute>} />
          <Route path="/addresses" element={<CustomerProtectedRoute><Addresses /></CustomerProtectedRoute>} />
          <Route path="/banks-cards" element={<CustomerProtectedRoute><AccountSettings section="cards" /></CustomerProtectedRoute>} />
          <Route path="/change-password" element={<CustomerProtectedRoute><AccountSettings section="password" /></CustomerProtectedRoute>} />
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
          <Route path="profile" element={<RiderProfilePage />} />
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
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="reports" element={<AdminReports />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
