import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CollectionProvider } from './context/CollectionContext';
import { Navbar } from './components/Navbar/Navbar';
import { SyncPrompt } from './components/SyncPrompt/SyncPrompt';
import { GuestBanner } from './components/GuestBanner/GuestBanner';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { SearchPage } from './pages/SearchPage';
import { CollectionPage } from './pages/CollectionPage';
import { WishlistPage } from './pages/WishlistPage';
import { BinderPage } from './pages/BinderPage';

function AppLayout() {
  return (
    <>
      <Navbar />
      <GuestBanner />
      <SyncPrompt />
      <Outlet />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CollectionProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/collection" element={<CollectionPage />} />
              <Route path="/wishlist" element={<WishlistPage />} />
              <Route path="/binder" element={<BinderPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </CollectionProvider>
    </AuthProvider>
  );
}
