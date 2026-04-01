import React from 'react';

const api = window.wumx;

interface TitleBarProps {
  title: string;
  onSaveSession: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ title, onSaveSession }) => {
  return (
    <div className="titlebar">
      <span className="titlebar-title">wumx</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{title}</span>

      <div className="titlebar-controls">
        <button className="titlebar-btn" onClick={onSaveSession} title="세션 저장 (Ctrl+S)">
          &#128190;
        </button>
        <button className="titlebar-btn" onClick={() => api.send('window:minimize')} title="최소화">
          &#8722;
        </button>
        <button className="titlebar-btn" onClick={() => api.send('window:maximize')} title="최대화">
          &#9633;
        </button>
        <button className="titlebar-btn close" onClick={() => api.send('window:close')} title="닫기">
          &#10005;
        </button>
      </div>
    </div>
  );
};
