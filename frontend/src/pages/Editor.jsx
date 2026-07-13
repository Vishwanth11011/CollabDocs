// ============================================================
// CollabDocs — Editor Page (Collaborative Editing)
// ============================================================
// Rich text Quill editor with Yjs CRDT bindings,
// awareness (remote cursors), share modal, and connection status.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Quill from 'quill';
import QuillCursors from 'quill-cursors';
import { QuillBinding } from 'y-quill';
import 'quill/dist/quill.snow.css';

import { createCollaborationProvider, getUserIdentity } from '../lib/yjs';
import { fetchDocument, updateDocumentTitle } from '../lib/api';
import ShareModal from '../components/ShareModal';
import OnlineUsers from '../components/OnlineUsers';

// Register QuillCursors module
Quill.register('modules/cursors', QuillCursors);

// Register Custom Fonts
const Font = Quill.import('formats/font');
Font.whitelist = ['sans-serif', 'serif', 'monospace', 'georgia', 'impact', 'tahoma', 'verdana'];
Quill.register(Font, true);

export default function EditorPage() {
  const { docId } = useParams();
  const [title, setTitle] = useState('Loading...');
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [isSynced, setIsSynced] = useState(false);

  const editorRef = useRef(null);
  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const bindingRef = useRef(null);
  const quillRef = useRef(null);
  const titleTimeoutRef = useRef(null);

  // Get user identity from localStorage
  const userRef = useRef(getUserIdentity());

  // ── Initialize Yjs Provider and Quill ──
  useEffect(() => {
    // 1. Initialize Yjs
    const { ydoc, provider, ytext } = createCollaborationProvider(docId);
    ydocRef.current = ydoc;
    providerRef.current = provider;

    // Set awareness (user presence)
    provider.awareness.setLocalStateField('user', userRef.current);

    // Track connection status
    provider.on('status', ({ status }) => {
      setConnectionStatus(status);
    });

    provider.on('sync', (synced) => {
      setIsSynced(synced);
    });

    // Load document title
    fetchDocument(docId)
      .then((doc) => setTitle(doc.title || 'Untitled Document'))
      .catch(() => setTitle('Untitled Document'));

    // 2. Initialize Quill
    let quill = quillRef.current;
    if (!quill && editorRef.current) {
      quill = new Quill(editorRef.current, {
        modules: {
          cursors: {
            hideDelayMs: 2500,
            hideSpeedMs: 300,
            selectionChangeSource: null
          },
          toolbar: [
            [{ font: ['', 'serif', 'monospace', 'georgia', 'impact', 'tahoma', 'verdana'] }],
            [{ header: [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ color: [] }, { background: [] }],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['link', 'blockquote', 'code-block'],
            ['clean'],
          ],
        },
        theme: 'snow',
        placeholder: 'Start typing your document here...',
      });
      quillRef.current = quill;
    }

    // 3. Bind Yjs to Quill (always runs so Strict Mode re-binds the NEW ytext)
    if (quill) {
      bindingRef.current = new QuillBinding(
        ytext,
        quill,
        provider.awareness
      );
    }

    return () => {
      if (bindingRef.current) {
        bindingRef.current.destroy();
        bindingRef.current = null;
      }
      provider.disconnect();
      ydoc.destroy();
    };
  }, [docId]);

  // ── Title Change Handler (debounced) ──
  const handleTitleChange = (e) => {
    const newTitle = e.target.value;
    setTitle(newTitle);

    // Debounce the API call
    if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current);
    titleTimeoutRef.current = setTimeout(() => {
      updateDocumentTitle(docId, newTitle).catch(console.error);
    }, 800);
  };

  // ── Connection Status Display ──
  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return isSynced ? 'Synced' : 'Syncing...';
      case 'disconnected': return 'Offline';
      case 'connecting': return 'Connecting...';
      default: return connectionStatus;
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'connected';
      case 'disconnected': return 'disconnected';
      default: return 'connecting';
    }
  };

  const downloadAsHTML = () => {
    if (!quillRef.current) return;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          body { font-family: sans-serif; padding: 40px; max-width: 900px; margin: 0 auto; line-height: 1.6; color: #333; }
          img { max-width: 100%; }
          blockquote { border-left: 4px solid #ccc; margin-left: 0; padding-left: 16px; color: #666; }
          pre { background: #f4f4f4; padding: 12px; border-radius: 4px; overflow-x: auto; }
        </style>
      </head>
      <body>
        ${quillRef.current.root.innerHTML}
      </body>
      </html>
    `;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'Document'}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setShowDownloadMenu(false);
  };

  const downloadAsDoc = () => {
    if (!quillRef.current) return;
    // Word natively parses HTML with a .doc extension
    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>${title}</title></head>
      <body>${quillRef.current.root.innerHTML}</body>
      </html>
    `;
    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'Document'}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    setShowDownloadMenu(false);
  };

  return (
    <div className="editor-layout" id="editor-page">
      {/* Toolbar Container (Header) */}
      <div className="editor-toolbar" id="editor-toolbar">
        <div className="editor-toolbar-left">
          <input
            className="editor-title-input"
            value={title}
            onChange={handleTitleChange}
            placeholder="Document title..."
            id="editor-title-input"
          />

          <div className="connection-status" id="connection-status">
            <span className={`connection-dot ${getStatusColor()}`}></span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              {getStatusText()}
            </span>
          </div>
        </div>

        <div className="editor-toolbar-right">
          <OnlineUsers provider={providerRef.current} />

          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginRight: '8px' }}
              onClick={() => setShowDownloadMenu(!showDownloadMenu)}
              title="Download Document"
            >
              Save
            </button>
            {showDownloadMenu && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: '8px',
                marginTop: '8px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-glass)',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                zIndex: 50,
                display: 'flex',
                flexDirection: 'column',
                minWidth: '140px',
                overflow: 'hidden'
              }}>
                <button onClick={downloadAsDoc} className="menu-btn" style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid var(--border-glass)', color: 'var(--text-primary)', background: 'transparent', cursor: 'pointer' }}>Word Document (.doc)</button>
                <button onClick={downloadAsHTML} className="menu-btn" style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-primary)', background: 'transparent', cursor: 'pointer' }}>Web Page (.html)</button>
              </div>
            )}
          </div>

          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowShareModal(true)}
            id="share-btn"
          >
            Share
          </button>
        </div>
      </div>

      {/* Quill Editor Container */}
      <div className="quill-editor-wrapper" id="editor-container">
        <div ref={editorRef} className="quill-editor" />
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal
          docId={docId}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
}
