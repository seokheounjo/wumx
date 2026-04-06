import { app, BrowserWindow, ipcMain, shell, globalShortcut } from 'electron';
import * as path from 'path';
import { WorkspaceManager } from './workspace-manager';
import { SessionManager } from './session-manager';
import { NotificationManager } from './notification-manager';
import { IPCServer } from './ipc-server';
import { ContextManager } from './context-manager';
import { PTYManager } from './pty-manager';
import { PortScanner } from './port-scanner';
import { IPC_CHANNELS, DEFAULT_CONFIG, WumxConfig, SessionData } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let workspaceManager: WorkspaceManager;
let sessionManager: SessionManager;
let notificationManager: NotificationManager;
let ipcServer: IPCServer;
let contextManager: ContextManager;
let ptyManager: PTYManager;
let portScanner: PortScanner;
let config: WumxConfig = { ...DEFAULT_CONFIG };

function createWindow(): void {
  const savedBounds = sessionManager.getWindowBounds();

  mainWindow = new BrowserWindow({
    x: savedBounds?.x,
    y: savedBounds?.y,
    width: savedBounds?.width || 1400,
    height: savedBounds?.height || 900,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1a1b26',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      sandbox: false, // node-pty 호환
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
  });

  if (savedBounds?.maximized) {
    mainWindow.maximize();
  }

  const isDev = process.env.WUMX_DEV === '1';
  if (isDev) {
    mainWindow.loadURL('http://localhost:9000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // DevTools는 개발 모드에서만
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'right' });

  mainWindow.on('resize', () => saveWindowBounds());
  mainWindow.on('move', () => saveWindowBounds());
  // 초기 위치도 저장
  saveWindowBounds();
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.on('close', async (e) => {
    e.preventDefault();
    await handleAppClose();
    mainWindow?.destroy();
  });
}

function saveWindowBounds(): void {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const maximized = mainWindow.isMaximized();
  sessionManager.saveWindowBounds({ ...bounds, maximized });
}

async function handleAppClose(): Promise<void> {
  if (config.sessionAutoSave) {
    // 렌더러에 scrollback 수집 요청 후 세션 저장
    try {
      mainWindow?.webContents.send('request-save-scrollback');
      // 렌더러가 scrollback을 보내올 시간 대기
      await new Promise((r) => setTimeout(r, 500));
    } catch {}
    await sessionManager.saveSession(workspaceManager.getAllWorkspaces(), workspaceManager.getActiveWorkspaceId());
  }
  ptyManager.disposeAll();
  portScanner.stop();
  ipcServer.stop();
}

function registerIpcHandlers(): void {
  // ===== 워크스페이스 =====
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_CREATE, async (_, data) => {
    return workspaceManager.createWorkspace(data.name, data.cwd);
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_DELETE, async (_, id) => {
    const paneIds = workspaceManager.getPaneIds(id);
    paneIds.forEach((paneId) => ptyManager.dispose(paneId));
    return workspaceManager.deleteWorkspace(id);
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_RENAME, async (_, { id, name }) => {
    return workspaceManager.renameWorkspace(id, name);
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_SWITCH, async (_, id) => {
    return workspaceManager.switchWorkspace(id);
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_LIST, async () => {
    return workspaceManager.getAllWorkspaces();
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET, async (_, id) => {
    return workspaceManager.getWorkspace(id);
  });

  // ===== PTY =====
  ipcMain.handle(IPC_CHANNELS.PTY_CREATE, async (_, { paneId, cwd, shell: shellPath, cols, rows }) => {
    const { pty, isNew } = ptyManager.getOrCreate(paneId, shellPath || config.shell, cwd || config.defaultCwd, cols, rows);

    // 기존 PTY면 리사이즈만 하고 반환 (이벤트 중복 등록 방지)
    if (!isNew) {
      try { pty.resize(cols, rows); } catch {}
      return { pid: pty.pid, reused: true };
    }

    pty.onData((data: string) => {
      mainWindow?.webContents.send(IPC_CHANNELS.PTY_DATA, { paneId, data });

      // OSC 시퀀스 감지
      const notifications = notificationManager.parseOSCSequences(data, paneId, workspaceManager.getActiveWorkspaceId());
      notifications.forEach((n) => {
        mainWindow?.webContents.send(IPC_CHANNELS.NOTIFICATION_NEW, n);
        workspaceManager.addNotification(n);
      });

      // CWD 변경 감지 (OSC 7)
      const cwdMatch = data.match(/\x1b\]7;file:\/\/[^/]*([^\x07\x1b]*)\x07/);
      if (cwdMatch) {
        const newCwd = decodeURIComponent(cwdMatch[1]);
        workspaceManager.updatePaneCwd(paneId, newCwd);
        const ws = workspaceManager.findWorkspaceByPane(paneId);
        if (ws) workspaceManager.refreshGitInfo(ws.id);
      }
    });

    pty.onExit(({ exitCode }: { exitCode: number }) => {
      mainWindow?.webContents.send(IPC_CHANNELS.PTY_EXIT, { paneId, exitCode });
    });

    return { pid: pty.pid, reused: false };
  });

  ipcMain.on(IPC_CHANNELS.PTY_DATA, (_, { paneId, data }) => {
    ptyManager.write(paneId, data);
  });

  ipcMain.on(IPC_CHANNELS.PTY_RESIZE, (_, { paneId, cols, rows }) => {
    ptyManager.resize(paneId, cols, rows);
  });

  // ===== 패널 =====
  ipcMain.handle('pane:update-scrollback', async (_, { paneId, scrollback }) => {
    workspaceManager.updatePaneScrollback(paneId, scrollback);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.PANE_RENAME, async (_, { paneId, name }) => {
    return workspaceManager.renamePane(paneId, name);
  });

  ipcMain.handle(IPC_CHANNELS.PANE_SPLIT, async (_, { workspaceId, paneId, direction }) => {
    return workspaceManager.splitPane(workspaceId, paneId, direction);
  });

  ipcMain.handle(IPC_CHANNELS.PANE_CLOSE, async (_, { workspaceId, paneId }) => {
    ptyManager.dispose(paneId);
    return workspaceManager.closePane(workspaceId, paneId);
  });

  ipcMain.handle(IPC_CHANNELS.PANE_RESIZE, async (_, { workspaceId, paneId, ratio }) => {
    return workspaceManager.resizePane(workspaceId, paneId, ratio);
  });

  // ===== 알림 =====
  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_LIST, async (_, workspaceId) => {
    return notificationManager.getNotifications(workspaceId);
  });

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_READ, async (_, { id }) => {
    return notificationManager.markAsRead(id);
  });

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_CLEAR, async (_, workspaceId) => {
    notificationManager.clearNotifications(workspaceId);
    workspaceManager.clearWorkspaceNotifications(workspaceId);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_JUMP_UNREAD, async () => {
    return notificationManager.getLatestUnread();
  });

  // ===== 세션 =====
  ipcMain.handle(IPC_CHANNELS.SESSION_SAVE, async () => {
    return sessionManager.saveSession(workspaceManager.getAllWorkspaces(), workspaceManager.getActiveWorkspaceId());
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_RESTORE, async () => {
    return sessionManager.loadSession();
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_EXPORT, async (_, filePath) => {
    return sessionManager.exportSession(filePath, workspaceManager.getAllWorkspaces(), workspaceManager.getActiveWorkspaceId());
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_IMPORT, async (_, filePath) => {
    return sessionManager.importSession(filePath);
  });

  // ===== 브라우저 =====
  ipcMain.handle(IPC_CHANNELS.BROWSER_TOGGLE, async (_, workspaceId) => {
    return workspaceManager.toggleBrowser(workspaceId);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_NAVIGATE, async (_, { workspaceId, url }) => {
    workspaceManager.setBrowserUrl(workspaceId, url);
    return { url };
  });

  // 브라우저 JS 실행 API
  ipcMain.handle(IPC_CHANNELS.BROWSER_EXECUTE_JS, async (_, { code }) => {
    // 렌더러에서 webview에 JS를 실행하도록 전달
    mainWindow?.webContents.send('browser:execute-js-request', { code });
    return { sent: true };
  });

  // ===== 컨텍스트 공유 =====
  ipcMain.handle(IPC_CHANNELS.CONTEXT_SHARE, async (_, { key, value, workspaceId, paneId, ttl }) => {
    return contextManager.set(key, value, workspaceId, paneId, ttl);
  });

  ipcMain.handle(IPC_CHANNELS.CONTEXT_GET, async (_, key) => {
    return contextManager.get(key);
  });

  ipcMain.handle(IPC_CHANNELS.CONTEXT_LIST, async () => {
    return contextManager.list();
  });

  // ===== Git =====
  ipcMain.handle(IPC_CHANNELS.GIT_INFO, async (_, cwd) => {
    return workspaceManager.getGitInfo(cwd);
  });

  // ===== 설정 =====
  ipcMain.handle('config:get', async () => {
    return config;
  });

  ipcMain.handle('config:set', async (_, updates) => {
    config = { ...config, ...updates };
    sessionManager.saveConfig(config);
    return config;
  });

  // ===== 윈도우 컨트롤 =====
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.on('window:is-maximized', (event) => {
    event.returnValue = mainWindow?.isMaximized() || false;
  });
}

function registerGlobalShortcuts(): void {
  const send = (channel: string, data?: unknown) => {
    mainWindow?.webContents.send(channel, data);
  };

  // 워크스페이스 전환: Ctrl+1 ~ Ctrl+9
  for (let i = 1; i <= 9; i++) {
    globalShortcut.register(`CommandOrControl+${i}`, () => {
      send('shortcut:switch-workspace', { index: i - 1 });
    });
  }

  // 새 워크스페이스: Ctrl+N
  globalShortcut.register('CommandOrControl+N', () => {
    send('shortcut:new-workspace');
  });

  // 세션 저장: Ctrl+S
  globalShortcut.register('CommandOrControl+S', () => {
    send('shortcut:save-session');
  });

  // 패널 닫기: Ctrl+W
  globalShortcut.register('CommandOrControl+W', () => {
    send('shortcut:close-pane');
  });

  // 가로 분할: Ctrl+Shift+H
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    send('shortcut:split-horizontal');
  });

  // 세로 분할: Ctrl+Shift+V
  globalShortcut.register('CommandOrControl+Shift+V', () => {
    send('shortcut:split-vertical');
  });

  // 브라우저 토글: Ctrl+Shift+B
  globalShortcut.register('CommandOrControl+Shift+B', () => {
    send('shortcut:toggle-browser');
  });

  // 알림 패널 토글: Ctrl+Shift+I
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    send('toggle-notification-panel');
  });

  // 읽지 않은 알림으로 이동: Ctrl+Shift+U
  globalShortcut.register('CommandOrControl+Shift+U', () => {
    send(IPC_CHANNELS.NOTIFICATION_JUMP_UNREAD);
  });

  // 터미널 검색: Ctrl+Shift+F
  globalShortcut.register('CommandOrControl+Shift+F', () => {
    send('shortcut:search');
  });

  // 폰트 확대/축소: Ctrl+= / Ctrl+-
  globalShortcut.register('CommandOrControl+=', () => {
    send('shortcut:zoom-in');
  });

  globalShortcut.register('CommandOrControl+-', () => {
    send('shortcut:zoom-out');
  });

  globalShortcut.register('CommandOrControl+0', () => {
    send('shortcut:zoom-reset');
  });

  // 설정: Ctrl+,
  globalShortcut.register('CommandOrControl+,', () => {
    send('shortcut:toggle-settings');
  });
}

// Git 정보 자동 갱신 (30초 주기 - 성능 개선)
function setupGitAutoRefresh(): void {
  setInterval(async () => {
    const workspaces = workspaceManager.getAllWorkspaces();
    for (const ws of workspaces) {
      await workspaceManager.refreshGitInfo(ws.id);
    }
  }, 30000);
}

// 포트 감지 자동 갱신 (15초 주기 - 성능 개선)
function setupPortScanning(): void {
  portScanner = new PortScanner();
  portScanner.start(15000, (ports) => {
    const workspaces = workspaceManager.getAllWorkspaces();
    for (const ws of workspaces) {
      // PTY의 PID를 기준으로 해당 워크스페이스의 포트 매칭
      const paneIds = workspaceManager.getPaneIds(ws.id);
      const pids: number[] = [];
      for (const paneId of paneIds) {
        const pty = ptyManager.getPty(paneId);
        if (pty) pids.push(pty.pid);
      }
      const wsPorts = ports.filter((p) => pids.includes(p.pid)).map((p) => p.port);
      workspaceManager.updatePorts(ws.id, wsPorts);
    }
  });
}

function setupAutoSave(): void {
  if (config.sessionAutoSave) {
    // 시작 5초 후 첫 저장
    setTimeout(async () => {
      try {
        await sessionManager.saveSession(workspaceManager.getAllWorkspaces(), workspaceManager.getActiveWorkspaceId());
      } catch {}
    }, 5000);
    setInterval(async () => {
      try {
        await sessionManager.saveSession(
          workspaceManager.getAllWorkspaces(),
          workspaceManager.getActiveWorkspaceId()
        );
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, config.sessionAutoSaveInterval);
  }
}

// 세션 복원: 저장된 세션으로 워크스페이스 재구성
async function restoreSessionData(session: SessionData): Promise<void> {
  // 기존 워크스페이스 제거 (세션 복원 시)
  const existing = workspaceManager.getAllWorkspaces();
  for (const ws of existing) {
    const paneIds = workspaceManager.getPaneIds(ws.id);
    paneIds.forEach((id) => ptyManager.dispose(id));
    workspaceManager.forceDeleteWorkspace(ws.id);
  }

  // 세션에서 워크스페이스 복원
  for (const wsSession of session.workspaces) {
    workspaceManager.restoreWorkspace(wsSession);
  }

  if (session.activeWorkspaceId) {
    workspaceManager.switchWorkspace(session.activeWorkspaceId);
  }
}

app.whenReady().then(async () => {
  sessionManager = new SessionManager();

  // 저장된 설정 로드
  const savedConfig = sessionManager.loadConfig();
  if (savedConfig) config = { ...config, ...savedConfig };

  notificationManager = new NotificationManager();
  contextManager = new ContextManager();
  ptyManager = new PTYManager();

  // 세션이 있으면 기본 워크스페이스 생성 건너뛰기
  let hasSession = false;
  if (config.sessionRestoreOnStart) {
    const session = await sessionManager.loadSession();
    if (session && session.workspaces.length > 0) {
      hasSession = true;
      workspaceManager = new WorkspaceManager(config, true); // skipDefault
      await restoreSessionData(session);
    }
  }
  if (!hasSession) {
    workspaceManager = new WorkspaceManager(config, false);
  }

  ipcServer = new IPCServer(config.pipeServerName, workspaceManager, notificationManager, contextManager, ptyManager);

  registerIpcHandlers();
  createWindow();
  registerGlobalShortcuts();
  setupAutoSave();
  setupGitAutoRefresh();
  setupPortScanning();
  ipcServer.start();

  // 렌더러에 세션 복원 데이터 전달
  mainWindow?.webContents.once('did-finish-load', async () => {
    if (config.sessionRestoreOnStart) {
      const session = await sessionManager.loadSession();
      if (session) {
        mainWindow?.webContents.send(IPC_CHANNELS.SESSION_RESTORE, session);
      }
    }
    mainWindow?.webContents.send(IPC_CHANNELS.APP_READY);

    // --test 플래그: 자동 테스트 실행
    if (process.argv.includes('--test') && mainWindow) {
      // 렌더러 초기화 대기
      setTimeout(async () => {
        const { TestHarness } = require('./test-harness');
        const harness = new TestHarness(mainWindow!);
        await harness.runAll();
        // 테스트 완료 후 종료
        if (process.argv.includes('--test-exit')) {
          app.quit();
        }
      }, 4000);
    }
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
