const { contextBridge, ipcRenderer, shell } = require('electron');

const validSendChannels = [
  'pty:data', 'pty:resize',
  'window:minimize', 'window:maximize', 'window:close',
];

const validInvokeChannels = [
  'workspace:create', 'workspace:delete', 'workspace:rename',
  'workspace:switch', 'workspace:list', 'workspace:get',
  'pty:create',
  'pane:split', 'pane:close', 'pane:resize', 'pane:update-scrollback', 'pane:rename',
  'notification:list', 'notification:read', 'notification:clear', 'notification:jump-unread',
  'session:save', 'session:restore', 'session:export', 'session:import',
  'browser:toggle', 'browser:navigate', 'browser:execute-js',
  'context:share', 'context:get', 'context:list',
  'git:info', 'theme:change',
  'config:get', 'config:set',
];

const validReceiveChannels = [
  'pty:data', 'pty:exit',
  'notification:new', 'notification:jump-unread',
  'session:restore', 'app:ready',
  'toggle-notification-panel',
  'shortcut:new-workspace', 'shortcut:switch-workspace',
  'shortcut:save-session', 'shortcut:close-pane',
  'shortcut:split-horizontal', 'shortcut:split-vertical',
  'shortcut:toggle-browser', 'shortcut:search',
  'shortcut:zoom-in', 'shortcut:zoom-out', 'shortcut:zoom-reset',
  'shortcut:toggle-settings',
  'request-save-scrollback',
];

contextBridge.exposeInMainWorld('wumx', {
  send: (channel, ...args) => {
    if (validSendChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },
  invoke: (channel, ...args) => {
    if (validInvokeChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error('Channel not allowed: ' + channel));
  },
  on: (channel, callback) => {
    if (validReceiveChannels.includes(channel)) {
      const sub = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, sub);
      return () => ipcRenderer.removeListener(channel, sub);
    }
    return () => {};
  },
  once: (channel, callback) => {
    if (validReceiveChannels.includes(channel)) {
      ipcRenderer.once(channel, (_event, ...args) => callback(...args));
    }
  },
  openExternal: (url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
  },
  isMaximized: () => ipcRenderer.sendSync('window:is-maximized'),
  platform: process.platform,
});
