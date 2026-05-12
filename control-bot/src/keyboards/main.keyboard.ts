import { Keyboard } from 'grammy';

export const MAIN_MENU_LABELS = {
  status: 'Статус',
  control: 'Керування',
  logs: 'Логи',
  users: 'Користувачі',
  notifications: 'Сповіщення',
  system: 'Система',
  refresh: 'Оновити меню',
} as const;

export function mainKeyboard() {
  return new Keyboard()
    .text(MAIN_MENU_LABELS.status)
    .text(MAIN_MENU_LABELS.control)
    .row()
    .text(MAIN_MENU_LABELS.logs)
    .text(MAIN_MENU_LABELS.users)
    .row()
    .text(MAIN_MENU_LABELS.notifications)
    .text(MAIN_MENU_LABELS.system)
    .row()
    .text(MAIN_MENU_LABELS.refresh)
    .resized()
    .persistent();
}
