import * as pty from 'node-pty';
import * as os from 'os';

interface PTYInstance {
  process: pty.IPty;
  paneId: string;
}

export class PTYManager {
  private ptys: Map<string, PTYInstance> = new Map();

  // 기존 PTY가 있으면 반환 (재사용)
  getOrCreate(paneId: string, shell: string, cwd: string, cols: number = 80, rows: number = 24): { pty: pty.IPty; isNew: boolean } {
    const existing = this.ptys.get(paneId);
    if (existing) {
      return { pty: existing.process, isNew: false };
    }
    return { pty: this.create(paneId, shell, cwd, cols, rows), isNew: true };
  }

  create(paneId: string, shell: string, cwd: string, cols: number = 80, rows: number = 24): pty.IPty {
    this.dispose(paneId);

    // CWD 유효성 검사 - 존재하지 않으면 홈 디렉토리로 폴백
    let safeCwd = cwd;
    try {
      const fs = require('fs');
      if (!fs.existsSync(safeCwd)) {
        safeCwd = os.homedir();
      }
    } catch {
      safeCwd = os.homedir();
    }

    const env = { ...process.env } as Record<string, string>;
    env.WUMX = '1';
    env.WUMX_PANE = paneId;
    env.TERM_PROGRAM = 'wumx';

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: safeCwd,
      env,
      useConpty: os.platform() === 'win32',
    });

    this.ptys.set(paneId, { process: ptyProcess, paneId });
    return ptyProcess;
  }

  write(paneId: string, data: string): void {
    const instance = this.ptys.get(paneId);
    if (instance) {
      instance.process.write(data);
    }
  }

  resize(paneId: string, cols: number, rows: number): void {
    const instance = this.ptys.get(paneId);
    if (instance) {
      try {
        instance.process.resize(cols, rows);
      } catch {
        // 프로세스가 이미 종료됐을 수 있음
      }
    }
  }

  dispose(paneId: string): void {
    const instance = this.ptys.get(paneId);
    if (instance) {
      try {
        instance.process.kill();
      } catch {
        // 이미 종료됨
      }
      this.ptys.delete(paneId);
    }
  }

  disposeAll(): void {
    for (const [paneId] of this.ptys) {
      this.dispose(paneId);
    }
  }

  getPty(paneId: string): pty.IPty | null {
    return this.ptys.get(paneId)?.process || null;
  }

  sendText(paneId: string, text: string): void {
    this.write(paneId, text);
  }

  sendKey(paneId: string, key: string): void {
    const keyMap: Record<string, string> = {
      Return: '\r',
      Enter: '\r',
      Tab: '\t',
      Escape: '\x1b',
      Backspace: '\x7f',
      'Ctrl+C': '\x03',
      'Ctrl+D': '\x04',
      'Ctrl+Z': '\x1a',
      'Ctrl+L': '\x0c',
      Up: '\x1b[A',
      Down: '\x1b[B',
      Right: '\x1b[C',
      Left: '\x1b[D',
    };
    const mapped = keyMap[key] || key;
    this.write(paneId, mapped);
  }
}
