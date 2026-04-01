import * as net from 'net';
import { CLICommand, CLIResponse } from '../shared/types';
import { WorkspaceManager } from './workspace-manager';
import { NotificationManager } from './notification-manager';
import { ContextManager } from './context-manager';
import { PTYManager } from './pty-manager';

/**
 * Named Pipe IPC 서버 (Windows)
 * CLI 및 외부 도구에서 wumx를 제어할 수 있는 API
 * Unix에서는 Unix Domain Socket, Windows에서는 Named Pipe 사용
 */
export class IPCServer {
  private server: net.Server | null = null;
  private pipeName: string;
  private workspaceManager: WorkspaceManager;
  private notificationManager: NotificationManager;
  private contextManager: ContextManager;
  private ptyManager: PTYManager;

  constructor(
    pipeName: string,
    workspaceManager: WorkspaceManager,
    notificationManager: NotificationManager,
    contextManager: ContextManager,
    ptyManager: PTYManager
  ) {
    this.pipeName = pipeName;
    this.workspaceManager = workspaceManager;
    this.notificationManager = notificationManager;
    this.contextManager = contextManager;
    this.ptyManager = ptyManager;
  }

  private getPipePath(): string {
    if (process.platform === 'win32') {
      return `\\\\.\\pipe\\${this.pipeName}`;
    }
    // Unix: /tmp/wumx.sock
    const path = require('path');
    const os = require('os');
    return path.join(os.tmpdir(), `${this.pipeName}.sock`);
  }

  start(): void {
    const pipePath = this.getPipePath();

    // Unix에서 기존 소켓 파일 정리
    if (process.platform !== 'win32') {
      try {
        const fs = require('fs');
        if (fs.existsSync(pipePath)) fs.unlinkSync(pipePath);
      } catch { /* ignore */ }
    }

    this.server = net.createServer((socket) => {
      let buffer = '';

      socket.on('data', (data) => {
        buffer += data.toString();

        // 줄바꿈으로 구분된 JSON 메시지 처리
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const cmd: CLICommand = JSON.parse(line);
            this.handleCommand(cmd).then((response) => {
              socket.write(JSON.stringify(response) + '\n');
            });
          } catch (err) {
            socket.write(JSON.stringify({
              requestId: 'unknown',
              success: false,
              error: 'Invalid JSON',
            }) + '\n');
          }
        }
      });

      socket.on('error', () => { /* 연결 오류 무시 */ });
    });

    this.server.listen(pipePath, () => {
      console.log(`[wumx] IPC server listening on ${pipePath}`);
    });

    this.server.on('error', (err) => {
      console.error('[wumx] IPC server error:', err);
    });
  }

  stop(): void {
    this.server?.close();
    this.server = null;

    // Unix 소켓 파일 정리
    if (process.platform !== 'win32') {
      try {
        const fs = require('fs');
        const pipePath = this.getPipePath();
        if (fs.existsSync(pipePath)) fs.unlinkSync(pipePath);
      } catch { /* ignore */ }
    }
  }

  private async handleCommand(cmd: CLICommand): Promise<CLIResponse> {
    const { command, args, requestId } = cmd;

    try {
      switch (command) {
        // ===== 워크스페이스 =====
        case 'list-workspaces': {
          const workspaces = this.workspaceManager.getAllWorkspaces().map((ws) => ({
            id: ws.id,
            name: ws.name,
            cwd: ws.cwd,
            gitBranch: ws.gitBranch,
            paneCount: this.workspaceManager.getPaneIds(ws.id).length,
            unreadCount: ws.unreadCount,
          }));
          return { requestId, success: true, data: workspaces };
        }

        case 'new-workspace': {
          const ws = this.workspaceManager.createWorkspace(
            args.name as string || `workspace-${Date.now()}`,
            args.cwd as string
          );
          return { requestId, success: true, data: { id: ws.id, name: ws.name } };
        }

        case 'rename-workspace': {
          const ok = this.workspaceManager.renameWorkspace(args.id as string, args.name as string);
          return { requestId, success: ok };
        }

        case 'switch-workspace': {
          const ws = this.workspaceManager.switchWorkspace(args.id as string);
          return { requestId, success: !!ws };
        }

        // ===== 패널 =====
        case 'new-split': {
          const result = this.workspaceManager.splitPane(
            args.workspaceId as string,
            args.paneId as string,
            (args.direction as 'horizontal' | 'vertical') || 'vertical'
          );
          return { requestId, success: !!result, data: result };
        }

        case 'close-surface': {
          const ok = this.workspaceManager.closePane(args.workspaceId as string, args.paneId as string);
          return { requestId, success: ok };
        }

        // ===== 텍스트/키 전송 =====
        case 'send': {
          this.ptyManager.sendText(args.paneId as string, args.text as string);
          return { requestId, success: true };
        }

        case 'send-key': {
          this.ptyManager.sendKey(args.paneId as string, args.key as string);
          return { requestId, success: true };
        }

        // ===== 알림 =====
        case 'notify': {
          const notification = this.notificationManager['createNotification'](
            args.workspaceId as string || this.workspaceManager.getActiveWorkspaceId(),
            args.paneId as string || '',
            args.text as string,
            (args.type as 'info' | 'warning' | 'error' | 'agent') || 'info'
          );
          return { requestId, success: true, data: notification };
        }

        case 'list-notifications': {
          const notifs = this.notificationManager.getNotifications(args.workspaceId as string);
          return { requestId, success: true, data: notifs };
        }

        // ===== 상태/진행도 =====
        case 'set-status': {
          return { requestId, success: true, data: { status: args.text } };
        }

        case 'set-progress': {
          return { requestId, success: true, data: { progress: args.value } };
        }

        // ===== 컨텍스트 공유 =====
        case 'context-set': {
          const ctx = this.contextManager.set(
            args.key as string,
            args.value as string,
            args.workspaceId as string || '',
            args.paneId as string || '',
            args.ttl as number | null
          );
          return { requestId, success: true, data: ctx };
        }

        case 'context-get': {
          const ctx = this.contextManager.get(args.key as string);
          return { requestId, success: !!ctx, data: ctx };
        }

        case 'context-list': {
          const list = this.contextManager.list();
          return { requestId, success: true, data: list };
        }

        // ===== 브라우저 =====
        case 'browser-navigate': {
          this.workspaceManager.setBrowserUrl(
            args.workspaceId as string || this.workspaceManager.getActiveWorkspaceId(),
            args.url as string
          );
          return { requestId, success: true };
        }

        case 'browser-toggle': {
          const visible = this.workspaceManager.toggleBrowser(
            args.workspaceId as string || this.workspaceManager.getActiveWorkspaceId()
          );
          return { requestId, success: true, data: { visible } };
        }

        default:
          return { requestId, success: false, error: `Unknown command: ${command}` };
      }
    } catch (err) {
      return { requestId, success: false, error: String(err) };
    }
  }
}
