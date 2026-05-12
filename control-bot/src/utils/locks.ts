import type { ActiveTask, ControlAction } from '../types/bot.types';

class ActionLock {
  private activeTask: ActiveTask | null = null;

  tryAcquire(action: ControlAction, label: string, requestedBy: number): ActiveTask | null {
    if (this.activeTask) {
      return null;
    }
    this.activeTask = {
      action,
      label,
      requestedBy,
      startedAt: new Date().toISOString(),
    };
    return this.activeTask;
  }

  release(): void {
    this.activeTask = null;
  }

  getActiveTask(): ActiveTask | null {
    return this.activeTask;
  }
}

export const actionLock = new ActionLock();
