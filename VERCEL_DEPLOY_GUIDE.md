# wumx - Vercel 배포 가이드

## 이 문서의 목적
다른 Claude Code 에이전트에게 전달하여 wumx 프로젝트의 **랜딩 페이지 + 다운로드 사이트**를 Vercel에 배포하도록 요청하기 위한 가이드입니다.

---

## 1. 프로젝트 위치

```
E:\cumx\                        ← 프로젝트 루트
├── src/                        ← 소스코드 (26개 파일)
├── dist/                       ← 빌드된 앱 코드
├── release/
│   ├── win-unpacked/           ← Windows 실행 파일 (274MB)
│   │   └── wumx.exe            ← 메인 실행 파일
│   └── wumx-win-x64.zip       ← 배포용 ZIP (110MB)
├── package.json
├── CLAUDE.md
├── TEST_CHECKLIST.md
└── tests/qa-phase2.js
```

---

## 2. wumx가 뭔가?

**wumx**는 AI 코딩 에이전트(Claude Code, Codex, Gemini CLI 등)를 동시에 여러 개 관리하기 위한 **Windows 전용 터미널 멀티플렉서**입니다.

macOS의 [cmux](https://cmux.com)에서 영감을 받아 Windows용으로 새로 만들었습니다.

### 핵심 기능
| 기능 | 설명 |
|------|------|
| **워크스페이스 관리** | 세로 탭 사이드바에서 여러 프로젝트를 한눈에 관리. Git 브랜치, CWD, PR 번호, 리스닝 포트 자동 표시 |
| **에이전트 알림** | OSC 9/99/777 시퀀스 감지. 에이전트가 입력을 기다리면 알림 링으로 표시 |
| **내장 브라우저** | 터미널 옆에 WebView 브라우저 패널. JS 실행 콘솔 내장 |
| **패널 분할** | 가로/세로 분할, 드래그 리사이즈, 각 패널 독립 이름 지정 |
| **세션 복원** | 껐다 켜도 워크스페이스, 패널 레이아웃, 터미널 화면 내용 그대로 복원 |
| **컨텍스트 공유** | 워크스페이스/패널 간 키-값 데이터 공유 (TTL 지원) |
| **CLI 제어** | Named Pipe API로 외부에서 실시간 제어 (`wumx notify`, `wumx list-workspaces` 등) |
| **GPU 가속** | xterm.js WebGL 렌더러 |
| **설정 패널** | 셸 경로, 폰트, 크기, 테마, 자동저장 등 GUI로 설정 |

### 기술 스택
- **Electron 28** + TypeScript
- **React 18** (렌더러)
- **xterm.js 5** + WebGL 가속
- **node-pty** (Windows ConPTY)
- **Named Pipes** (IPC)
- **simple-git** (Git 정보)

### 시스템 요구사항
- Windows 10/11 (x64)
- 추가 설치 필요 없음 (Node.js 불필요)

---

## 3. Vercel에 올릴 것

wumx는 **Electron 데스크톱 앱**이므로 Vercel에 앱 자체를 배포하는 게 아니라, **랜딩 페이지 + 다운로드 링크**를 만들어야 합니다.

### 3-1. 랜딩 페이지 구성

**참고 디자인**: https://cmux.com/ko (cmux 공식 사이트)

페이지 구조:
```
1. 히어로 섹션
   - "wumx — AI 코딩 에이전트를 위한 Windows 터미널"
   - 부제: "워크스페이스 관리, 에이전트 알림, 내장 브라우저, 세션 복원까지"
   - [다운로드 (Windows x64)] 버튼 → ZIP 다운로드
   - 스크린샷 또는 데모 GIF

2. 기능 소개 (카드 그리드)
   - 워크스페이스 관리
   - 에이전트 알림 시스템
   - 내장 브라우저
   - 패널 분할
   - 세션 복원
   - CLI 제어
   - 컨텍스트 공유
   - GPU 가속

3. cmux vs wumx 비교표
   | 항목 | cmux (macOS) | wumx (Windows) |
   |------|-------------|----------------|
   | 플랫폼 | macOS 14+ | Windows 10/11 |
   | 렌더링 | libghostty (GPU) | xterm.js WebGL |
   | 네이티브 | Swift + AppKit | Electron + React |
   | 가격 | 무료 | 무료 |
   | 세션 복원 | 레이아웃만 | 레이아웃 + 화면 내용 |
   | CLI | Unix Socket | Named Pipe |
   | 브라우저 | WebKit | Chromium WebView |

4. 설치 방법
   - ZIP 다운로드 → 압축 해제 → wumx.exe 실행
   - 별도 설치 불필요

5. 키보드 단축키 표
   | 단축키 | 기능 |
   |--------|------|
   | Ctrl+N | 새 워크스페이스 |
   | Ctrl+1~9 | 워크스페이스 전환 |
   | Ctrl+S | 세션 저장 |
   | Ctrl+W | 패널 닫기 |
   | Ctrl+Shift+H | 가로 분할 |
   | Ctrl+Shift+V | 세로 분할 |
   | Ctrl+Shift+B | 브라우저 토글 |
   | Ctrl+Shift+I | 알림 패널 |
   | Ctrl+, | 설정 |

6. CLI 사용법
   ```
   wumx list-workspaces
   wumx new-workspace --name "project" --cwd "C:\dev\myapp"
   wumx notify --text "Build done!" --type info
   wumx context-set --key API_URL --value "http://localhost:3000"
   ```

7. 푸터
   - GitHub 링크 (있다면)
   - 라이선스: MIT
```

### 3-2. 다운로드 파일 호스팅

`wumx-win-x64.zip` (110MB)는 Vercel에 직접 올리기엔 너무 큽니다.

**권장 방법:**
1. GitHub Releases에 ZIP 업로드 → 다운로드 링크를 랜딩 페이지에 연결
2. 또는 Cloudflare R2 / AWS S3에 업로드 후 링크 연결
3. Vercel에는 랜딩 페이지(HTML/CSS/JS)만 배포

### 3-3. 기술 스택 (랜딩 페이지)

**권장**: Next.js + Tailwind CSS (Vercel에 최적)
- `/` — 랜딩 페이지
- `/download` — 다운로드 리다이렉트 (GitHub Releases로)

---

## 4. 사용 방법 (최종 사용자 기준)

### 설치
1. 사이트에서 `wumx-win-x64.zip` 다운로드
2. 원하는 폴더에 압축 해제 (예: `C:\wumx\`)
3. `wumx.exe` 더블클릭

### 기본 사용
1. 앱이 열리면 왼쪽 사이드바에 "workspace-1"이 보임
2. 터미널에서 바로 명령어 입력 가능 (PowerShell 기본)
3. `+` 버튼으로 새 워크스페이스 추가
4. 사이드바에서 워크스페이스 클릭으로 전환
5. 패널 헤더의 ▽/◧ 버튼으로 분할
6. Ctrl+Shift+B로 내장 브라우저 열기
7. Ctrl+, 으로 설정 (폰트, 테마, 자동저장 등)

### 세션 복원
- 앱 종료 시 자동 저장 (30초 주기 + 종료 시)
- 다시 실행하면 이전 상태 그대로 복원
- 수동 저장: Ctrl+S

### CLI 제어 (고급)
다른 터미널에서 wumx를 제어하려면 Node.js가 필요:
```bash
node dist/cli/wumx.js list-workspaces
node dist/cli/wumx.js notify --text "Done!" --type info
```

---

## 5. 색상/테마 정보 (디자인 참고)

Tokyo Night 테마 기반:
```
배경: #1a1b26
사이드바: #16161e
텍스트: #c0caf5
보조 텍스트: #565f89
액센트 블루: #7aa2f7
액센트 시안: #7dcfff
액센트 그린: #9ece6a
액센트 옐로우: #e0af68
액센트 레드: #f7768e
액센트 마젠타: #bb9af7
액센트 오렌지: #ff9e64
```

---

## 6. 자동 테스트 결과 (품질 보증)

```
Phase 1 (기본): 18/18 PASS
Phase 2 (엣지): 25/27 PASS (2건 타이밍 이슈, 실제 버그 0)
FPS: 62fps
IPC 스트레스: 20회/10ms
```
