import { v4 as uuidv4 } from 'uuid';
import simpleGit from 'simple-git';
import { exec } from 'child_process';
import {
  Workspace, PaneLayout, PaneInfo, PaneSingle, PaneSplit,
  PaneLayoutSession, WorkspaceSession, Notification, WumxConfig
} from '../shared/types';

export class WorkspaceManager {
  private workspaces: Map<string, Workspace> = new Map();
  private activeWorkspaceId: string = '';
  private config: WumxConfig;

  constructor(config: WumxConfig, skipDefault: boolean = false) {
    this.config = config;
    if (!skipDefault) {
      const ws = this.createWorkspace('workspace-1', config.defaultCwd);
      this.activeWorkspaceId = ws.id;
    }
  }

  createWorkspace(name: string, cwd?: string): Workspace {
    const id = uuidv4();
    const paneId = uuidv4();
    const workspace: Workspace = {
      id,
      name,
      cwd: cwd || this.config.defaultCwd,
      gitBranch: null,
      gitRemote: null,
      prNumber: null,
      panes: {
        type: 'single',
        pane: this.createPaneInfo(paneId, cwd || this.config.defaultCwd),
      },
      activePaneId: paneId,
      notifications: [],
      unreadCount: 0,
      createdAt: Date.now(),
      browserUrl: null,
      browserVisible: false,
      listeningPorts: [],
    };
    this.workspaces.set(id, workspace);
    this.refreshGitInfo(id);
    return workspace;
  }

  private paneCounter = 0;

  private createPaneInfo(id: string, cwd: string): PaneInfo {
    this.paneCounter++;
    return {
      id,
      name: `Terminal ${this.paneCounter}`,
      cwd,
      shell: this.config.shell,
      title: '',
      scrollback: '',
      hasNotification: false,
      notificationText: null,
      status: 'active',
      pid: null,
      env: {},
    };
  }

  deleteWorkspace(id: string): boolean {
    if (this.workspaces.size <= 1) return false;
    this.workspaces.delete(id);
    if (this.activeWorkspaceId === id) {
      this.activeWorkspaceId = this.workspaces.keys().next().value!;
    }
    return true;
  }

  renameWorkspace(id: string, name: string): boolean {
    const ws = this.workspaces.get(id);
    if (!ws) return false;
    ws.name = name;
    return true;
  }

  switchWorkspace(id: string): Workspace | null {
    const ws = this.workspaces.get(id);
    if (!ws) return null;
    this.activeWorkspaceId = id;
    return ws;
  }

  getWorkspace(id: string): Workspace | null {
    return this.workspaces.get(id) || null;
  }

  getActiveWorkspace(): Workspace | null {
    return this.workspaces.get(this.activeWorkspaceId) || null;
  }

  getActiveWorkspaceId(): string {
    return this.activeWorkspaceId;
  }

  getAllWorkspaces(): Workspace[] {
    return Array.from(this.workspaces.values());
  }

  // 패널 분할
  splitPane(workspaceId: string, paneId: string, direction: 'horizontal' | 'vertical'): { newPaneId: string } | null {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return null;

    const newPaneId = uuidv4();
    const newPane = this.createPaneInfo(newPaneId, ws.cwd);

    ws.panes = this.splitPaneLayout(ws.panes, paneId, direction, newPane);
    ws.activePaneId = newPaneId;
    return { newPaneId };
  }

  private splitPaneLayout(layout: PaneLayout, targetId: string, direction: 'horizontal' | 'vertical', newPane: PaneInfo): PaneLayout {
    if (layout.type === 'single') {
      if (layout.pane.id === targetId) {
        return {
          type: 'split',
          direction,
          ratio: 0.5,
          first: { type: 'single', pane: layout.pane },
          second: { type: 'single', pane: newPane },
        };
      }
      return layout;
    }

    return {
      ...layout,
      first: this.splitPaneLayout(layout.first, targetId, direction, newPane),
      second: this.splitPaneLayout(layout.second, targetId, direction, newPane),
    };
  }

  // 패널 닫기
  closePane(workspaceId: string, paneId: string): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;

    const result = this.removePaneFromLayout(ws.panes, paneId);
    if (!result) return false;

    ws.panes = result;

    // 활성 패널이 닫혔으면 다른 패널로 전환
    if (ws.activePaneId === paneId) {
      const panes = this.collectPaneIds(ws.panes);
      ws.activePaneId = panes[0] || '';
    }
    return true;
  }

  private removePaneFromLayout(layout: PaneLayout, targetId: string): PaneLayout | null {
    if (layout.type === 'single') {
      if (layout.pane.id === targetId) return null;
      return layout;
    }

    const firstResult = this.removePaneFromLayout(layout.first, targetId);
    const secondResult = this.removePaneFromLayout(layout.second, targetId);

    if (!firstResult) return secondResult || layout.second;
    if (!secondResult) return firstResult || layout.first;

    return { ...layout, first: firstResult, second: secondResult };
  }

  resizePane(workspaceId: string, paneId: string, ratio: number): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;
    this.updateRatioInLayout(ws.panes, paneId, ratio);
    return true;
  }

  private updateRatioInLayout(layout: PaneLayout, paneId: string, ratio: number): boolean {
    if (layout.type !== 'split') return false;
    if (this.hasPaneInLayout(layout.first, paneId) || this.hasPaneInLayout(layout.second, paneId)) {
      (layout as PaneSplit).ratio = ratio;
      return true;
    }
    return this.updateRatioInLayout(layout.first, paneId, ratio) || this.updateRatioInLayout(layout.second, paneId, ratio);
  }

  private hasPaneInLayout(layout: PaneLayout, paneId: string): boolean {
    if (layout.type === 'single') return layout.pane.id === paneId;
    return this.hasPaneInLayout(layout.first, paneId) || this.hasPaneInLayout(layout.second, paneId);
  }

  // 패널 ID 수집
  getPaneIds(workspaceId: string): string[] {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return [];
    return this.collectPaneIds(ws.panes);
  }

  private collectPaneIds(layout: PaneLayout): string[] {
    if (layout.type === 'single') return [layout.pane.id];
    return [...this.collectPaneIds(layout.first), ...this.collectPaneIds(layout.second)];
  }

  // 알림
  addNotification(notification: Notification): void {
    const ws = this.workspaces.get(notification.workspaceId);
    if (!ws) return;
    ws.notifications.push(notification);
    ws.unreadCount++;
    this.setPaneNotification(ws.panes, notification.paneId, notification.text);
  }

  // 워크스페이스의 알림 + unreadCount + pane 알림 상태 전부 리셋
  clearWorkspaceNotifications(workspaceId: string): void {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return;
    ws.notifications = [];
    ws.unreadCount = 0;
    this.clearPaneNotifications(ws.panes);
  }

  private clearPaneNotifications(layout: PaneLayout): void {
    if (layout.type === 'single') {
      layout.pane.hasNotification = false;
      layout.pane.notificationText = null;
      return;
    }
    this.clearPaneNotifications(layout.first);
    this.clearPaneNotifications(layout.second);
  }

  private setPaneNotification(layout: PaneLayout, paneId: string, text: string): void {
    if (layout.type === 'single') {
      if (layout.pane.id === paneId) {
        layout.pane.hasNotification = true;
        layout.pane.notificationText = text;
      }
      return;
    }
    this.setPaneNotification(layout.first, paneId, text);
    this.setPaneNotification(layout.second, paneId, text);
  }

  // CWD 업데이트
  updatePaneCwd(paneId: string, cwd: string): void {
    for (const ws of this.workspaces.values()) {
      this.updateFieldInLayout(ws.panes, paneId, 'cwd', cwd);
    }
  }

  updatePaneScrollback(paneId: string, scrollback: string): void {
    for (const ws of this.workspaces.values()) {
      this.updateFieldInLayout(ws.panes, paneId, 'scrollback', scrollback);
    }
  }

  renamPane(paneId: string, name: string): void {
    for (const ws of this.workspaces.values()) {
      this.updateFieldInLayout(ws.panes, paneId, 'name', name);
    }
  }

  private updateFieldInLayout(layout: PaneLayout, paneId: string, field: string, value: string): void {
    if (layout.type === 'single') {
      if (layout.pane.id === paneId) (layout.pane as any)[field] = value;
      return;
    }
    this.updateFieldInLayout(layout.first, paneId, field, value);
    this.updateFieldInLayout(layout.second, paneId, field, value);
  }

  // 브라우저
  toggleBrowser(workspaceId: string): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;
    ws.browserVisible = !ws.browserVisible;
    return ws.browserVisible;
  }

  setBrowserUrl(workspaceId: string, url: string): void {
    const ws = this.workspaces.get(workspaceId);
    if (ws) ws.browserUrl = url;
  }

  // Git
  async getGitInfo(cwd: string): Promise<{ branch: string | null; remote: string | null } | null> {
    try {
      const git = simpleGit(cwd);
      const isRepo = await git.checkIsRepo();
      if (!isRepo) return null;

      const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
      let remote: string | null = null;
      try {
        const remotes = await git.getRemotes(true);
        remote = remotes[0]?.refs?.fetch || null;
      } catch { /* no remote */ }

      return { branch: branch.trim(), remote };
    } catch {
      return null;
    }
  }

  async refreshGitInfo(workspaceId: string): Promise<void> {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return;
    const info = await this.getGitInfo(ws.cwd);
    if (info) {
      ws.gitBranch = info.branch;
      ws.gitRemote = info.remote;
    }
    // PR 번호 감지
    const prNumber = await this.detectPRNumber(ws.cwd);
    ws.prNumber = prNumber;
  }

  // GitHub/GitLab PR 번호 감지
  private async detectPRNumber(cwd: string): Promise<string | null> {
    try {
      const git = simpleGit(cwd);
      const isRepo = await git.checkIsRepo();
      if (!isRepo) return null;

      const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
      const branchName = branch.trim();

      // 브랜치 이름에서 PR 번호 패턴 감지
      // 패턴: pr/123, pull/123, #123, feature/PROJ-123 등
      const prPatterns = [
        /pr[/-](\d+)/i,
        /pull[/-](\d+)/i,
        /#(\d+)/,
        /(\d+)[-_]/, // 번호로 시작하는 브랜치
      ];

      for (const pattern of prPatterns) {
        const match = branchName.match(pattern);
        if (match) return match[1];
      }

      // gh CLI로 현재 브랜치의 PR 확인 (gh가 설치되어 있을 때)
      return await new Promise<string | null>((resolve) => {
        exec('gh pr view --json number -q .number', { cwd, timeout: 3000 }, (err, stdout) => {
          if (err || !stdout.trim()) { resolve(null); return; }
          resolve(stdout.trim());
        });
      });
    } catch {
      return null;
    }
  }

  // 포트 업데이트
  updatePorts(workspaceId: string, ports: number[]): void {
    const ws = this.workspaces.get(workspaceId);
    if (ws) ws.listeningPorts = ports;
  }

  // paneId로 워크스페이스 찾기
  findWorkspaceByPane(paneId: string): Workspace | null {
    for (const ws of this.workspaces.values()) {
      if (this.hasPaneInLayout(ws.panes, paneId)) return ws;
    }
    return null;
  }

  // 인덱스로 워크스페이스 전환
  switchByIndex(index: number): Workspace | null {
    const workspaces = this.getAllWorkspaces();
    if (index < 0 || index >= workspaces.length) return null;
    return this.switchWorkspace(workspaces[index].id);
  }

  // 세션에서 워크스페이스 복원
  restoreWorkspace(session: WorkspaceSession): Workspace {
    const panes = this.restorePaneLayout(session.paneLayout);
    const workspace: Workspace = {
      id: session.id,
      name: session.name,
      cwd: session.cwd,
      gitBranch: null,
      gitRemote: null,
      prNumber: null,
      panes,
      activePaneId: session.activePaneId,
      notifications: [],
      unreadCount: 0,
      createdAt: Date.now(),
      browserUrl: session.browserUrl,
      browserVisible: session.browserVisible,
      listeningPorts: [],
    };

    this.workspaces.set(session.id, workspace);
    if (!this.activeWorkspaceId) this.activeWorkspaceId = session.id;
    this.refreshGitInfo(session.id);
    return workspace;
  }

  private restorePaneLayout(session: PaneLayoutSession): PaneLayout {
    if (session.type === 'single' && session.pane) {
      return {
        type: 'single',
        pane: {
          id: session.pane.id,
          name: session.pane.name || `Terminal ${++this.paneCounter}`,
          cwd: session.pane.cwd,
          shell: session.pane.shell || this.config.shell,
          title: '',
          scrollback: session.pane.scrollback || '',
          hasNotification: false,
          notificationText: null,
          status: 'active',
          pid: null,
          env: session.pane.env || {},
        },
      };
    }

    if (session.type === 'split' && session.first && session.second) {
      return {
        type: 'split',
        direction: session.direction || 'horizontal',
        ratio: session.ratio || 0.5,
        first: this.restorePaneLayout(session.first),
        second: this.restorePaneLayout(session.second),
      };
    }

    // 폴백: 기본 패널
    const paneId = uuidv4();
    return {
      type: 'single',
      pane: this.createPaneInfo(paneId, this.config.defaultCwd),
    };
  }

  // deleteWorkspace에서 마지막 워크스페이스도 삭제 가능하도록 (세션 복원 시 필요)
  forceDeleteWorkspace(id: string): void {
    this.workspaces.delete(id);
    if (this.activeWorkspaceId === id) {
      const first = this.workspaces.keys().next().value;
      this.activeWorkspaceId = first || '';
    }
  }
}
