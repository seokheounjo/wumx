import { exec } from 'child_process';
import * as os from 'os';

export interface PortInfo {
  port: number;
  pid: number;
  protocol: 'tcp' | 'udp';
}

/**
 * OS 수준 포트 감지
 * Windows: netstat -ano
 * Linux/macOS: ss -tlnp 또는 netstat
 */
export class PortScanner {
  private interval: ReturnType<typeof setInterval> | null = null;

  start(intervalMs: number, callback: (ports: PortInfo[]) => void): void {
    this.stop();
    // 즉시 한 번 실행
    this.scan().then(callback);
    this.interval = setInterval(() => {
      this.scan().then(callback);
    }, intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async scan(): Promise<PortInfo[]> {
    try {
      if (os.platform() === 'win32') {
        return await this.scanWindows();
      }
      return await this.scanUnix();
    } catch {
      return [];
    }
  }

  private scanWindows(): Promise<PortInfo[]> {
    return new Promise((resolve) => {
      exec('netstat -ano -p TCP', { timeout: 5000 }, (err, stdout) => {
        if (err) { resolve([]); return; }
        const ports: PortInfo[] = [];
        const lines = stdout.split('\n');
        for (const line of lines) {
          // TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    12345
          // TCP    [::]:3000       [::]:0       LISTENING    12345
          const match = line.match(/TCP\s+[\d.:[\]]+:(\d+)\s+[\d.:[\]]+:\d+\s+LISTENING\s+(\d+)/i);
          if (match) {
            const port = parseInt(match[1], 10);
            const pid = parseInt(match[2], 10);
            // 시스템 포트(< 1024) 및 PID 0 제외
            if (port >= 1024 && pid > 0) {
              // 중복 제거
              if (!ports.find((p) => p.port === port && p.pid === pid)) {
                ports.push({ port, pid, protocol: 'tcp' });
              }
            }
          }
        }
        resolve(ports);
      });
    });
  }

  private scanUnix(): Promise<PortInfo[]> {
    return new Promise((resolve) => {
      exec('ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null', { timeout: 5000 }, (err, stdout) => {
        if (err) { resolve([]); return; }
        const ports: PortInfo[] = [];
        const lines = stdout.split('\n');
        for (const line of lines) {
          // ss format: LISTEN 0 128 *:3000 *:* users:(("node",pid=12345,fd=3))
          const ssMatch = line.match(/:(\d+)\s.*pid=(\d+)/);
          if (ssMatch) {
            const port = parseInt(ssMatch[1], 10);
            const pid = parseInt(ssMatch[2], 10);
            if (port >= 1024 && pid > 0 && !ports.find((p) => p.port === port)) {
              ports.push({ port, pid, protocol: 'tcp' });
            }
          }
        }
        resolve(ports);
      });
    });
  }
}
