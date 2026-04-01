#!/usr/bin/env node

/**
 * wumx CLI - 외부에서 wumx 터미널을 제어하는 명령줄 도구
 *
 * 사용법:
 *   wumx list-workspaces
 *   wumx new-workspace --name "project-1" --cwd "C:\projects\myapp"
 *   wumx switch-workspace --id <workspace-id>
 *   wumx rename-workspace --id <id> --name "new name"
 *   wumx new-split --workspace-id <id> --pane-id <id> --direction vertical
 *   wumx send --pane-id <id> --text "npm run dev"
 *   wumx send-key --pane-id <id> --key Return
 *   wumx notify --text "Build complete!" --type info
 *   wumx context-set --key API_URL --value "http://localhost:3000"
 *   wumx context-get --key API_URL
 *   wumx context-list
 *   wumx browser-navigate --url "https://localhost:3000"
 *   wumx browser-toggle
 *   wumx list-notifications
 */

import * as net from 'net';
import * as path from 'path';
import * as os from 'os';
import { CLICommand, CLIResponse } from '../shared/types';

const PIPE_NAME = process.env.WUMX_PIPE || 'wumx-pipe';

function getPipePath(): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\${PIPE_NAME}`;
  }
  return path.join(os.tmpdir(), `${PIPE_NAME}.sock`);
}

function sendCommand(command: string, args: Record<string, unknown>): Promise<CLIResponse> {
  return new Promise((resolve, reject) => {
    const pipePath = getPipePath();
    const client = net.createConnection(pipePath, () => {
      const msg: CLICommand = {
        command,
        args,
        requestId: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
      client.write(JSON.stringify(msg) + '\n');
    });

    let buffer = '';
    client.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const response: CLIResponse = JSON.parse(line);
          client.end();
          resolve(response);
          return;
        } catch { /* wait for more data */ }
      }
    });

    client.on('error', (err) => {
      reject(new Error(
        `wumx에 연결할 수 없습니다. wumx가 실행 중인지 확인하세요.\n` +
        `Pipe: ${pipePath}\n` +
        `Error: ${err.message}`
      ));
    });

    // 5초 타임아웃
    setTimeout(() => {
      client.destroy();
      reject(new Error('Connection timeout'));
    }, 5000);
  });
}

function parseArgs(argv: string[]): { command: string; args: Record<string, string> } {
  const command = argv[0] || 'help';
  const args: Record<string, string> = {};

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[key] = value;
    }
  }

  return { command, args };
}

function showHelp(): void {
  console.log(`
wumx CLI v1.0.0 - AI 코딩 에이전트를 위한 터미널 제어 도구

USAGE:
  wumx <command> [options]

WORKSPACE COMMANDS:
  list-workspaces                        워크스페이스 목록 조회
  new-workspace --name <n> [--cwd <p>]   새 워크스페이스 생성
  rename-workspace --id <id> --name <n>  워크스페이스 이름 변경
  switch-workspace --id <id>             워크스페이스 전환

PANE COMMANDS:
  new-split --workspace-id <id> --pane-id <id> [--direction h|v]
                                         패널 분할
  close-surface --workspace-id <id> --pane-id <id>
                                         패널 닫기

TEXT/KEY COMMANDS:
  send --pane-id <id> --text <text>      텍스트 전송
  send-key --pane-id <id> --key <key>    키 전송 (Return, Tab, Ctrl+C 등)

NOTIFICATION COMMANDS:
  notify --text <text> [--type info|warning|error|agent]
                                         알림 전송
  list-notifications [--workspace-id <id>]
                                         알림 목록 조회

CONTEXT COMMANDS:
  context-set --key <k> --value <v> [--ttl <ms>]
                                         컨텍스트 설정
  context-get --key <k>                  컨텍스트 조회
  context-list                           모든 컨텍스트 목록

BROWSER COMMANDS:
  browser-navigate --url <url>           브라우저 URL 이동
  browser-toggle                         브라우저 열기/닫기

STATUS COMMANDS:
  set-status --text <text>               상태 텍스트 설정
  set-progress --value <0-100>           진행도 설정

ENVIRONMENT:
  WUMX_PIPE    Named pipe 이름 (기본: wumx-pipe)

EXAMPLES:
  wumx list-workspaces
  wumx new-workspace --name "frontend" --cwd "C:\\projects\\webapp"
  wumx send --pane-id abc123 --text "npm start"
  wumx send-key --pane-id abc123 --key Return
  wumx notify --text "Tests passed!" --type info
  wumx context-set --key BRANCH --value "feature/auth"
  wumx browser-navigate --url "http://localhost:3000"
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h') {
    showHelp();
    process.exit(0);
  }

  const { command, args } = parseArgs(argv);

  try {
    const response = await sendCommand(command, args);

    if (response.success) {
      if (response.data !== undefined) {
        if (typeof response.data === 'object') {
          console.log(JSON.stringify(response.data, null, 2));
        } else {
          console.log(response.data);
        }
      } else {
        console.log('OK');
      }
    } else {
      console.error(`Error: ${response.error}`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}

main();
