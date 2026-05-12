import { Keyboard } from 'grammy';

export const STATUS_LABELS = {
  refresh: 'Оновити статус',
  site: 'Сайт',
  backend: 'Бекенд',
  frontend: 'Фронтенд',
  pm2: 'PM2',
  back: 'Назад до меню',
} as const;

export function statusKeyboard() {
  return new Keyboard()
    .text(STATUS_LABELS.refresh)
    .row()
    .text(STATUS_LABELS.site)
    .text(STATUS_LABELS.backend)
    .row()
    .text(STATUS_LABELS.frontend)
    .text(STATUS_LABELS.pm2)
    .row()
    .text(STATUS_LABELS.back)
    .resized();
}
