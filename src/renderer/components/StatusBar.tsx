import React from 'react';
import { Workspace } from '../../shared/types';

interface StatusBarProps {
  workspace: Workspace | null;
  notificationCount: number;
  onNotificationClick: () => void;
  fontSize?: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  workspace, notificationCount, onNotificationClick, fontSize = 14,
}) => {
  return (
    <div className="statusbar">
      {/* Git */}
      <div className="statusbar-section">
        {workspace?.gitBranch ? (
          <>
            <span className="icon" style={{ color: 'var(--accent-cyan)' }}>&#9741;</span>
            <span>{workspace.gitBranch}</span>
            {workspace.prNumber && (
              <span style={{ color: 'var(--accent-green)' }}>PR #{workspace.prNumber}</span>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>no git</span>
        )}
      </div>

      {/* CWD */}
      <div className="statusbar-section">
        <span className="icon">&#128193;</span>
        <span>{workspace?.cwd || ''}</span>
      </div>

      {/* 포트 */}
      {workspace && workspace.listeningPorts.length > 0 && (
        <div className="statusbar-section">
          <span className="icon" style={{ color: 'var(--accent-green)' }}>&#9679;</span>
          <span>:{workspace.listeningPorts.join(', :')}</span>
        </div>
      )}

      <div className="statusbar-spacer" />

      {/* 폰트 크기 */}
      <div className="statusbar-section" style={{ color: 'var(--text-muted)' }}>
        {fontSize}px
      </div>

      {/* 알림 */}
      <div className="statusbar-section" style={{ cursor: 'pointer' }} onClick={onNotificationClick}>
        <span className="icon">&#128276;</span>
        {notificationCount > 0 ? (
          <span style={{ color: 'var(--accent-orange)', fontWeight: 600 }}>{notificationCount}</span>
        ) : (
          <span>0</span>
        )}
      </div>

      {/* 단축키 */}
      <div className="statusbar-section" style={{ color: 'var(--text-muted)', gap: 4 }}>
        <span className="kbd">Ctrl+N</span>new
        <span className="kbd">Ctrl+1-9</span>switch
        <span className="kbd">Ctrl+,</span>settings
      </div>

      <div className="statusbar-section" style={{ color: 'var(--text-muted)' }}>
        wumx v1.0.0
      </div>
    </div>
  );
};
