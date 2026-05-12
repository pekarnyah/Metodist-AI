import { Keyboard } from 'grammy';

import type { NotificationSettings } from '../types/bot.types';

export const NOTIFICATION_LABELS = {
  registrations: 'Реєстрації',
  backend: 'Бекенд',
  frontend: 'Фронтенд',
  build: 'Збірка',
  site: 'Сайт',
  back: 'Назад до меню',
} as const;

export function buildNotificationLabel(title: string, enabled: boolean) {
  return `${title}: ${enabled ? 'увімкнено' : 'вимкнено'}`;
}

export function notificationsKeyboard(settings: NotificationSettings) {
  return new Keyboard()
    .text(buildNotificationLabel(NOTIFICATION_LABELS.registrations, settings.registrations))
    .row()
    .text(buildNotificationLabel(NOTIFICATION_LABELS.backend, settings.backend))
    .text(buildNotificationLabel(NOTIFICATION_LABELS.frontend, settings.frontend))
    .row()
    .text(buildNotificationLabel(NOTIFICATION_LABELS.build, settings.build))
    .text(buildNotificationLabel(NOTIFICATION_LABELS.site, settings.site))
    .row()
    .text(NOTIFICATION_LABELS.back)
    .resized();
}
