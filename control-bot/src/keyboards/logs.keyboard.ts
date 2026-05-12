import { Keyboard } from 'grammy';

export const LOG_LABELS = {
  backend50: 'Бекенд лог 50',
  backend100: 'Бекенд лог 100',
  backendErr50: 'Бекенд помилки 50',
  backendErr100: 'Бекенд помилки 100',
  frontend50: 'Фронтенд лог 50',
  frontend100: 'Фронтенд лог 100',
  frontendErr50: 'Фронтенд помилки 50',
  frontendErr100: 'Фронтенд помилки 100',
  pm250: 'PM2 50',
  pm2100: 'PM2 100',
  back: 'Назад до меню',
} as const;

export function logsKeyboard() {
  return new Keyboard()
    .text(LOG_LABELS.backend50)
    .text(LOG_LABELS.backend100)
    .row()
    .text(LOG_LABELS.backendErr50)
    .text(LOG_LABELS.backendErr100)
    .row()
    .text(LOG_LABELS.frontend50)
    .text(LOG_LABELS.frontend100)
    .row()
    .text(LOG_LABELS.frontendErr50)
    .text(LOG_LABELS.frontendErr100)
    .row()
    .text(LOG_LABELS.pm250)
    .text(LOG_LABELS.pm2100)
    .row()
    .text(LOG_LABELS.back)
    .resized();
}
