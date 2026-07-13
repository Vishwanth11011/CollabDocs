// ============================================================
// CollabDocs — OnlineUsers Component
// ============================================================
// Displays awareness avatars for users connected to the
// same document room.
// ============================================================

import { useState, useEffect } from 'react';

const AVATAR_COLORS = [
  '#6366f1', '#22d3ee', '#f472b6', '#34d399',
  '#fbbf24', '#a78bfa', '#fb923c', '#38bdf8',
];

export default function OnlineUsers({ provider }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (!provider) return;

    const awareness = provider.awareness;

    const updateUsers = () => {
      const states = Array.from(awareness.getStates().entries());
      const currentUsers = states
        .filter(([clientId]) => clientId !== awareness.clientID)
        .map(([clientId, state]) => ({
          clientId,
          name: state.user?.name || `User ${clientId}`,
          color: state.user?.color || AVATAR_COLORS[clientId % AVATAR_COLORS.length],
        }));
      setUsers(currentUsers);
    };

    awareness.on('change', updateUsers);
    updateUsers();

    return () => {
      awareness.off('change', updateUsers);
    };
  }, [provider]);

  if (users.length === 0) return null;

  return (
    <div className="online-users" id="online-users-container">
      {users.slice(0, 5).map((user) => (
        <div
          key={user.clientId}
          className="online-avatar tooltip"
          data-tooltip={user.name}
          style={{ backgroundColor: user.color }}
          id={`user-avatar-${user.clientId}`}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {users.length > 5 && (
        <div
          className="online-avatar"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '0.65rem' }}
        >
          +{users.length - 5}
        </div>
      )}
    </div>
  );
}
