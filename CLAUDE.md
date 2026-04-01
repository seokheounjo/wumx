# wumx - AI 코딩 에이전트를 위한 Windows 터미널 멀티플렉서

## 프로젝트 구조

```
src/
├── main/                  # Electron 메인 프로세스
│   ├── main.ts           # 앱 엔트리, IPC 핸들러, 글로벌 단축키
│   ├── pty-manager.ts    # node-pty 래퍼 (ConPTY 사용)
│   ├── workspace-manager.ts  # 워크스페이스/패널 상태 관리
│   ├── session-manager.ts    # 세션 저장/복원 (~/.wumx/)
│   ├── notification-manager.ts # OSC 시퀀스 파싱, 에이전트 알림
│   ├── context-manager.ts     # 세션 간 컨텍스트 공유 KV 저장소
│   └── ipc-server.ts         # Named Pipe / Unix Socket API 서버
├── renderer/              # Electron 렌더러 (React)
│   ├── App.tsx           # 메인 앱 컴포넌트
│   ├── components/
│   │   ├── TitleBar.tsx      # 커스텀 타이틀바
│   │   ├── Sidebar.tsx       # 세로 탭 워크스페이스 목록
│   │   ├── Terminal.tsx      # xterm.js + WebGL 터미널
│   │   ├── SplitPane.tsx     # 재귀적 분할 패널
│   │   ├── WorkspaceView.tsx # 워크스페이스 메인 뷰
│   │   ├── Browser.tsx       # 내장 브라우저 (webview)
│   │   ├── NotificationPanel.tsx # 알림 패널
│   │   └── StatusBar.tsx     # 하단 상태바
│   └── styles/
│       └── global.css    # Tokyo Night 테마
├── shared/
│   └── types.ts          # 공유 타입/IPC 채널 정의
└── cli/
    └── wumx-cli.ts       # CLI 제어 도구
```

## 빌드 & 실행

```bash
npm install
npm run dev        # 개발 모드
npm run build      # 프로덕션 빌드
npm run dist       # Windows 패키징
```

## 기술 스택
- Electron 28 + TypeScript
- React 18 (렌더러)
- xterm.js 5 + WebGL 가속
- node-pty (Windows ConPTY)
- Named Pipes (IPC)
- simple-git (Git 정보)

## 핵심 설계
- PaneLayout은 재귀적 트리 (single | split)
- 세션 데이터는 ~/.wumx/session.json에 atomic write
- OSC 9/99/777 + 커스텀 시퀀스로 에이전트 알림 감지
- Named Pipe로 CLI에서 실시간 제어
