import { InlineKeyboard } from 'grammy';

import type { ControlAction } from '../types/bot.types';

export function confirmKeyboard(action: ControlAction) {
  return new InlineKeyboard()
    .text('Підтвердити', `control:confirm:${action}`)
    .text('Скасувати', 'menu:control');
}
