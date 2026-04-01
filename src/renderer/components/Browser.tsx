import React, { useState, useRef, useEffect } from 'react';
import { IPC_CHANNELS } from '../../shared/types';

const api = window.wumx;

interface BrowserPanelProps {
  workspaceId: string;
  initialUrl: string;
  onClose: () => void;
}

export const BrowserPanel: React.FC<BrowserPanelProps> = ({
  workspaceId, initialUrl, onClose,
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [jsConsole, setJsConsole] = useState<string[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const [jsInput, setJsInput] = useState('');
  const webviewRef = useRef<Electron.WebviewTag | null>(null);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleStartLoading = () => setLoading(true);
    const handleStopLoading = () => setLoading(false);
    const handleNavigate = (e: any) => {
      setUrl(e.url);
      setInputUrl(e.url);
      api.invoke(IPC_CHANNELS.BROWSER_NAVIGATE, { workspaceId, url: e.url });
    };
    const handleTitleUpdate = (e: any) => setTitle(e.title);
    const handleConsoleMessage = (e: any) => {
      setJsConsole((prev) => [...prev.slice(-99), `[${e.level}] ${e.message}`]);
    };

    webview.addEventListener('did-start-loading', handleStartLoading);
    webview.addEventListener('did-stop-loading', handleStopLoading);
    webview.addEventListener('did-navigate', handleNavigate);
    webview.addEventListener('did-navigate-in-page', handleNavigate);
    webview.addEventListener('page-title-updated', handleTitleUpdate);
    webview.addEventListener('console-message', handleConsoleMessage);

    return () => {
      webview.removeEventListener('did-start-loading', handleStartLoading);
      webview.removeEventListener('did-stop-loading', handleStopLoading);
      webview.removeEventListener('did-navigate', handleNavigate);
      webview.removeEventListener('did-navigate-in-page', handleNavigate);
      webview.removeEventListener('page-title-updated', handleTitleUpdate);
      webview.removeEventListener('console-message', handleConsoleMessage);
    };
  }, [workspaceId]);

  const navigate = (targetUrl: string) => {
    let finalUrl = targetUrl;
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
        finalUrl = `https://${finalUrl}`;
      } else {
        finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
      }
    }
    setUrl(finalUrl);
    setInputUrl(finalUrl);
    webviewRef.current?.loadURL(finalUrl);
  };

  // JS 실행 API
  const executeJS = async (code: string) => {
    if (!webviewRef.current) return;
    try {
      const result = await webviewRef.current.executeJavaScript(code);
      setJsConsole((prev) => [...prev.slice(-99), `> ${code}`, `< ${JSON.stringify(result)}`]);
    } catch (err: any) {
      setJsConsole((prev) => [...prev.slice(-99), `> ${code}`, `! ${err.message}`]);
    }
  };

  return (
    <div className="browser-panel">
      <div className="browser-toolbar">
        <button onClick={() => webviewRef.current?.goBack()} title="뒤로">&#8592;</button>
        <button onClick={() => webviewRef.current?.goForward()} title="앞으로">&#8594;</button>
        <button onClick={() => webviewRef.current?.reload()} title="새로고침">
          {loading ? '&#10005;' : '&#8635;'}
        </button>

        <input
          className="browser-url-input"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') navigate(inputUrl); }}
          placeholder="URL 또는 검색어 입력..."
        />

        <button onClick={() => setShowConsole((p) => !p)} title="JS 콘솔" style={{ color: showConsole ? 'var(--accent-blue)' : undefined }}>
          &gt;_
        </button>
        <button onClick={() => {
          if (webviewRef.current?.isDevToolsOpened()) webviewRef.current.closeDevTools();
          else webviewRef.current?.openDevTools();
        }} title="개발자 도구">&#9881;</button>
        <button onClick={onClose} title="브라우저 닫기 (Ctrl+Shift+B)">&#10005;</button>
      </div>

      {title && (
        <div style={{ padding: '2px 8px', fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)' }}>
          {title}
        </div>
      )}

      <div className="browser-content" style={{ flex: showConsole ? 0.65 : 1 }}>
        <webview
          ref={webviewRef as any}
          src={url}
          style={{ width: '100%', height: '100%' }}
          // @ts-ignore
          allowpopups="true"
        />
      </div>

      {/* JS 실행 콘솔 */}
      {showConsole && (
        <div style={{
          flex: 0.35, display: 'flex', flexDirection: 'column',
          borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)',
        }}>
          <div style={{
            flex: 1, overflow: 'auto', padding: 8, fontFamily: 'monospace', fontSize: 11,
            color: 'var(--text-primary)',
          }}>
            {jsConsole.map((line, i) => (
              <div key={i} style={{
                color: line.startsWith('!') ? 'var(--accent-red)' : line.startsWith('<') ? 'var(--accent-green)' : 'var(--text-secondary)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {line}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', borderTop: '1px solid var(--border-color)' }}>
            <span style={{ padding: '6px 8px', color: 'var(--accent-blue)', fontFamily: 'monospace' }}>&gt;</span>
            <input
              value={jsInput}
              onChange={(e) => setJsInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && jsInput.trim()) {
                  executeJS(jsInput);
                  setJsInput('');
                }
              }}
              placeholder="JavaScript 실행..."
              style={{
                flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)',
                fontFamily: 'monospace', fontSize: 12, padding: '6px 0', outline: 'none',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
