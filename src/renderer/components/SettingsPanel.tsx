import React, { useState } from 'react';
import { WumxConfig } from '../../shared/types';

interface SettingsPanelProps {
  config: WumxConfig | null;
  onClose: () => void;
  onChange: (updates: Partial<WumxConfig>) => void;
}

const THEMES = [
  { id: 'dark', name: 'Tokyo Night (Dark)', bg: '#1a1b26', fg: '#c0caf5' },
  { id: 'light', name: 'Tokyo Night (Light)', bg: '#d5d6db', fg: '#343b58' },
];

const FONTS = [
  "'Cascadia Code', monospace",
  "'Consolas', monospace",
  "'Courier New', monospace",
  "'Fira Code', monospace",
  "'JetBrains Mono', monospace",
  "'Source Code Pro', monospace",
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ config, onClose, onChange }) => {
  const [localConfig, setLocalConfig] = useState<Partial<WumxConfig>>(config || {});

  const update = (key: keyof WumxConfig, value: unknown) => {
    const updates = { [key]: value };
    setLocalConfig((prev) => ({ ...prev, ...updates }));
    onChange(updates);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', zIndex: 200,
    }} onClick={onClose}>
      <div style={{
        width: 520, maxHeight: '80vh', overflow: 'auto',
        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Settings</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 18,
          }}>&#10005;</button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 셸 */}
          <SettingRow label="Shell" description="기본 셸 경로">
            <input
              value={localConfig.shell || ''}
              onChange={(e) => update('shell', e.target.value)}
              style={inputStyle}
            />
          </SettingRow>

          {/* 폰트 */}
          <SettingRow label="Font Family" description="터미널 글꼴">
            <select
              value={localConfig.fontFamily || FONTS[0]}
              onChange={(e) => update('fontFamily', e.target.value)}
              style={inputStyle}
            >
              {FONTS.map((f) => (
                <option key={f} value={f}>{f.split("'")[1]}</option>
              ))}
            </select>
          </SettingRow>

          {/* 폰트 크기 */}
          <SettingRow label="Font Size" description="터미널 글꼴 크기 (8-32)">
            <input
              type="number"
              min={8}
              max={32}
              value={localConfig.fontSize || 14}
              onChange={(e) => update('fontSize', parseInt(e.target.value) || 14)}
              style={{ ...inputStyle, width: 80 }}
            />
          </SettingRow>

          {/* 스크롤백 */}
          <SettingRow label="Scrollback Lines" description="터미널 스크롤백 라인 수">
            <input
              type="number"
              min={1000}
              max={100000}
              step={1000}
              value={localConfig.scrollbackLines || 10000}
              onChange={(e) => update('scrollbackLines', parseInt(e.target.value) || 10000)}
              style={{ ...inputStyle, width: 120 }}
            />
          </SettingRow>

          {/* 테마 */}
          <SettingRow label="Theme" description="색상 테마">
            <div style={{ display: 'flex', gap: 8 }}>
              {THEMES.map((theme) => (
                <div
                  key={theme.id}
                  onClick={() => update('theme', theme.id)}
                  style={{
                    padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                    background: theme.bg, color: theme.fg, fontSize: 12,
                    border: localConfig.theme === theme.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
                  }}
                >
                  {theme.name}
                </div>
              ))}
            </div>
          </SettingRow>

          {/* 세션 자동 저장 */}
          <SettingRow label="Auto Save" description="세션 자동 저장">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={localConfig.sessionAutoSave !== false}
                onChange={(e) => update('sessionAutoSave', e.target.checked)}
              />
              <span style={{ fontSize: 12 }}>활성화</span>
            </label>
          </SettingRow>

          {/* 자동 저장 간격 */}
          <SettingRow label="Auto Save Interval" description="자동 저장 주기 (초)">
            <input
              type="number"
              min={5}
              max={300}
              value={Math.floor((localConfig.sessionAutoSaveInterval || 30000) / 1000)}
              onChange={(e) => update('sessionAutoSaveInterval', (parseInt(e.target.value) || 30) * 1000)}
              style={{ ...inputStyle, width: 80 }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>초</span>
          </SettingRow>

          {/* 시작 시 세션 복원 */}
          <SettingRow label="Restore on Start" description="시작 시 이전 세션 복원">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={localConfig.sessionRestoreOnStart !== false}
                onChange={(e) => update('sessionRestoreOnStart', e.target.checked)}
              />
              <span style={{ fontSize: 12 }}>활성화</span>
            </label>
          </SettingRow>

          {/* 알림 소리 */}
          <SettingRow label="Notification Sound" description="알림 소리">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={localConfig.notificationSound !== false}
                onChange={(e) => update('notificationSound', e.target.checked)}
              />
              <span style={{ fontSize: 12 }}>활성화</span>
            </label>
          </SettingRow>
        </div>

        {/* 단축키 레퍼런스 */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
            Keyboard Shortcuts
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 11 }}>
            {[
              ['Ctrl+N', '새 워크스페이스'],
              ['Ctrl+1-9', '워크스페이스 전환'],
              ['Ctrl+S', '세션 저장'],
              ['Ctrl+W', '패널 닫기'],
              ['Ctrl+Shift+H', '가로 분할'],
              ['Ctrl+Shift+V', '세로 분할'],
              ['Ctrl+Shift+B', '브라우저 토글'],
              ['Ctrl+Shift+I', '알림 패널'],
              ['Ctrl+Shift+U', '읽지않은 알림'],
              ['Ctrl+Shift+F', '터미널 검색'],
              ['Ctrl+=/Ctrl+-', '글꼴 확대/축소'],
              ['Ctrl+,', '설정'],
            ].map(([key, desc]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="kbd">{key}</span>
                <span style={{ color: 'var(--text-muted)' }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const SettingRow: React.FC<{
  label: string;
  description: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div>
    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{description}</div>
    <div style={{ display: 'flex', alignItems: 'center' }}>{children}</div>
  </div>
);

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-color)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  padding: '6px 10px',
  fontSize: 12,
  outline: 'none',
  width: '100%',
};
