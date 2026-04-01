import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { WorkspaceView } from './components/WorkspaceView';
import { NotificationPanel } from './components/NotificationPanel';
import { StatusBar } from './components/StatusBar';
import { TitleBar } from './components/TitleBar';
import { SettingsPanel } from './components/SettingsPanel';
import { getTerminalScrollback } from './components/Terminal';
import { Workspace, Notification, IPC_CHANNELS, SessionData, WumxConfig, PaneLayout } from '../shared/types';

const api = window.wumx;

export const App: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [config, setConfig] = useState<WumxConfig | null>(null);

  // 워크스페이스 로드
  const activeIdRef = React.useRef(activeWorkspaceId);
  activeIdRef.current = activeWorkspaceId;

  const prevWorkspacesJson = React.useRef('');

  const loadWorkspaces = useCallback(async () => {
    const ws = await api.invoke(IPC_CHANNELS.WORKSPACE_LIST) as Workspace[];
    // 변경이 있을 때만 setState (불필요한 재렌더링 방지)
    const json = JSON.stringify(ws);
    if (json !== prevWorkspacesJson.current) {
      prevWorkspacesJson.current = json;
      setWorkspaces(ws);
    }
    const currentId = activeIdRef.current;
    if (ws.length > 0 && (!currentId || !ws.find((w) => w.id === currentId))) {
      setActiveWorkspaceId(ws[0].id);
    }
    return ws;
  }, []);

  // 주기적 갱신 (10초) + 명시적 작업 후 즉시 갱신
  useEffect(() => {
    loadWorkspaces();
    const interval = setInterval(loadWorkspaces, 10000);
    return () => clearInterval(interval);
  }, []);

  // 설정 로드
  useEffect(() => {
    api.invoke('config:get').then((c) => {
      if (c) {
        setConfig(c as WumxConfig);
        setFontSize((c as WumxConfig).fontSize);
      }
    });
  }, []);

  // 이벤트 리스너
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    // 종료 전 scrollback 저장 요청
    cleanups.push(api.on('request-save-scrollback', () => {
      for (const ws of workspaces) {
        const pids = collectAllPaneIds(ws.panes);
        for (const pid of pids) {
          const sb = getTerminalScrollback(pid);
          if (sb) api.invoke('pane:update-scrollback' as any, { paneId: pid, scrollback: sb });
        }
      }
    }));

    // 세션 복원
    cleanups.push(api.on(IPC_CHANNELS.SESSION_RESTORE, (session: unknown) => {
      const s = session as SessionData;
      setActiveWorkspaceId(s.activeWorkspaceId);
      loadWorkspaces();
    }));

    // 알림 - 현재 활성 워크스페이스의 알림은 즉시 읽음 처리
    cleanups.push(api.on(IPC_CHANNELS.NOTIFICATION_NEW, (notification: unknown) => {
      const n = notification as Notification;
      // 현재 보고 있는 워크스페이스의 알림이면 자동 읽음 처리
      if (n.workspaceId === activeIdRef.current) {
        n.read = true;
        api.invoke(IPC_CHANNELS.NOTIFICATION_READ, { id: n.id });
      }
      setNotifications((prev) => [n, ...prev]);
    }));

    // 알림 패널 토글
    cleanups.push(api.on('toggle-notification-panel', () => {
      setNotificationPanelOpen((prev) => !prev);
    }));

    // 읽지 않은 알림으로 점프
    cleanups.push(api.on(IPC_CHANNELS.NOTIFICATION_JUMP_UNREAD, async () => {
      const unread = await api.invoke(IPC_CHANNELS.NOTIFICATION_JUMP_UNREAD) as Notification | null;
      if (unread) {
        setActiveWorkspaceId(unread.workspaceId);
        api.invoke(IPC_CHANNELS.WORKSPACE_SWITCH, unread.workspaceId);
        api.invoke(IPC_CHANNELS.NOTIFICATION_READ, { id: unread.id });
      }
    }));

    // ===== 키보드 단축키 =====

    // 새 워크스페이스
    cleanups.push(api.on('shortcut:new-workspace', () => {
      handleCreateWorkspace();
    }));

    // 워크스페이스 전환 (Ctrl+1~9)
    cleanups.push(api.on('shortcut:switch-workspace', (data: unknown) => {
      const { index } = data as { index: number };
      if (workspaces[index]) {
        handleSwitchWorkspace(workspaces[index].id);
      }
    }));

    // 세션 저장
    cleanups.push(api.on('shortcut:save-session', () => {
      handleSaveSession();
    }));

    // 패널 닫기
    cleanups.push(api.on('shortcut:close-pane', () => {
      // WorkspaceView에서 처리하도록 커스텀 이벤트 발생
      window.dispatchEvent(new CustomEvent('wumx:close-pane'));
    }));

    // 분할
    cleanups.push(api.on('shortcut:split-horizontal', () => {
      window.dispatchEvent(new CustomEvent('wumx:split', { detail: 'horizontal' }));
    }));

    cleanups.push(api.on('shortcut:split-vertical', () => {
      window.dispatchEvent(new CustomEvent('wumx:split', { detail: 'vertical' }));
    }));

    // 브라우저 토글
    cleanups.push(api.on('shortcut:toggle-browser', () => {
      if (activeWorkspaceId) {
        api.invoke(IPC_CHANNELS.BROWSER_TOGGLE, activeWorkspaceId).then(() => loadWorkspaces());
      }
    }));

    // 검색
    cleanups.push(api.on('shortcut:search', () => {
      window.dispatchEvent(new CustomEvent('wumx:search'));
    }));

    // 줌
    cleanups.push(api.on('shortcut:zoom-in', () => {
      setFontSize((prev) => Math.min(prev + 2, 32));
    }));

    cleanups.push(api.on('shortcut:zoom-out', () => {
      setFontSize((prev) => Math.max(prev - 2, 8));
    }));

    cleanups.push(api.on('shortcut:zoom-reset', () => {
      setFontSize(14);
    }));

    // 설정
    cleanups.push(api.on('shortcut:toggle-settings', () => {
      setSettingsOpen((prev) => !prev);
    }));

    return () => cleanups.forEach((fn) => fn());
  }, [workspaces, activeWorkspaceId]);

  const handleCreateWorkspace = async () => {
    const ws = await api.invoke(IPC_CHANNELS.WORKSPACE_CREATE, {
      name: `workspace-${workspaces.length + 1}`,
    }) as Workspace;
    await loadWorkspaces();
    setActiveWorkspaceId(ws.id);
  };

  const handleDeleteWorkspace = async (id: string) => {
    await api.invoke(IPC_CHANNELS.WORKSPACE_DELETE, id);
    const ws = await loadWorkspaces();
    if (activeWorkspaceId === id && ws.length > 0) {
      setActiveWorkspaceId(ws[0].id);
    }
  };

  const handleRenameWorkspace = async (id: string, name: string) => {
    await api.invoke(IPC_CHANNELS.WORKSPACE_RENAME, { id, name });
    await loadWorkspaces();
  };

  const handleSwitchWorkspace = async (id: string) => {
    await api.invoke(IPC_CHANNELS.WORKSPACE_SWITCH, id);
    setActiveWorkspaceId(id);
    // 전환한 워크스페이스의 알림을 모두 읽음 처리
    markWorkspaceNotificationsRead(id);
  };

  const markWorkspaceNotificationsRead = (wsId: string) => {
    setNotifications((prev) =>
      prev.map((n) => n.workspaceId === wsId && !n.read
        ? { ...n, read: true }
        : n
      )
    );
    // 서버쪽도 동기화
    api.invoke(IPC_CHANNELS.NOTIFICATION_CLEAR, wsId);
  };

  // 세션 저장 시 모든 터미널의 화면 내용을 서버에 전달한 뒤 저장
  const handleSaveSession = async () => {
    // 각 워크스페이스의 각 패널 scrollback을 업데이트
    for (const ws of workspaces) {
      const paneIds = collectAllPaneIds(ws.panes);
      for (const pid of paneIds) {
        const scrollback = getTerminalScrollback(pid);
        if (scrollback) {
          await api.invoke('pane:update-scrollback' as any, { paneId: pid, scrollback });
        }
      }
    }
    await api.invoke(IPC_CHANNELS.SESSION_SAVE);
  };

  function collectAllPaneIds(layout: PaneLayout): string[] {
    if (layout.type === 'single') return [layout.pane.id];
    return [...collectAllPaneIds(layout.first), ...collectAllPaneIds(layout.second)];
  }

  const handleConfigChange = async (updates: Partial<WumxConfig>) => {
    const newConfig = await api.invoke('config:set', updates) as WumxConfig;
    setConfig(newConfig);
    if (updates.fontSize) setFontSize(updates.fontSize);
  };

  const activeWorkspace = workspaces.find((ws) => ws.id === activeWorkspaceId) || null;
  const totalUnread = notifications.filter((n) => !n.read).length;

  return (
    <div className="app-layout">
      <TitleBar
        title={activeWorkspace?.name || 'wumx'}
        onSaveSession={handleSaveSession}
      />
      <div className="main-content">
        <Sidebar
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSwitch={handleSwitchWorkspace}
          onCreate={handleCreateWorkspace}
          onDelete={handleDeleteWorkspace}
          onRename={handleRenameWorkspace}
          totalUnread={totalUnread}
        />
        <div className="workspace-content">
          {workspaces.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">+</div>
              <div className="empty-state-text">워크스페이스를 생성하세요</div>
            </div>
          ) : (
            workspaces.map((ws) => (
              <div
                key={ws.id}
                style={{
                  display: ws.id === activeWorkspaceId ? 'flex' : 'none',
                  flex: 1,
                  overflow: 'hidden',
                }}
              >
                <WorkspaceView
                  workspace={ws}
                  onUpdate={loadWorkspaces}
                  fontSize={fontSize}
                  visible={ws.id === activeWorkspaceId}
                />
              </div>
            ))
          )}
        </div>
        <NotificationPanel
          open={notificationPanelOpen}
          notifications={notifications}
          onClose={() => setNotificationPanelOpen(false)}
          onNotificationClick={(n) => {
            api.invoke(IPC_CHANNELS.NOTIFICATION_READ, { id: n.id });
            setActiveWorkspaceId(n.workspaceId);
            setNotificationPanelOpen(false);
          }}
          onClear={() => {
            // 모든 알림 삭제
            setNotifications([]);
            // 서버쪽도 전부 삭제
            workspaces.forEach((ws) => {
              api.invoke(IPC_CHANNELS.NOTIFICATION_CLEAR, ws.id);
            });
          }}
        />
        {settingsOpen && (
          <SettingsPanel
            config={config}
            onClose={() => setSettingsOpen(false)}
            onChange={handleConfigChange}
          />
        )}
      </div>
      <StatusBar
        workspace={activeWorkspace}
        notificationCount={totalUnread}
        onNotificationClick={() => setNotificationPanelOpen((p) => !p)}
        fontSize={fontSize}
      />
    </div>
  );
};
