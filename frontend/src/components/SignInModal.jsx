// ============================================================
// CollabDocs — SignInModal Component
// ============================================================
// Prompts the user for a username before they can interact
// with the application. Saves it to localStorage.
// ============================================================

import { useState } from 'react';
import { getRandomUserColor, getRandomUsername } from '../lib/yjs';

export default function SignInModal({ onSignIn }) {
  const [name, setName] = useState(getRandomUsername());
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a display name');
      return;
    }
    if (trimmed.length > 20) {
      setError('Name must be 20 characters or less');
      return;
    }

    // Save to localStorage
    const color = getRandomUserColor();
    const user = { name: trimmed, color };
    localStorage.setItem('collabdocs_user', JSON.stringify(user));
    
    onSignIn(user);
  };

  return (
    <div className="modal-overlay" id="signin-modal-overlay">
      <div className="modal-content animate-fade-in-up" id="signin-modal-content">
        <h3 className="modal-title">Welcome to CollabDocs</h3>
        <p className="modal-description">
          Please enter your name. This is how you will appear to other collaborators when editing documents together.
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: '1.5rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="Your display name..."
              className="editor-title-input"
              style={{ width: '100%', fontSize: '1rem', padding: '0.75rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
              autoFocus
              id="signin-name-input"
            />
            {error && (
              <p style={{ color: 'var(--accent-danger)', fontSize: '0.85rem', marginTop: 8 }}>
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            id="signin-submit-btn"
            style={{ width: '100%' }}
          >
            Continue to App →
          </button>
        </form>
      </div>
    </div>
  );
}
