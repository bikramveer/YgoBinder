import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CollectionProvider } from './context/CollectionContext';
import { Navbar } from './components/Navbar/Navbar';
import { SyncPrompt } from './components/SyncPrompt/SyncPrompt';
import { GuestBanner } from './components/GuestBanner/GuestBanner';
import { DashboardPage } from './pages/DashboardPage';
import { SearchPage } from './pages/SearchPage';
import { CollectionPage } from './pages/CollectionPage';
import { ToGetPage } from './pages/ToGetPage';
import { BinderPage } from './pages/BinderPage';

export default function App() {
  return (
    <AuthProvider>
      <CollectionProvider>
        <BrowserRouter>
          <Navbar />
          <GuestBanner />
          <SyncPrompt />
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/collection" element={<CollectionPage />} />
            <Route path="/to-get" element={<ToGetPage />} />
            <Route path="/binder" element={<BinderPage />} />
          </Routes>
        </BrowserRouter>
      </CollectionProvider>
    </AuthProvider>
  );
}
