import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../.env', import.meta.url), quiet: true });

export function validateEnv(source) {
  const required = (key) => {
    if (typeof source[key] !== 'string' || !source[key].trim()) {
      throw new Error(`Invalid configuration: ${key}`);
    }
    return source[key];
  };
  const port = (key) => {
    const value = required(key);
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
      throw new Error(`Invalid configuration: ${key}`);
    }
    return Number(value);
  };
  const nodeEnv = source.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('Invalid configuration: NODE_ENV');
  }
  const dbUser = required('DB_USER');
  if (dbUser !== 'skillswap_app') throw new Error('Invalid configuration: DB_USER');
  const origins = required('CORS_ORIGIN').split(',').map((origin) => origin.trim());
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error();
    } catch {
      throw new Error('Invalid configuration: CORS_ORIGIN');
    }
  }
  // An absent local secret leaves liveness usable; database checks fail closed.
  const password = source.DB_PASSWORD ?? '';
  if (typeof password !== 'string') throw new Error('Invalid configuration: DB_PASSWORD');
  return {
    nodeEnv, host: required('HOST'), port: port('PORT'), origins,
    db: { host: required('DB_HOST'), port: port('DB_PORT'), user: dbUser,
      password, database: required('DB_NAME') },
  };
}

export function loadEnv() {
  return validateEnv(process.env);
}
