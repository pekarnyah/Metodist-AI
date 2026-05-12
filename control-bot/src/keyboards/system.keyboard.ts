import { Keyboard } from 'grammy';

export const SYSTEM_LABELS = {
  disk: 'Диск',
  memory: "Пам'ять",
  cpu: 'Процесор',
  uptime: 'Аптайм',
  lastDeploy: 'Останній деплой',
  activeTasks: 'Активна задача',
  back: 'Назад до меню',
} as const;

export function systemKeyboard() {
  return new Keyboard()
    .text(SYSTEM_LABELS.disk)
    .text(SYSTEM_LABELS.memory)
    .row()
    .text(SYSTEM_LABELS.cpu)
    .text(SYSTEM_LABELS.uptime)
    .row()
    .text(SYSTEM_LABELS.lastDeploy)
    .text(SYSTEM_LABELS.activeTasks)
    .row()
    .text(SYSTEM_LABELS.back)
    .resized();
}
