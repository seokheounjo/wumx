import React, { useState } from 'react';
import { Workspace, PaneLayout } from '../../shared/types';

function getPaneNames(layout: PaneLayout): string[] {
  if (layout.type === 'single') return [layout.pane.name || layout.pane.title || 'Terminal'];
  return [...getPaneNames(layout.first), ...getPaneNames(layout.second)];
}

interface SidebarProps {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  totalUnread: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  workspaces, activeWorkspaceId, onSwitch, onCreate, onDelete, onRename, totalUnread,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; wsId: string } | null>(null);

  const handleDoubleClick = (ws: Workspace) => {
    setEditingId(ws.id);
    setEditName(ws.name);
  };

  const handleRenameSubmit = (id: string) => {
    if (editName.trim()) {
      onRename(id, editName.trim());
    }
    setEditingId(null);
  };

  const handleContextMenu = (e: React.MouseEvent, wsId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, wsId });
  };

  const shortPath = (p: string) => {
    const parts = p.replace(/\\/g, '/').split('/');
    return parts.length > 2 ? `.../${parts.slice(-2).join('/')}` : p;
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Workspaces</h2>
        <button className="sidebar-add-btn" onClick={onCreate} title="새 워크스페이스 (Ctrl+N)">
          +
        </button>
      </div>

      <div className="workspace-list">
        {workspaces.map((ws, index) => (
          <div
            key={ws.id}
            className={`workspace-tab ${ws.id === activeWorkspaceId ? 'active' : ''} ${ws.unreadCount > 0 ? 'has-notification' : ''}`}
            onClick={() => onSwitch(ws.id)}
            onDoubleClick={() => handleDoubleClick(ws)}
            onContextMenu={(e) => handleContextMenu(e, ws.id)}
          >
            <div className="workspace-tab-name">
              <span style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 700 }}>
                {index + 1}
              </span>
              {editingId === ws.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => handleRenameSubmit(ws.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSubmit(ws.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--accent-blue)',
                    borderRadius: 4,
                    color: 'var(--text-primary)',
                    padding: '2px 6px',
                    fontSize: 13,
                    width: '100%',
                    outline: 'none',
                  }}
                />
              ) : (
                <span>{ws.name}</span>
              )}
              {ws.unreadCount > 0 && (
                <span className="notification-badge">{ws.unreadCount}</span>
              )}
            </div>

            <div className="workspace-tab-meta">
              {ws.gitBranch && (
                <div className="workspace-tab-meta-item">
                  <span className="icon" style={{ color: 'var(--accent-cyan)' }}>&#9741;</span>
                  <span className="branch-badge">{ws.gitBranch}</span>
                  {ws.prNumber && (
                    <span style={{ color: 'var(--accent-green)', fontSize: 10 }}>
                      #{ws.prNumber}
                    </span>
                  )}
                </div>
              )}
              <div className="workspace-tab-meta-item">
                <span className="icon">&#128193;</span>
                <span>{shortPath(ws.cwd)}</span>
              </div>
              {/* 패널 정보 */}
              {getPaneNames(ws.panes).length > 0 && (
                <div className="workspace-tab-meta-item">
                  <span className="icon" style={{ color: 'var(--accent-magenta)' }}>&#9638;</span>
                  <span>{getPaneNames(ws.panes).join(' | ')}</span>
                </div>
              )}
              {ws.listeningPorts.length > 0 && (
                <div className="workspace-tab-meta-item">
                  <span className="icon" style={{ color: 'var(--accent-green)' }}>&#9679;</span>
                  <span>:{ws.listeningPorts.join(', :')}</span>
                </div>
              )}
              {ws.notifications.length > 0 && (
                <div className="workspace-tab-meta-item" style={{ color: 'var(--accent-orange)' }}>
                  <span className="icon">&#9888;</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ws.notifications[ws.notifications.length - 1]?.text}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 하단 정보 */}
      <div style={{
        padding: '8px 16px',
        borderTop: '1px solid var(--border-color)',
        fontSize: 10,
        color: 'var(--text-muted)',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>{workspaces.length} workspaces</span>
        <span>{totalUnread > 0 ? `${totalUnread} unread` : ''}</span>
      </div>

      {/* 우클릭 메뉴 */}
      {contextMenu && (
        <>
          <div
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
            onClick={() => setContextMenu(null)}
          />
          <div style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '4px 0',
            zIndex: 1000,
            minWidth: 160,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}>
            {[
              { label: '이름 변경', action: () => {
                const ws = workspaces.find((w) => w.id === contextMenu.wsId);
                if (ws) handleDoubleClick(ws);
                setContextMenu(null);
              }},
              { label: '워크스페이스 삭제', action: () => {
                onDelete(contextMenu.wsId);
                setContextMenu(null);
              }, danger: true },
            ].map((item, i) => (
              <div
                key={i}
                onClick={item.action}
                style={{
                  padding: '6px 16px',
                  fontSize: 12,
                  cursor: 'pointer',
                  color: (item as any).danger ? 'var(--accent-red)' : 'var(--text-primary)',
                  transition: 'background 150ms',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {item.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
