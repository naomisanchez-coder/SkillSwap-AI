// Política aprobada y compartida por emisión y verificación 1.4B.
export const otpPolicy = Object.freeze({ ttlSeconds: 600, cooldownSeconds: 60,
  windowSeconds: 3600, maxPerWindow: 5, maxAttempts: 5 });
export const otpDigits = 6;
export const otpSchemaVersion = '002_otp_delivery_safety';
