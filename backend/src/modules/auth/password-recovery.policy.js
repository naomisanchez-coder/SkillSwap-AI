// Propuesta 1.5B: debe ratificarse antes de aplicar 004 o habilitar endpoints.
export const passwordRecoveryPolicy = Object.freeze({
  digits: 6, ttlSeconds: 600, maxAttempts: 5,
  cooldownSeconds: 60, windowSeconds: 3600, emailLimit: 5, ipLimit: 20,
  retentionSeconds: 86400, cleanupBatch: 100,
});
export const passwordRecoverySchemaVersion = '004_password_recovery';
export const passwordRecoveryStates = Object.freeze({
  verifiable: 'PENDING',
  nonVerifiable: Object.freeze(['SENDING', 'CONSUMED', 'REVOKED', 'EXPIRED', 'EXHAUSTED']),
});
