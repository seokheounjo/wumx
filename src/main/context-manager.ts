import { v4 as uuidv4 } from 'uuid';
import { SharedContext } from '../shared/types';

/**
 * 세션 간 컨텍스트 공유 매니저
 * 워크스페이스/패널 간에 데이터를 공유할 수 있는 키-값 저장소
 */
export class ContextManager {
  private contexts: Map<string, SharedContext> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    // 30초마다 만료된 컨텍스트 정리
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
  }

  set(key: string, value: string, workspaceId: string, paneId: string, ttl?: number | null): SharedContext {
    const ctx: SharedContext = {
      id: uuidv4(),
      sourceWorkspaceId: workspaceId,
      sourcePaneId: paneId,
      key,
      value,
      timestamp: Date.now(),
      ttl: ttl ?? null,
    };
    this.contexts.set(key, ctx);
    return ctx;
  }

  get(key: string): SharedContext | null {
    const ctx = this.contexts.get(key);
    if (!ctx) return null;

    // TTL 체크
    if (ctx.ttl !== null && Date.now() - ctx.timestamp > ctx.ttl) {
      this.contexts.delete(key);
      return null;
    }

    return ctx;
  }

  delete(key: string): boolean {
    return this.contexts.delete(key);
  }

  list(): SharedContext[] {
    this.cleanup();
    return Array.from(this.contexts.values());
  }

  listByWorkspace(workspaceId: string): SharedContext[] {
    return this.list().filter((ctx) => ctx.sourceWorkspaceId === workspaceId);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, ctx] of this.contexts) {
      if (ctx.ttl !== null && now - ctx.timestamp > ctx.ttl) {
        this.contexts.delete(key);
      }
    }
  }

  dispose(): void {
    clearInterval(this.cleanupInterval);
    this.contexts.clear();
  }
}
