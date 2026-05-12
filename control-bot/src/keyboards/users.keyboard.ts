import { Keyboard } from 'grammy';

export const USERS_LABELS = {
  total: 'Всього',
  today: 'Сьогодні',
  week: '7 днів',
  recent: 'Останні 5',
  back: 'Назад до меню',
} as const;

export function usersKeyboard() {
  return new Keyboard()
    .text(USERS_LABELS.total)
    .text(USERS_LABELS.today)
    .row()
    .text(USERS_LABELS.week)
    .text(USERS_LABELS.recent)
    .row()
    .text(USERS_LABELS.back)
    .resized();
}
