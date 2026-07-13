// ============================================================
// CollabDocs — App Root (Router + Layout)
// ============================================================

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import EditorPage from './pages/Editor';
import SignInModal from './components/SignInModal';

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('collabdocs_user');
    if (saved) {
      setUser(JSON.parse(saved));
    }
  }, []);

  if (!user) {
    return <SignInModal onSignIn={setUser} />;
  }

  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/editor/:docId" element={<EditorPage />} />
        {/* Short link redirect passthrough (handled by shortener service via proxy) */}
        <Route path="/s/:code" element={<ShortLinkRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

/**
 * Short link redirect handler.
 * In production, /s/:code is handled by the Nginx proxy → shortener service.
 * This fallback handles direct SPA navigation gracefully.
 */
function ShortLinkRedirect() {
  const shortenerUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';

  // Extract the code from the current path
  const code = window.location.pathname.split('/s/')[1];
  if (code) {
    window.location.href = `${shortenerUrl}/s/${code}`;
  }

  return (
    <div className="loading-screen">
      <div className="spinner spinner-lg"></div>
      <span>Redirecting...</span>
    </div>
  );
}
