import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

import Home from './pages/Home.jsx';
import ReelsPage from './pages/ReelsPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import RestaurantPage from './pages/RestaurantPage.jsx';
import CartPage from './pages/CartPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';
import OrderTrackingPage from './pages/OrderTrackingPage.jsx';
import MyOrdersPage from './pages/MyOrdersPage.jsx';
import AnnadevtaPage from './pages/AnnadevtaPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import RestaurantDashboard from './pages/RestaurantDashboard.jsx';
import DeliveryDashboard from './pages/DeliveryDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import NotFound from './pages/NotFound.jsx';

/** Start every navigation at the top of the page. */
function ScrollToTop() {
  const { pathname } = useLocation();
  // Block body on purpose: an arrow returning scrollTo's value is read by React as a cleanup fn.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <ScrollToTop />
      <Navbar />

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/reels" element={<ReelsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/restaurant/:id" element={<RestaurantPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/annadevta" element={<AnnadevtaPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route
            path="/checkout"
            element={
              <ProtectedRoute roles={['customer']}>
                <CheckoutPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/order/:id"
            element={
              <ProtectedRoute>
                <OrderTrackingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <MyOrdersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/restaurant"
            element={
              <ProtectedRoute roles={['restaurant', 'admin']}>
                <RestaurantDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/delivery"
            element={
              <ProtectedRoute roles={['delivery', 'admin']}>
                <DeliveryDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin"
            element={
              <ProtectedRoute roles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <Footer />
    </div>
  );
}
