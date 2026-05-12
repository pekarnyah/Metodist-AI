import type { Context, NextFunction } from 'grammy';

import { phoneRequestKeyboard } from '../keyboards/phone.keyboard';
import { env } from '../config/env';
import { isPhoneProtectionEnabled, isPhoneVerified } from '../services/phone-auth.service';

export async function authMiddleware(ctx: Context, next: NextFunction) {
  const telegramId = ctx.from?.id;
  if (!telegramId || telegramId !== env.ownerTelegramId) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: 'Доступ заборонено', show_alert: true });
      return;
    }

    if (ctx.chat?.id) {
      await ctx.reply('Доступ заборонено.');
    }
    return;
  }

  if (!isPhoneProtectionEnabled()) {
    await next();
    return;
  }

  if (await isPhoneVerified(telegramId)) {
    await next();
    return;
  }

  if (ctx.message?.contact) {
    await next();
    return;
  }

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: 'Спочатку підтвердьте номер телефону', show_alert: true });
    return;
  }

  await ctx.reply(
    'Для доступу до пульта потрібно підтвердити номер телефону. Натисніть кнопку нижче і поділіться своїм контактом.',
    { reply_markup: phoneRequestKeyboard() },
  );
}
