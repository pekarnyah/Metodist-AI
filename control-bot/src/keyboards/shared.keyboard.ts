import { InlineKeyboard } from 'grammy';

export function backToMainKeyboard() {
  return new InlineKeyboard().text('Назад', 'menu:main');
}
