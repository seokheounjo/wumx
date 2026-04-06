// ============================================================
// wumx - AI 코딩 에이전트를 위한 Windows 터미널 멀티플렉서
// 공유 타입 정의
// ============================================================

export interface Workspace {
  id: string;
  name: string;
  cwd: string;
  gitBranch: string | null;
  gitRemote: string | null;
  prNumber: string | null;
  panes: PaneLayout;
  activePaneId: string;
  notifications: Notification[];
  unreadCount: number;
  createdAt: number;
  browserUrl: string | null;
  browserVisible: boolean;
  listeningPorts: number[];
}

export type PaneLayout = PaneSingle | PaneSplit;

export interface PaneSingle {
  type: 'single';
  pane: PaneInfo;
}

export interface PaneSplit {
  type: 'split';
  direction: 'horizontal' | 'vertical';
  ratio: number; // 0.0 ~ 1.0
  first: PaneLayout;
  second: PaneLayout;
}

export interface PaneInfo {
  id: string;
  name: string;
  cwd: string;
  shell: string;
  title: string;
  scrollback: string;
  hasNotification: boolean;
  notificationText: string | null;
  status: PaneStatus;
  pid: number | null;
  env: Record<string, string>;
}

export type PaneStatus = 'active' | 'idle' | 'waiting' | 'error';

export interface Notification {
  id: string;
  workspaceId: string;
  paneId: string;
  text: string;
  type: 'info' | 'warning' | 'error' | 'agent';
  timestamp: number;
  read: boolean;
}

export interface SessionData {
  version: number;
  savedAt: number;
  workspaces: WorkspaceSession[];
  activeWorkspaceId: string;
  windowBounds: WindowBounds;
}

export interface WorkspaceSession {
  id: string;
  name: string;
  cwd: string;
  paneLayout: PaneLayoutSession;
  activePaneId: string;
  browserUrl: string | null;
  browserVisible: boolean;
}

export interface PaneLayoutSession {
  type: 'single' | 'split';
  direction?: 'horizontal' | 'vertical';
  ratio?: number;
  first?: PaneLayoutSession;
  second?: PaneLayoutSession;
  pane?: PaneSession;
}

export interface PaneSession {
  id: string;
  cwd: string;
  shell: string;
  scrollback: string;
  env: Record<string, string>;
  name?: string;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

// IPC 채널 정의
export const IPC_CHANNELS = {
  // 워크스페이스
  WORKSPACE_CREATE: 'workspace:create',
  WORKSPACE_DELETE: 'workspace:delete',
  WORKSPACE_RENAME: 'workspace:rename',
  WORKSPACE_SWITCH: 'workspace:switch',
  WORKSPACE_LIST: 'workspace:list',
  WORKSPACE_GET: 'workspace:get',

  // 패널
  PANE_CREATE: 'pane:create',
  PANE_SPLIT: 'pane:split',
  PANE_CLOSE: 'pane:close',
  PANE_FOCUS: 'pane:focus',
  PANE_RESIZE: 'pane:resize',
  PANE_INPUT: 'pane:input',
  PANE_OUTPUT: 'pane:output',

  // PTY
  PTY_CREATE: 'pty:create',
  PTY_DATA: 'pty:data',
  PTY_RESIZE: 'pty:resize',
  PTY_EXIT: 'pty:exit',

  // 알림
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_READ: 'notification:read',
  NOTIFICATION_LIST: 'notification:list',
  NOTIFICATION_CLEAR: 'notification:clear',
  NOTIFICATION_JUMP_UNREAD: 'notification:jump-unread',

  // 세션
  SESSION_SAVE: 'session:save',
  SESSION_RESTORE: 'session:restore',
  SESSION_EXPORT: 'session:export',
  SESSION_IMPORT: 'session:import',

  // 브라우저
  BROWSER_NAVIGATE: 'browser:navigate',
  BROWSER_TOGGLE: 'browser:toggle',
  BROWSER_BACK: 'browser:back',
  BROWSER_FORWARD: 'browser:forward',
  BROWSER_RELOAD: 'browser:reload',
  BROWSER_DEVTOOLS: 'browser:devtools',
  BROWSER_EXECUTE_JS: 'browser:execute-js',

  // Git
  GIT_INFO: 'git:info',
  GIT_BRANCH: 'git:branch',

  // 컨텍스트 공유
  CONTEXT_SHARE: 'context:share',
  CONTEXT_GET: 'context:get',
  CONTEXT_LIST: 'context:list',

  // 시스템
  APP_READY: 'app:ready',
  APP_QUIT: 'app:quit',
  WINDOW_BOUNDS: 'window:bounds',
  THEME_CHANGE: 'theme:change',
} as const;

// CLI 명령어
export interface CLICommand {
  command: string;
  args: Record<string, unknown>;
  requestId: string;
}

export interface CLIResponse {
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// 컨텍스트 공유 데이터
export interface SharedContext {
  id: string;
  sourceWorkspaceId: string;
  sourcePaneId: string;
  key: string;
  value: string;
  timestamp: number;
  ttl: number | null; // null = 영구
}

// 설정
export interface WumxConfig {
  shell: string;
  fontSize: number;
  fontFamily: string;
  theme: 'dark' | 'light' | 'custom';
  customColors: TerminalColors | null;
  scrollbackLines: number;
  sessionAutoSave: boolean;
  sessionAutoSaveInterval: number; // ms
  sessionRestoreOnStart: boolean;
  notificationSound: boolean;
  notificationOSC: boolean;
  sidebarWidth: number;
  defaultCwd: string;
  browserUserAgent: string;
  pipeServerName: string;
}

export interface TerminalColors {
  background: string;
  foreground: string;
  cursor: string;
  selection: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

// 렌더러(브라우저)에서도 안전하게 동작하도록 process 접근을 감싸기
const _isWin = typeof process !== 'undefined' && process.platform === 'win32';
const _home = typeof process !== 'undefined'
  ? (process.env?.USERPROFILE || process.env?.HOME || 'C:\\')
  : 'C:\\';

export const DEFAULT_CONFIG: WumxConfig = {
  shell: _isWin ? 'powershell.exe' : '/bin/bash',
  fontSize: 14,
  fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
  theme: 'dark',
  customColors: null,
  scrollbackLines: 10000,
  sessionAutoSave: true,
  sessionAutoSaveInterval: 30000,
  sessionRestoreOnStart: true,
  notificationSound: true,
  notificationOSC: true,
  sidebarWidth: 260,
  defaultCwd: _home,
  browserUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) wumx/1.0',
  pipeServerName: 'wumx-pipe',
};
