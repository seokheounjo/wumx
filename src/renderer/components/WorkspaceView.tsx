import React, { useState, useCallback, useEffect } from 'react';
import { Workspace, PaneLayout, PaneInfo, IPC_CHANNELS } from '../../shared/types';
import { TerminalComponent } from './Terminal';
import { BrowserPanel } from './Browser';

const api = window.wumx;

interface WorkspaceViewProps {
  workspace: Workspace;
  onUpdate: () => void;
  fontSize?: number;
  visible?: boolean;
}

function collectPaneIds(layout: PaneLayout): string[] {
  if (layout.type === 'single') return [layout.pane.id];
  return [...collectPaneIds(layout.first), ...collectPaneIds(layout.second)];
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  workspace, onUpdate, fontSize, visible = true,
}) => {
  const [activePaneId, setActivePaneId] = useState(workspace.activePaneId);
  const currentPaneIds = collectPaneIds(workspace.panes);

  const handlePaneFocus = useCallback((paneId: string) => {
    setActivePaneId(paneId);
  }, []);

  const handleSplit = async (paneId: string, direction: 'horizontal' | 'vertical') => {
    await api.invoke(IPC_CHANNELS.PANE_SPLIT, { workspaceId: workspace.id, paneId, direction });
    onUpdate();
  };

  const handleClosePane = async (paneId: string) => {
    await api.invoke(IPC_CHANNELS.PANE_CLOSE, { workspaceId: workspace.id, paneId });
    onUpdate();
  };

  // 키보드 단축키
  useEffect(() => {
    if (!visible) return;
    const onClose = () => {
      if (activePaneId && currentPaneIds.length > 1) handleClosePane(activePaneId);
    };
    const onSplit = (e: Event) => {
      if (activePaneId) handleSplit(activePaneId, (e as CustomEvent).detail);
    };
    window.addEventListener('wumx:close-pane', onClose);
    window.addEventListener('wumx:split', onSplit);
    return () => {
      window.removeEventListener('wumx:close-pane', onClose);
      window.removeEventListener('wumx:split', onSplit);
    };
  }, [visible, activePaneId, currentPaneIds.length]);

  return (
    <div className="pane-container">
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <LayoutRenderer
          layout={workspace.panes}
          activePaneId={activePaneId}
          onPaneFocus={handlePaneFocus}
          onSplit={handleSplit}
          onClose={handleClosePane}
          onUpdate={onUpdate}
          singlePane={currentPaneIds.length <= 1}
          fontSize={fontSize}
          visible={visible}
        />
      </div>
      {workspace.browserVisible && (
        <BrowserPanel
          workspaceId={workspace.id}
          initialUrl={workspace.browserUrl || 'https://www.google.com'}
          onClose={async () => {
            await api.invoke(IPC_CHANNELS.BROWSER_TOGGLE, workspace.id);
            onUpdate();
          }}
        />
      )}
    </div>
  );
};

// ===== 레이아웃 렌더러 =====

interface LayoutProps {
  layout: PaneLayout;
  activePaneId: string;
  onPaneFocus: (id: string) => void;
  onSplit: (id: string, dir: 'horizontal' | 'vertical') => void;
  onClose: (id: string) => void;
  onUpdate: () => void;
  singlePane: boolean;
  fontSize?: number;
  visible?: boolean;
}

const LayoutRenderer: React.FC<LayoutProps> = (props) => {
  if (props.layout.type === 'single') {
    // key=paneId로 터미널 인스턴스 재사용 보장
    return <PaneView key={props.layout.pane.id} pane={props.layout.pane} {...props} />;
  }
  return <SplitRenderer {...props} layout={props.layout} />;
};

const SplitRenderer: React.FC<LayoutProps & { layout: PaneLayout & { type: 'split' } }> = ({
  layout, ...rest
}) => {
  const [ratio, setRatio] = useState(layout.ratio);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isH = layout.direction === 'horizontal';

  useEffect(() => {
    if (!isDragging) return;
    const move = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let r = isH ? (e.clientX - rect.left) / rect.width : (e.clientY - rect.top) / rect.height;
      setRatio(Math.max(0.15, Math.min(0.85, r)));
    };
    const up = () => setIsDragging(false);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  }, [isDragging, isH]);

  return (
    <div ref={containerRef} className={isH ? 'split-horizontal' : 'split-vertical'}>
      <div style={{ [isH ? 'width' : 'height']: `${ratio * 100}%`, overflow: 'hidden', display: 'flex' }}>
        <LayoutRenderer layout={layout.first} {...rest} />
      </div>
      <div
        className={`split-divider ${isH ? 'horizontal' : 'vertical'} ${isDragging ? 'dragging' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
      />
      <div style={{ [isH ? 'width' : 'height']: `${(1 - ratio) * 100}%`, overflow: 'hidden', display: 'flex' }}>
        <LayoutRenderer layout={layout.second} {...rest} />
      </div>
    </div>
  );
};

// ===== 패널 뷰 (헤더 + 터미널 직접 렌더링) =====

const PaneView: React.FC<LayoutProps & { pane: PaneInfo }> = ({
  pane, activePaneId, onPaneFocus, onSplit, onClose, onUpdate, singlePane, fontSize, visible,
}) => {
  const focused = pane.id === activePaneId;
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(pane.name || '');

  const shortPath = (p: string) => {
    const parts = p.replace(/\\/g, '/').split('/');
    return parts.length > 3 ? `.../${parts.slice(-2).join('/')}` : p;
  };

  const handleRename = async () => {
    if (editName.trim()) {
      await api.invoke('pane:rename' as any, { paneId: pane.id, name: editName.trim() });
      onUpdate();
    }
    setEditing(false);
  };

  return (
    <div
      className={`terminal-pane ${focused ? 'focused' : ''} ${pane.hasNotification ? 'has-notification' : ''}`}
      onClick={() => onPaneFocus(pane.id)}
    >
      <div className="terminal-pane-header">
        {/* 패널 이름 (더블클릭으로 편집) */}
        {editing ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false); }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-primary)', border: '1px solid var(--accent-blue)',
              borderRadius: 3, color: 'var(--text-primary)', padding: '1px 6px',
              fontSize: 11, width: 120, outline: 'none',
            }}
          />
        ) : (
          <span
            className="cwd"
            onDoubleClick={(e) => { e.stopPropagation(); setEditName(pane.name || ''); setEditing(true); }}
            title="더블클릭으로 이름 변경"
            style={{ cursor: 'text' }}
          >
            <strong style={{ color: 'var(--accent-magenta)', marginRight: 6 }}>{pane.name}</strong>
            {shortPath(pane.cwd)}
          </span>
        )}
        <div className="terminal-pane-actions">
          <button onClick={(e) => { e.stopPropagation(); onSplit(pane.id, 'horizontal'); }} title="가로 분할">&#9701;</button>
          <button onClick={(e) => { e.stopPropagation(); onSplit(pane.id, 'vertical'); }} title="세로 분할">&#9703;</button>
          {!singlePane && (
            <button onClick={(e) => { e.stopPropagation(); onClose(pane.id); }} title="패널 닫기">&#10005;</button>
          )}
        </div>
      </div>
      <TerminalComponent
        paneId={pane.id}
        cwd={pane.cwd}
        shellPath={pane.shell}
        focused={focused && (visible ?? true)}
        onFocus={() => onPaneFocus(pane.id)}
        scrollbackContent={pane.scrollback}
        fontSize={fontSize}
        visible={visible}
      />
    </div>
  );
};
