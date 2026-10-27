import {cartLineId} from '../shared/cartIdentity';
import {flyToCart} from './utils/flyToCart';
import { Component, lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter as Router, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { CheckCircle2, X } from "lucide-react";
import AdminProtectedRoute from "./admin/AdminProtectedRoute";
const StaffPortal = lazy(() => import('./staff/StaffPortal'));
const AdminStaff = lazy(() => import('./admin/AdminStaff'));
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
const VerificationPending = lazy(() => import('./components/Signup/VerificationPending'));
const PolicyPage = lazy(() => import('./components/Signup/PolicyPage'));
const VerifyEmail = lazy(() => import("./components/Signup/VerifyEmail"));
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
const RiderPasswordChange = lazy(() => import("./rider/RiderPasswordChange"));
const PasswordRecovery = lazy(() => import("./admin/PasswordRecovery"));
const AdminOrders = lazy(() => import("./admin/AdminOrders"));
const AdminReports = lazy(() => import("./admin/AdminReports"));
const AdminLogs = lazy(() => import("./admin/AdminLogs"));
const AdminRiders = lazy(() => import("./admin/AdminRiders"));
const DriverOrderPage = lazy(() => import("./driver/DriverOrderPage"));
const RiderHomePage = lazy(() => import("./rider/RiderHomePage"));
const RiderLayout = lazy(() => import("./rider/RiderLayout"));
const RiderProfilePage = lazy(() => import("./rider/RiderProfilePage"));

class ReportsErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-[60vh] place-items-center bg-[#f8faf6] px-6 py-12">
          <div className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-rose-800">Reports could not be displayed</h1>
            <p className="mt-2 text-sm text-slate-600">Refresh the page after restarting the frontend and API server.</p>
            <pre className="mt-4 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-rose-200">{this.state.error.message || String(this.state.error)}</pre>
            <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-[#0f4d2e] px-4 py-2 text-sm font-semibold text-white">
              Reload Reports
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const parsePrice = (value) => Number(String(value).replace(/[^\d.]/g, ""));
function App() {
  const [cartItems, setCartItems] = useState(loadCustomerCart);
  const [isCustomerLoggedIn, setIsCustomerLoggedIn] = useState(hasAuthenticatedCustomer);
  const [welcomeMessage, setWelcomeMessage] = useState("");

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
    const showWelcomeMessage = (event) => {
      setWelcomeMessage(event.detail?.name ? `Welcome back, ${event.detail.name}!` : "Welcome back!");
    };
    window.addEventListener("belfiore-customer-login", showWelcomeMessage);
    return () => {
      window.removeEventListener("belfiore-customer-session-changed", syncCustomerCart);
      window.removeEventListener("storage", syncCustomerCart);
      window.removeEventListener("belfiore-customer-login", showWelcomeMessage);
    };
  }, []);

  const handleAddToCart = (product, quantity = 1, source = null) => {
    if(product.inventoryType==='GARDENING_SUPPLY'&&(!product.variantId||product.stock<=0)){window.location.assign('/product/'+product.id);return false;}
    if(isLettuceProduct(product)&&(product.lettuceStockModel!=='quantity'||product.batchId||Number(product.stock)<=0))return false;
    if (!hasAuthenticatedCustomer()) {
      window.location.assign("/login");
      return false;
    }

    const safeQuantity = Number(quantity) > 0 ? Number(quantity) : 1;
    const productPrice = parsePrice(product.price);
    const resolvedImage = product.image && product.image !== "#" ? product.image : getImageUrl(product.imageUrl);
    const productImage = resolvedImage || plantsImage;
    const allowsMultipleQuantity = isLettuceProduct(product)||product.inventoryType==='GARDENING_SUPPLY';
    const availableStock = Number(product.stock);
    const requestedQuantity = allowsMultipleQuantity ? safeQuantity : 1;
    const cartId=cartLineId(product);
    if(cartItems.some(item=>String(item.id)===String(cartId)))return false;
    const cartQuantity =
      allowsMultipleQuantity && Number.isFinite(availableStock) && availableStock > 0
        ? Math.min(requestedQuantity, availableStock)
        : requestedQuantity;

    setCartItems((previous) => {
      const existingItem = previous.find((item) => item.id === cartId);

      if (existingItem) return previous;

      return [
        ...previous,
        {
          id: cartId,
          productId:product.id,variantId:product.variantId||null,variantName:product.variantName,variantSku:product.variantSku,sellingUnit:product.sellingUnit,piecesPerUnit:product.piecesPerUnit,weightKg:product.weightKg,batchId:product.batchId||null,batchCode:product.batchCode||'',inventoryType:product.inventoryType,
          name: product.variantId?`${product.name} - ${product.variantName} (${product.sellingUnit})`:product.name,
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
    flyToCart(source,productImage);
    return true;
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
          <Route path="/verification-pending" element={<VerificationPending/>}/><Route path="/terms" element={<PolicyPage kind="Terms of Service"/>}/><Route path="/privacy" element={<PolicyPage kind="Privacy Notice"/>}/><Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/products" element={<Products cartItems={cartItems} onAddToCart={handleAddToCart} />} />
          <Route path="/product/:id" element={<ProductDetail cartItems={cartItems} onAddToCart={handleAddToCart} />} />
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
          <Route path="/banks-cards" element={<CustomerProtectedRoute><Navigate to="/dashboard" replace /></CustomerProtectedRoute>} />
          <Route path="/change-password" element={<CustomerProtectedRoute><AccountSettings section="password" /></CustomerProtectedRoute>} />
        </Route>

        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/staff/login" element={<AdminLogin />} />
        <Route path="/staff/*" element={<StaffPortal />} />
        <Route path="/forgot-password" element={<PasswordRecovery />} />
        <Route path="/reset-password" element={<PasswordRecovery />} />
        <Route path="/rider/login" element={<AdminLogin />} />
        <Route path="/rider/change-password" element={<RiderProtectedRoute><RiderPasswordChange/></RiderProtectedRoute>} />
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
          <Route path="staff" element={<AdminStaff />} />
          <Route path="inventory" element={<AdminInventory />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="reports" element={<ReportsErrorBoundary><AdminReports /></ReportsErrorBoundary>} />
          <Route path="logs" element={<AdminLogs />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      {welcomeMessage ? (
        <div className="fixed inset-x-4 top-5 z-[100] mx-auto max-w-md" role="status" aria-live="polite">
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-emerald-950 shadow-xl shadow-emerald-950/10">
            <CheckCircle2 className="shrink-0 text-emerald-600" size={24} />
            <p className="flex-1 text-sm font-semibold">{welcomeMessage}</p>
            <button
              type="button"
              onClick={() => setWelcomeMessage("")}
              className="rounded-lg p-1 text-gray-400 transition hover:bg-emerald-50 hover:text-gray-700"
              aria-label="Dismiss welcome message"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      ) : null}
    </Router>
  );
}

export default App;
