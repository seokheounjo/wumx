import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { IPC_CHANNELS } from '../../shared/types';
import '@xterm/xterm/css/xterm.css';

const api = window.wumx;

// 전역 터미널 캐시
const terminalCache = new Map<string, {
  terminal: XTerm;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  element: HTMLDivElement;
  cleanups: (() => void)[];
}>();

// 디바운스된 fit - 깜빡임 방지
const fitTimers = new Map<string, ReturnType<typeof setTimeout>>();
function debouncedFit(paneId: string, delay: number = 100) {
  const existing = fitTimers.get(paneId);
  if (existing) clearTimeout(existing);
  fitTimers.set(paneId, setTimeout(() => {
    const cached = terminalCache.get(paneId);
    if (!cached) return;
    try {
      cached.fitAddon.fit();
      api.send(IPC_CHANNELS.PTY_RESIZE, { paneId, cols: cached.terminal.cols, rows: cached.terminal.rows });
    } catch {}
    fitTimers.delete(paneId);
  }, delay));
}

interface TerminalProps {
  paneId: string;
  cwd: string;
  shellPath?: string;
  focused: boolean;
  onFocus: () => void;
  onTitleChange?: (title: string) => void;
  scrollbackContent?: string;
  fontSize?: number;
  visible?: boolean;
}

export const TerminalComponent: React.FC<TerminalProps> = ({
  paneId, cwd, shellPath, focused, onFocus, onTitleChange,
  scrollbackContent, fontSize = 14, visible = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mountedRef.current) return;
    mountedRef.current = true;

    let cached = terminalCache.get(paneId);

    if (cached) {
      // 캐시된 터미널 재사용
      containerRef.current.appendChild(cached.element);
      // 컨테이너 크기 확보 후 fit
      let attempt = 0;
      const retryFit = () => {
        attempt++;
        if ((cached!.element.clientWidth < 10 || cached!.element.clientHeight < 10) && attempt < 20) {
          setTimeout(retryFit, 50);
          return;
        }
        debouncedFit(paneId, 30);
      };
      requestAnimationFrame(retryFit);
      return () => {
        mountedRef.current = false;
        if (cached!.element.parentElement) cached!.element.parentElement.removeChild(cached!.element);
      };
    }

    // 새 터미널 생성 - absolute 배치로 부모를 꽉 채움
    const termElement = document.createElement('div');
    containerRef.current.appendChild(termElement);

    const terminal = new XTerm({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize,
      fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
      lineHeight: 1.2,
      scrollback: 10000,
      allowProposedApi: true,
      rightClickSelectsWord: true,
      theme: {
        background: '#1a1b26',
        foreground: '#c0caf5',
        cursor: '#c0caf5',
        selectionBackground: '#33467c',
        selectionForeground: '#c0caf5',
        black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
        blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
        brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a',
        brightYellow: '#e0af68', brightBlue: '#7aa2f7', brightMagenta: '#bb9af7',
        brightCyan: '#7dcfff', brightWhite: '#c0caf5',
      },
    });

    // 클립보드
    terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type !== 'keydown') return true;
      if (e.ctrlKey && !e.shiftKey && e.key === 'c') {
        const sel = terminal.getSelection();
        if (sel) { navigator.clipboard.writeText(sel); terminal.clearSelection(); return false; }
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 'v') {
        navigator.clipboard.readText().then((t) => { if (t) api.send(IPC_CHANNELS.PTY_DATA, { paneId, data: t }); });
        return false;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        const sel = terminal.getSelection(); if (sel) navigator.clipboard.writeText(sel); return false;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        navigator.clipboard.readText().then((t) => { if (t) api.send(IPC_CHANNELS.PTY_DATA, { paneId, data: t }); });
        return false;
      }
      return true;
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(new WebLinksAddon((_event, uri) => api.openExternal(uri)));
    const u11 = new Unicode11Addon(); terminal.loadAddon(u11); terminal.unicode.activeVersion = '11';

    terminal.open(termElement);
    try { const w = new WebglAddon(); w.onContextLoss(() => w.dispose()); terminal.loadAddon(w); } catch {}

    // 컨테이너가 실제 크기를 가질 때까지 대기 후 PTY 생성
    let fitAttempt = 0;
    const waitForSizeAndInit = () => {
      fitAttempt++;
      const w = termElement.clientWidth;
      const h = termElement.clientHeight;
      if ((w < 10 || h < 10) && fitAttempt < 30) {
        // 아직 레이아웃이 안 잡힘 - 50ms 후 재시도
        setTimeout(waitForSizeAndInit, 50);
        return;
      }
      try { fitAddon.fit(); } catch {}
      api.invoke(IPC_CHANNELS.PTY_CREATE, {
        paneId, cwd, shell: shellPath,
        cols: terminal.cols || 80, rows: terminal.rows || 24,
      });
    };
    requestAnimationFrame(waitForSizeAndInit);

    if (scrollbackContent) terminal.write(scrollbackContent);

    terminal.onData((data) => api.send(IPC_CHANNELS.PTY_DATA, { paneId, data }));

    const cleanupData = api.on(IPC_CHANNELS.PTY_DATA, (msg: unknown) => {
      const m = msg as { paneId: string; data: string };
      if (m.paneId === paneId) terminal.write(m.data);
    });

    const cleanupExit = api.on(IPC_CHANNELS.PTY_EXIT, (msg: unknown) => {
      const m = msg as { paneId: string; exitCode: number };
      if (m.paneId === paneId) terminal.write(`\r\n\x1b[90m[Process exited with code ${m.exitCode}]\x1b[0m\r\n`);
    });

    terminal.onTitleChange((title) => onTitleChange?.(title));

    // 리사이즈 - 디바운스
    const resizeObserver = new ResizeObserver(() => debouncedFit(paneId, 80));
    resizeObserver.observe(termElement);

    terminal.textarea?.addEventListener('focus', () => onFocus());

    const handleSearch = () => { const q = prompt('검색:'); if (q) searchAddon.findNext(q); };
    window.addEventListener('wumx:search', handleSearch);

    const cleanups = [cleanupData, cleanupExit, () => resizeObserver.disconnect(), () => window.removeEventListener('wumx:search', handleSearch)];
    terminalCache.set(paneId, { terminal, fitAddon, searchAddon, element: termElement, cleanups });

    return () => {
      mountedRef.current = false;
      if (termElement.parentElement) termElement.parentElement.removeChild(termElement);
    };
  }, [paneId]);

  // visible 변경 시 - 크기 확보 후 fit
  useEffect(() => {
    if (!visible) return;
    let attempt = 0;
    const retryFit = () => {
      attempt++;
      const cached = terminalCache.get(paneId);
      if (!cached) return;
      const w = cached.element.clientWidth;
      if ((w < 10) && attempt < 20) { setTimeout(retryFit, 50); return; }
      debouncedFit(paneId, 30);
    };
    requestAnimationFrame(retryFit);
  }, [visible, paneId]);

  // 폰트
  useEffect(() => {
    const c = terminalCache.get(paneId);
    if (c) { c.terminal.options.fontSize = fontSize; debouncedFit(paneId, 50); }
  }, [fontSize, paneId]);

  // 포커스
  useEffect(() => {
    if (focused && visible) terminalCache.get(paneId)?.terminal.focus();
  }, [focused, visible, paneId]);

  return <div ref={containerRef} className="terminal-wrapper" />;
};

// 터미널의 현재 화면 내용 추출 (세션 저장용)
export function getTerminalScrollback(paneId: string): string {
  const cached = terminalCache.get(paneId);
  if (!cached) return '';
  const buf = cached.terminal.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i);
    if (line) lines.push(line.translateToString(true));
  }
  // 뒤에서부터 빈 줄 제거
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.join('\r\n');
}

export function destroyTerminal(paneId: string): void {
  const cached = terminalCache.get(paneId);
  if (cached) {
    cached.cleanups.forEach((fn) => fn());
    cached.terminal.dispose();
    terminalCache.delete(paneId);
  }
  const timer = fitTimers.get(paneId);
  if (timer) { clearTimeout(timer); fitTimers.delete(paneId); }
}
