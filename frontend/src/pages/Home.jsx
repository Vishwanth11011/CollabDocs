// ============================================================
// CollabDocs — Home Page (Dashboard)
// ============================================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDocuments, createDocument } from '../lib/api';
import DocumentCard from '../components/DocumentCard';

export default function Home() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const docs = await fetchDocuments();
      setDocuments(docs);
    } catch (err) {
      setError('Unable to connect to the collaboration service. Make sure it\'s running on port 3001.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDocument = async () => {
    setCreating(true);
    try {
      const doc = await createDocument('Untitled Document');
      navigate(`/editor/${doc.doc_id}`);
    } catch (err) {
      setError('Failed to create document');
      setCreating(false);
    }
  };

  return (
    <div id="home-page">
      {/* Hero Section */}
      <section className="hero" id="hero-section">
        <h1 className="hero-title">Real-Time Collaboration</h1>
        <p className="hero-subtitle">
          Edit documents together in real-time with conflict-free synchronization.
          Share instantly with short links.
        </p>
        <div className="hero-actions">
          <button
            className="btn btn-primary btn-lg"
            onClick={handleCreateDocument}
            disabled={creating}
            id="create-doc-btn"
          >
            {creating ? (
              <>
                <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }}></span>
                Creating...
              </>
            ) : (
              'New Document'
            )}
          </button>
        </div>
      </section>

      {/* Features Grid */}
      <section className="features-grid" id="features-section">
        <div className="glass-card feature-card">
          <h4 className="feature-title">Real-Time Sync</h4>
          <p className="feature-description">
            Changes appear across all clients in under 100ms using CRDTs for conflict-free editing.
          </p>
        </div>
        <div className="glass-card feature-card">
          <h4 className="feature-title">Instant Sharing</h4>
          <p className="feature-description">
            Generate 7-character short links with click analytics. Redis-cached for sub-50ms redirects.
          </p>
        </div>
        <div className="glass-card feature-card">
          <h4 className="feature-title">High Availability</h4>
          <p className="feature-description">
            Multi-layer caching ensures the URL shortener works even during database outages.
          </p>
        </div>
        <div className="glass-card feature-card">
          <h4 className="feature-title">Offline Support</h4>
          <p className="feature-description">
            Edit offline and auto-sync when reconnected. CRDT convergence guarantees zero data loss.
          </p>
        </div>
      </section>

      {/* Documents List */}
      <div className="page-container" id="documents-section">
        <div className="section-header">
          <h2 className="section-title">Your Documents</h2>
          <button
            className="btn btn-secondary btn-sm"
            onClick={loadDocuments}
            id="refresh-docs-btn"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="loading-screen">
            <div className="spinner spinner-lg"></div>
            <span>Loading documents...</span>
          </div>
        ) : error ? (
          <div className="empty-state">
            <h3 className="empty-state-title">Connection Error</h3>
            <p className="empty-state-description">{error}</p>
            <button className="btn btn-secondary" onClick={loadDocuments}>
              Try Again
            </button>
          </div>
        ) : documents.length === 0 ? (
          <div className="empty-state" id="empty-state">
            <h3 className="empty-state-title">No documents yet</h3>
            <p className="empty-state-description">
              Create your first collaborative document and start editing in real-time.
            </p>
            <button
              className="btn btn-primary"
              onClick={handleCreateDocument}
              disabled={creating}
              id="create-first-doc-btn"
            >
              Create First Document
            </button>
          </div>
        ) : (
          <div className="docs-grid" id="docs-grid">
            {documents.map((doc, index) => (
              <DocumentCard key={doc.doc_id} document={doc} index={index} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
