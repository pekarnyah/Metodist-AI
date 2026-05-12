import { Keyboard } from 'grammy';

export function phoneRequestKeyboard() {
  return new Keyboard().requestContact('Поділитися номером').resized().oneTime();
}
