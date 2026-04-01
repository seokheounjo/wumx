/**
 * Preload 스크립트 - contextIsolation 환경에서 안전한 IPC 브리지
 * 렌더러에서 window.wumx API로 접근
 */
import { contextBridge, ipcRenderer, shell } from 'electron';
import { IPC_CHANNELS } from '../shared/types';

// 안전한 IPC 래퍼: 허용된 채널만 통과
const validSendChannels = [
  IPC_CHANNELS.PTY_DATA,
  IPC_CHANNELS.PTY_RESIZE,
  'window:minimize',
  'window:maximize',
  'window:close',
];

const validInvokeChannels = [
  IPC_CHANNELS.WORKSPACE_CREATE,
  IPC_CHANNELS.WORKSPACE_DELETE,
  IPC_CHANNELS.WORKSPACE_RENAME,
  IPC_CHANNELS.WORKSPACE_SWITCH,
  IPC_CHANNELS.WORKSPACE_LIST,
  IPC_CHANNELS.WORKSPACE_GET,
  IPC_CHANNELS.PTY_CREATE,
  IPC_CHANNELS.PANE_SPLIT,
  IPC_CHANNELS.PANE_CLOSE,
  IPC_CHANNELS.PANE_RESIZE,
  IPC_CHANNELS.NOTIFICATION_LIST,
  IPC_CHANNELS.NOTIFICATION_READ,
  IPC_CHANNELS.NOTIFICATION_CLEAR,
  IPC_CHANNELS.NOTIFICATION_JUMP_UNREAD,
  IPC_CHANNELS.SESSION_SAVE,
  IPC_CHANNELS.SESSION_RESTORE,
  IPC_CHANNELS.SESSION_EXPORT,
  IPC_CHANNELS.SESSION_IMPORT,
  IPC_CHANNELS.BROWSER_TOGGLE,
  IPC_CHANNELS.BROWSER_NAVIGATE,
  IPC_CHANNELS.BROWSER_EXECUTE_JS,
  IPC_CHANNELS.CONTEXT_SHARE,
  IPC_CHANNELS.CONTEXT_GET,
  IPC_CHANNELS.CONTEXT_LIST,
  IPC_CHANNELS.GIT_INFO,
  IPC_CHANNELS.THEME_CHANGE,
  'config:get',
  'config:set',
];

const validReceiveChannels = [
  IPC_CHANNELS.PTY_DATA,
  IPC_CHANNELS.PTY_EXIT,
  IPC_CHANNELS.NOTIFICATION_NEW,
  IPC_CHANNELS.NOTIFICATION_JUMP_UNREAD,
  IPC_CHANNELS.SESSION_RESTORE,
  IPC_CHANNELS.APP_READY,
  'toggle-notification-panel',
  'shortcut:new-workspace',
  'shortcut:switch-workspace',
  'shortcut:save-session',
  'shortcut:close-pane',
  'shortcut:split-horizontal',
  'shortcut:split-vertical',
  'shortcut:toggle-browser',
  'shortcut:search',
  'shortcut:zoom-in',
  'shortcut:zoom-out',
  'shortcut:zoom-reset',
  'shortcut:toggle-settings',
];

contextBridge.exposeInMainWorld('wumx', {
  // IPC: send (fire-and-forget)
  send: (channel: string, ...args: unknown[]) => {
    if (validSendChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },

  // IPC: invoke (request-response)
  invoke: (channel: string, ...args: unknown[]) => {
    if (validInvokeChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Channel not allowed: ${channel}`));
  },

  // IPC: on (listen)
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (validReceiveChannels.includes(channel)) {
      const sub = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
      ipcRenderer.on(channel, sub);
      return () => ipcRenderer.removeListener(channel, sub);
    }
    return () => {};
  },

  // IPC: once (listen once)
  once: (channel: string, callback: (...args: unknown[]) => void) => {
    if (validReceiveChannels.includes(channel)) {
      ipcRenderer.once(channel, (_event, ...args) => callback(...args));
    }
  },

  // 외부 링크 열기
  openExternal: (url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
  },

  // 윈도우 상태
  isMaximized: () => ipcRenderer.sendSync('window:is-maximized'),

  // 플랫폼 정보
  platform: process.platform,
});

// TypeScript 타입 선언
declare global {
  interface Window {
    wumx: {
      send: (channel: string, ...args: unknown[]) => void;
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
      once: (channel: string, callback: (...args: unknown[]) => void) => void;
      openExternal: (url: string) => void;
      isMaximized: () => boolean;
      platform: string;
    };
  }
}
