function addSeconds(date, seconds) { return new Date(date.getTime() + seconds * 1000); }

export function createSessionRepository(database, policy) {
  if (!database || !policy?.regular || !policy?.remembered) throw new Error('Session policy required');
  return Object.freeze({
    async findAccount(email) {
      const [rows] = await database.execute(`SELECT u.id,u.first_name,u.last_name,u.email,u.password_hash,u.role,u.status,
          u.email_verified_at,p.career_id,p.cycle,p.onboarding_complete,c.name AS career
        FROM users u LEFT JOIN student_profiles p ON p.user_id=u.id
        LEFT JOIN careers c ON c.id=p.career_id WHERE u.email=? LIMIT 2`, [email]);
      return rows.length === 1 ? rows[0] : null;
    },
    async create({ idHash, csrfHmac, userId, remember }) {
      return database.transaction(async tx => {
        const [[clock]] = await tx.execute('SELECT UTC_TIMESTAMP(6) AS now');
        const selected = remember ? policy.remembered : policy.regular;
        const idleExpiresAt = addSeconds(clock.now, selected.idleSeconds);
        const absoluteExpiresAt = addSeconds(clock.now, selected.absoluteSeconds);
        await tx.execute(`INSERT INTO auth_sessions
          (id_hash,user_id,csrf_token_hmac,created_at,last_seen_at,idle_expires_at,absolute_expires_at,remember)
          VALUES (?,?,?,?,?,?,?,?)`, [idHash, userId, csrfHmac, clock.now, clock.now,
          idleExpiresAt, absoluteExpiresAt, remember]);
        return { idleExpiresAt, absoluteExpiresAt };
      });
    },
    async resolve(idHash, { touch = true } = {}) {
      return database.transaction(async tx => {
        const [[clock]] = await tx.execute('SELECT UTC_TIMESTAMP(6) AS now');
        const [sessions] = await tx.execute(`SELECT user_id,csrf_token_hmac,idle_expires_at,
          absolute_expires_at,revoked_at,remember FROM auth_sessions WHERE id_hash=? FOR UPDATE`, [idHash]);
        if (sessions.length !== 1) return null;
        const session = sessions[0];
        if (session.revoked_at || session.idle_expires_at <= clock.now || session.absolute_expires_at <= clock.now) {
          if (!session.revoked_at) await tx.execute('UPDATE auth_sessions SET revoked_at=? WHERE id_hash=?', [clock.now, idHash]);
          return null;
        }
        const [users] = await tx.execute(`SELECT u.id,u.first_name,u.last_name,u.email,u.role,u.status,u.email_verified_at,
            p.cycle,p.onboarding_complete,c.name AS career
          FROM users u LEFT JOIN student_profiles p ON p.user_id=u.id
          LEFT JOIN careers c ON c.id=p.career_id WHERE u.id=? LIMIT 2`, [session.user_id]);
        if (users.length !== 1) return null;
        if (touch) {
          const selected = session.remember ? policy.remembered : policy.regular;
          const candidate = addSeconds(clock.now, selected.idleSeconds);
          const idle = candidate < session.absolute_expires_at ? candidate : session.absolute_expires_at;
          await tx.execute('UPDATE auth_sessions SET last_seen_at=?,idle_expires_at=? WHERE id_hash=?',
            [clock.now, idle, idHash]);
          session.idle_expires_at = idle;
        }
        return { user: users[0], csrfHmac: session.csrf_token_hmac, remember: Boolean(session.remember),
          idleExpiresAt: session.idle_expires_at, absoluteExpiresAt: session.absolute_expires_at };
      });
    },
    async revoke(idHash) {
      return database.transaction(async tx => {
        const [[clock]] = await tx.execute('SELECT UTC_TIMESTAMP(6) AS now');
        const [result] = await tx.execute(
          'UPDATE auth_sessions SET revoked_at=? WHERE id_hash=? AND revoked_at IS NULL', [clock.now, idHash]);
        return result.affectedRows === 1;
      });
    },
  });
}
