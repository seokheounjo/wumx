import React, { useState, useRef, useEffect } from 'react';
import { PaneLayout, PaneSingle, PaneSplit, IPC_CHANNELS } from '../../shared/types';
import { TerminalComponent } from './Terminal';

const api = window.wumx;

interface SplitPaneProps {
  layout: PaneLayout;
  workspaceId: string;
  activePaneId: string;
  onPaneFocus: (paneId: string) => void;
  onUpdate: () => void;
  fontSize?: number;
  visible?: boolean;
}

export const SplitPaneView: React.FC<SplitPaneProps> = ({
  layout, workspaceId, activePaneId, onPaneFocus, onUpdate, fontSize, visible = true,
}) => {
  if (layout.type === 'single') {
    return (
      <SinglePaneView
        pane={layout}
        workspaceId={workspaceId}
        focused={layout.pane.id === activePaneId}
        onFocus={() => onPaneFocus(layout.pane.id)}
        onUpdate={onUpdate}
        fontSize={fontSize}
        visible={visible}
      />
    );
  }

  return (
    <SplitView
      layout={layout}
      workspaceId={workspaceId}
      activePaneId={activePaneId}
      onPaneFocus={onPaneFocus}
      onUpdate={onUpdate}
      fontSize={fontSize}
      visible={visible}
    />
  );
};

const SinglePaneView: React.FC<{
  pane: PaneSingle;
  workspaceId: string;
  focused: boolean;
  onFocus: () => void;
  onUpdate: () => void;
  fontSize?: number;
  visible?: boolean;
}> = ({ pane, workspaceId, focused, onFocus, onUpdate, fontSize, visible = true }) => {
  const [title, setTitle] = useState(pane.pane.title || '');
  const paneId = pane.pane.id;

  const handleSplit = async (direction: 'horizontal' | 'vertical') => {
    await api.invoke(IPC_CHANNELS.PANE_SPLIT, { workspaceId, paneId, direction });
    onUpdate();
  };

  const handleClose = async () => {
    await api.invoke(IPC_CHANNELS.PANE_CLOSE, { workspaceId, paneId });
    onUpdate();
  };

  // 키보드 단축키 연동
  useEffect(() => {
    if (!focused || !visible) return;

    const handleClosePaneEvent = () => handleClose();
    const handleSplitEvent = (e: Event) => {
      handleSplit((e as CustomEvent).detail);
    };

    window.addEventListener('wumx:close-pane', handleClosePaneEvent);
    window.addEventListener('wumx:split', handleSplitEvent);
    return () => {
      window.removeEventListener('wumx:close-pane', handleClosePaneEvent);
      window.removeEventListener('wumx:split', handleSplitEvent);
    };
  }, [focused, visible, workspaceId, paneId]);

  const shortPath = (p: string) => {
    const parts = p.replace(/\\/g, '/').split('/');
    return parts.length > 3 ? `.../${parts.slice(-2).join('/')}` : p;
  };

  return (
    <div className={`terminal-pane ${focused ? 'focused' : ''} ${pane.pane.hasNotification ? 'has-notification' : ''}`}>
      <div className="terminal-pane-header">
        <span className="cwd">{shortPath(pane.pane.cwd)}</span>
        {title && <span style={{ color: 'var(--text-muted)' }}>- {title}</span>}
        <div className="terminal-pane-actions">
          <button onClick={() => handleSplit('horizontal')} title="가로 분할 (Ctrl+Shift+H)">&#9701;</button>
          <button onClick={() => handleSplit('vertical')} title="세로 분할 (Ctrl+Shift+V)">&#9703;</button>
          <button onClick={handleClose} title="패널 닫기 (Ctrl+W)">&#10005;</button>
        </div>
      </div>
      <TerminalComponent
        paneId={paneId}
        cwd={pane.pane.cwd}
        shellPath={pane.pane.shell}
        focused={focused}
        onFocus={onFocus}
        onTitleChange={setTitle}
        scrollbackContent={pane.pane.scrollback}
        fontSize={fontSize}
        visible={visible}
      />
    </div>
  );
};

const SplitView: React.FC<{
  layout: PaneSplit;
  workspaceId: string;
  activePaneId: string;
  onPaneFocus: (paneId: string) => void;
  onUpdate: () => void;
  fontSize?: number;
  visible?: boolean;
}> = ({ layout, workspaceId, activePaneId, onPaneFocus, onUpdate, fontSize, visible = true }) => {
  const [ratio, setRatio] = useState(layout.ratio);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isHorizontal = layout.direction === 'horizontal';

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let newRatio = isHorizontal
        ? (e.clientX - rect.left) / rect.width
        : (e.clientY - rect.top) / rect.height;
      newRatio = Math.max(0.1, Math.min(0.9, newRatio));
      setRatio(newRatio);
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isHorizontal]);

  return (
    <div ref={containerRef} className={isHorizontal ? 'split-horizontal' : 'split-vertical'}>
      <div style={{ [isHorizontal ? 'width' : 'height']: `${ratio * 100}%`, overflow: 'hidden', display: 'flex' }}>
        <SplitPaneView layout={layout.first} workspaceId={workspaceId} activePaneId={activePaneId} onPaneFocus={onPaneFocus} onUpdate={onUpdate} fontSize={fontSize} visible={visible} />
      </div>
      <div
        className={`split-divider ${isHorizontal ? 'horizontal' : 'vertical'} ${isDragging ? 'dragging' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
      />
      <div style={{ [isHorizontal ? 'width' : 'height']: `${(1 - ratio) * 100}%`, overflow: 'hidden', display: 'flex' }}>
        <SplitPaneView layout={layout.second} workspaceId={workspaceId} activePaneId={activePaneId} onPaneFocus={onPaneFocus} onUpdate={onUpdate} fontSize={fontSize} visible={visible} />
      </div>
    </div>
  );
};
