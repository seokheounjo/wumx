import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  SessionData, Workspace, WorkspaceSession, PaneLayout,
  PaneLayoutSession, WindowBounds, WumxConfig
} from '../shared/types';

const SESSION_DIR = path.join(os.homedir(), '.wumx');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');
const BOUNDS_FILE = path.join(SESSION_DIR, 'window-bounds.json');
const CONFIG_FILE = path.join(SESSION_DIR, 'config.json');

export class SessionManager {
  constructor() {
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }
  }

  // ===== 세션 저장 =====
  async saveSession(workspaces: Workspace[], activeWorkspaceId: string): Promise<boolean> {
    try {
      const session: SessionData = {
        version: 1,
        savedAt: Date.now(),
        workspaces: workspaces.map((ws) => this.serializeWorkspace(ws)),
        activeWorkspaceId,
        windowBounds: this.loadWindowBounds(),
      };

      const tempFile = SESSION_FILE + '.tmp';
      fs.writeFileSync(tempFile, JSON.stringify(session, null, 2), 'utf-8');
      fs.renameSync(tempFile, SESSION_FILE);
      return true;
    } catch (err) {
      console.error('Session save failed:', err);
      return false;
    }
  }

  private serializeWorkspace(ws: Workspace): WorkspaceSession {
    return {
      id: ws.id,
      name: ws.name,
      cwd: ws.cwd,
      paneLayout: this.serializePaneLayout(ws.panes),
      activePaneId: ws.activePaneId,
      browserUrl: ws.browserUrl,
      browserVisible: ws.browserVisible,
    };
  }

  private serializePaneLayout(layout: PaneLayout): PaneLayoutSession {
    if (layout.type === 'single') {
      return {
        type: 'single',
        pane: {
          id: layout.pane.id,
          cwd: layout.pane.cwd,
          shell: layout.pane.shell,
          scrollback: layout.pane.scrollback.slice(-50000), // 마지막 50K 문자만 저장
          env: layout.pane.env,
        },
      };
    }
    return {
      type: 'split',
      direction: layout.direction,
      ratio: layout.ratio,
      first: this.serializePaneLayout(layout.first),
      second: this.serializePaneLayout(layout.second),
    };
  }

  // ===== 세션 로드 =====
  async loadSession(): Promise<SessionData | null> {
    try {
      if (!fs.existsSync(SESSION_FILE)) return null;
      const data = fs.readFileSync(SESSION_FILE, 'utf-8');
      const session: SessionData = JSON.parse(data);

      if (session.version !== 1) {
        console.warn('Unknown session version:', session.version);
        return null;
      }

      return session;
    } catch (err) {
      console.error('Session load failed:', err);
      return null;
    }
  }

  // ===== 세션 내보내기/가져오기 =====
  async exportSession(filePath: string, workspaces: Workspace[], activeWorkspaceId: string): Promise<boolean> {
    try {
      const session: SessionData = {
        version: 1,
        savedAt: Date.now(),
        workspaces: workspaces.map((ws) => this.serializeWorkspace(ws)),
        activeWorkspaceId,
        windowBounds: this.loadWindowBounds(),
      };
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  async importSession(filePath: string): Promise<SessionData | null> {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as SessionData;
    } catch {
      return null;
    }
  }

  // ===== 윈도우 위치/크기 =====
  saveWindowBounds(bounds: WindowBounds): void {
    try {
      fs.writeFileSync(BOUNDS_FILE, JSON.stringify(bounds), 'utf-8');
    } catch { /* ignore */ }
  }

  getWindowBounds(): WindowBounds | null {
    try {
      if (!fs.existsSync(BOUNDS_FILE)) return null;
      return JSON.parse(fs.readFileSync(BOUNDS_FILE, 'utf-8'));
    } catch {
      return null;
    }
  }

  private loadWindowBounds(): WindowBounds {
    return this.getWindowBounds() || {
      x: 100, y: 100, width: 1400, height: 900, maximized: false,
    };
  }

  // ===== 세션 파일 삭제 =====
  clearSession(): void {
    try {
      if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
    } catch { /* ignore */ }
  }

  // ===== 세션 백업 =====
  async createBackup(): Promise<string | null> {
    try {
      if (!fs.existsSync(SESSION_FILE)) return null;
      const backupDir = path.join(SESSION_DIR, 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(backupDir, `session-${timestamp}.json`);
      fs.copyFileSync(SESSION_FILE, backupFile);

      // 오래된 백업 정리 (최근 10개만 유지)
      const backups = fs.readdirSync(backupDir)
        .filter((f) => f.startsWith('session-') && f.endsWith('.json'))
        .sort()
        .reverse();

      for (const old of backups.slice(10)) {
        fs.unlinkSync(path.join(backupDir, old));
      }

      return backupFile;
    } catch {
      return null;
    }
  }

  // ===== 설정 저장/로드 =====
  saveConfig(config: Partial<WumxConfig>): void {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    } catch { /* ignore */ }
  }

  loadConfig(): Partial<WumxConfig> | null {
    try {
      if (!fs.existsSync(CONFIG_FILE)) return null;
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {
      return null;
    }
  }
}
