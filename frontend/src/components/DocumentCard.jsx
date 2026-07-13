// ============================================================
// CollabDocs — DocumentCard Component
// ============================================================

import { useNavigate } from 'react-router-dom';

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DocumentCard({ document, index }) {
  const navigate = useNavigate();

  return (
    <div
      className="glass-card doc-card animate-fade-in-up"
      style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'both' }}
      onClick={() => navigate(`/editor/${document.doc_id}`)}
      id={`doc-card-${document.doc_id}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/editor/${document.doc_id}`)}
    >
      <div className="doc-card-title">{document.title || 'Untitled Document'}</div>
      <div className="doc-card-meta">
        <span className="doc-card-meta-item">
          🕐 {formatDate(document.last_modified || document.created_at)}
        </span>
        <span className="doc-card-meta-item">
          📝 {formatDate(document.created_at)}
        </span>
      </div>
    </div>
  );
}
