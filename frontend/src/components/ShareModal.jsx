// ============================================================
// CollabDocs — ShareModal Component
// ============================================================
// Generates short links for documents and displays analytics.
// ============================================================

import { useState, useRef } from 'react';
import { createShortLink } from '../lib/api';

export default function ShareModal({ docId, onClose }) {
  const [shortUrl, setShortUrl] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  const handleGenerateLink = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await createShortLink(docId);
      setShortCode(result.short_code);
      setShortUrl(result.short_url);
    } catch (err) {
      setError('Failed to generate short link. Is the shortener service running?');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-secure contexts
      if (inputRef.current) {
        inputRef.current.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick} id="share-modal-overlay">
      <div className="modal-content" id="share-modal-content">
        <div style={{ position: 'relative' }}>
          <button className="modal-close" onClick={onClose} id="share-modal-close">✕</button>
        </div>

        <h3 className="modal-title">Share Document</h3>
        <p className="modal-description">
          Generate a unique short link to share this document with others.
          Anyone with the link can join the collaborative editing session.
        </p>

        {!shortUrl ? (
          <div>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleGenerateLink}
              disabled={loading}
              id="generate-link-btn"
              style={{ width: '100%' }}
            >
              {loading ? (
                <>
                  <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }}></span>
                  Generating...
                </>
              ) : (
                'Generate Short Link'
              )}
            </button>
            {error && (
              <p style={{ color: 'var(--accent-danger)', fontSize: '0.85rem', marginTop: 12 }}>
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="animate-fade-in">
            <div className="link-display">
              <input
                ref={inputRef}
                type="text"
                value={shortUrl}
                readOnly
                id="short-link-input"
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handleCopy}
                id="copy-link-btn"
              >
                {copied ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>

            <div className="link-stats">
              <div className="link-stat">
                <span>Short Code:</span>
                <span className="link-stat-value" style={{ fontFamily: 'var(--font-mono)' }}>
                  {shortCode}
                </span>
              </div>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 16 }}>
              💡 This link uses a 7-character Base62 encoded URL for optimal sharing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
