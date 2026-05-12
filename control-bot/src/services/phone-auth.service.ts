import { env } from '../config/env';
import { readState, setPhoneVerification } from './state.service';

function normalizePhone(value: string): string {
  return value.replace(/[^\d]/g, '');
}

export function isPhoneProtectionEnabled(): boolean {
  return normalizePhone(env.ownerPhone).length > 0;
}

export async function isPhoneVerified(telegramId: number): Promise<boolean> {
  if (!isPhoneProtectionEnabled()) {
    return true;
  }
  const state = await readState();
  const storedPhone = normalizePhone(state.phoneVerification.verifiedPhone ?? '');
  return (
    state.phoneVerification.verifiedTelegramId === telegramId
    && storedPhone.length > 0
    && storedPhone === normalizePhone(env.ownerPhone)
  );
}

export async function verifyPhoneContact(
  telegramId: number,
  contactUserId: number | undefined,
  phoneNumber: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!isPhoneProtectionEnabled()) {
    return { ok: true };
  }
  if (!contactUserId || contactUserId !== telegramId) {
    return { ok: false, reason: 'Потрібно надіслати власний контакт Telegram.' };
  }
  const normalizedOwnerPhone = normalizePhone(env.ownerPhone);
  const normalizedSharedPhone = normalizePhone(phoneNumber);
  if (!normalizedSharedPhone || normalizedSharedPhone !== normalizedOwnerPhone) {
    return { ok: false, reason: 'Номер телефону не збігається з дозволеним.' };
  }

  await setPhoneVerification({
    verifiedTelegramId: telegramId,
    verifiedPhone: phoneNumber,
    verifiedAt: new Date().toISOString(),
  });
  return { ok: true };
}
