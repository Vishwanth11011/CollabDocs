// ============================================================
// CollabDocs — Navbar Component
// ============================================================

import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const location = useLocation();
  const isEditor = location.pathname.startsWith('/editor');

  return (
    <nav className="navbar" id="main-navbar">
      <Link to="/" className="navbar-brand" id="navbar-brand-link">
        CollabDocs
      </Link>

      <div className="navbar-actions">
        {!isEditor && (
          <Link to="/" className="btn btn-ghost btn-sm" id="nav-home-link">
            Documents
          </Link>
        )}
        {isEditor && (
          <Link to="/" className="btn btn-ghost btn-sm" id="nav-back-link">
            ← Back to Documents
          </Link>
        )}
      </div>
    </nav>
  );
}
