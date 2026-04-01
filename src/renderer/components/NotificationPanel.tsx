import React from 'react';
import { Notification } from '../../shared/types';

interface NotificationPanelProps {
  open: boolean;
  notifications: Notification[];
  onClose: () => void;
  onNotificationClick: (notification: Notification) => void;
  onClear: () => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  open, notifications, onClose, onNotificationClick, onClear,
}) => {
  const formatTime = (ts: number): string => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className={`notification-panel ${open ? 'open' : ''}`}>
      <div className="notification-panel-header">
        <h3>
          Notifications
          {unreadCount > 0 && (
            <span style={{
              marginLeft: 8,
              fontSize: 11,
              color: 'var(--accent-orange)',
              fontWeight: 400,
            }}>
              {unreadCount} unread
            </span>
          )}
        </h3>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={onClear}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: 11, padding: '4px 8px',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            Clear all
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: 16, padding: '2px 6px',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            &#10005;
          </button>
        </div>
      </div>

      <div className="notification-list">
        {notifications.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 0' }}>
            <div style={{ fontSize: 32, opacity: 0.3 }}>&#128276;</div>
            <div className="empty-state-text">No notifications</div>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`notification-item ${!n.read ? 'unread' : ''}`}
              onClick={() => onNotificationClick(n)}
            >
              <div className={`notification-dot ${n.type}`} />
              <div className="notification-content">
                <div className="notification-text">{n.text}</div>
                <div className="notification-time">{formatTime(n.timestamp)}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 단축키 힌트 */}
      <div style={{
        padding: '8px 16px',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        gap: 12,
        fontSize: 10,
        color: 'var(--text-muted)',
      }}>
        <span><span className="kbd">Ctrl+Shift+I</span> toggle</span>
        <span><span className="kbd">Ctrl+Shift+U</span> jump to unread</span>
      </div>
    </div>
  );
};
