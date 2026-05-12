import { Keyboard } from 'grammy';

export const CONTROL_LABELS = {
  restartBackend: 'Перезапустити бекенд',
  restartFrontend: 'Перезапустити фронтенд',
  restartAll: 'Перезапустити все',
  buildFrontend: 'Зібрати фронтенд',
  rebuildFrontend: 'Перезібрати фронтенд',
  deployAll: 'Оновити все',
  back: 'Назад до меню',
} as const;

export function controlKeyboard() {
  return new Keyboard()
    .text(CONTROL_LABELS.restartBackend)
    .text(CONTROL_LABELS.restartFrontend)
    .row()
    .text(CONTROL_LABELS.restartAll)
    .text(CONTROL_LABELS.buildFrontend)
    .row()
    .text(CONTROL_LABELS.rebuildFrontend)
    .text(CONTROL_LABELS.deployAll)
    .row()
    .text(CONTROL_LABELS.back)
    .resized();
}
