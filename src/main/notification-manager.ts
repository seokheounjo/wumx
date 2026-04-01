import { v4 as uuidv4 } from 'uuid';
import { Notification } from '../shared/types';

export class NotificationManager {
  private notifications: Map<string, Notification[]> = new Map();

  // OSC 시퀀스에서만 알림 파싱 (일반 출력은 무시)
  parseOSCSequences(data: string, paneId: string, workspaceId: string): Notification[] {
    const notifications: Notification[] = [];

    // OSC 9 (iTerm2 notification)
    const osc9Regex = /\x1b\]9;([^\x07]*)\x07/g;
    let match;
    while ((match = osc9Regex.exec(data)) !== null) {
      notifications.push(this.createNotification(workspaceId, paneId, match[1], 'agent'));
    }

    // OSC 99 (kitty notification)
    const osc99Regex = /\x1b\]99;(?:i=[^;]*;)?([^\x07]*)\x07/g;
    while ((match = osc99Regex.exec(data)) !== null) {
      notifications.push(this.createNotification(workspaceId, paneId, match[1], 'agent'));
    }

    // OSC 777 (rxvt notification)
    const osc777Regex = /\x1b\]777;notify;([^;]*);([^\x07]*)\x07/g;
    while ((match = osc777Regex.exec(data)) !== null) {
      notifications.push(this.createNotification(workspaceId, paneId, `${match[1]}: ${match[2]}`, 'agent'));
    }

    // wumx 커스텀 알림
    const wumxRegex = /\x1b\]wumx;notify;([^\x07]*)\x07/g;
    while ((match = wumxRegex.exec(data)) !== null) {
      notifications.push(this.createNotification(workspaceId, paneId, match[1], 'agent'));
    }

    // 패턴 매칭 기반 자동 감지는 제거 (거짓 양성이 너무 많음)
    // CLI의 wumx notify 명령으로만 수동 알림 가능

    return notifications;
  }

  private createNotification(
    workspaceId: string, paneId: string, text: string, type: Notification['type']
  ): Notification {
    const notification: Notification = {
      id: uuidv4(), workspaceId, paneId, text, type,
      timestamp: Date.now(), read: false,
    };

    if (!this.notifications.has(workspaceId)) {
      this.notifications.set(workspaceId, []);
    }
    const list = this.notifications.get(workspaceId)!;
    list.push(notification);
    if (list.length > 100) this.notifications.set(workspaceId, list.slice(-100));

    return notification;
  }

  getNotifications(workspaceId?: string): Notification[] {
    if (workspaceId) return this.notifications.get(workspaceId) || [];
    const all: Notification[] = [];
    for (const list of this.notifications.values()) all.push(...list);
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }

  markAsRead(id: string): boolean {
    for (const list of this.notifications.values()) {
      const n = list.find((n) => n.id === id);
      if (n) { n.read = true; return true; }
    }
    return false;
  }

  markAllAsRead(workspaceId: string): void {
    (this.notifications.get(workspaceId) || []).forEach((n) => (n.read = true));
  }

  clearNotifications(workspaceId: string): void {
    this.notifications.delete(workspaceId);
  }

  getUnreadCount(workspaceId?: string): number {
    if (workspaceId) return (this.notifications.get(workspaceId) || []).filter((n) => !n.read).length;
    let c = 0;
    for (const list of this.notifications.values()) c += list.filter((n) => !n.read).length;
    return c;
  }

  getLatestUnread(): Notification | null {
    let latest: Notification | null = null;
    for (const list of this.notifications.values()) {
      for (const n of list) {
        if (!n.read && (!latest || n.timestamp > latest.timestamp)) latest = n;
      }
    }
    return latest;
  }
}
