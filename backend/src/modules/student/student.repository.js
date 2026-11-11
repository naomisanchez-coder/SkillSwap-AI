import { PublicError } from '../../errors/PublicError.js';
import { onboardingComplete } from './student.validation.js';

const selectProfile = `SELECT u.id,u.first_name,u.last_name,u.email,u.role,u.status,u.email_verified_at,
  p.career_id,p.cycle,p.onboarding_complete,c.name career,c.code career_code,
  d.bio,d.learning_level,d.learning_goals,d.preferred_schedule
  FROM users u JOIN student_profiles p ON p.user_id=u.id
  JOIN careers c ON c.id=p.career_id
  LEFT JOIN student_profile_details d ON d.user_id=u.id WHERE u.id=?`;

function publicProfile(row, interests) {
  return {
    id: row.id, firstName: row.first_name, lastName: row.last_name, email: row.email,
    institution: 'TECSUP', role: 'student', emailVerified: Boolean(row.email_verified_at),
    career: row.career, careerCode: row.career_code, cycle: Number(row.cycle),
    bio: row.bio ?? null, interests, level: row.learning_level ?? null,
    goals: row.learning_goals ?? null, schedule: row.preferred_schedule ?? null,
    onboardingComplete: Boolean(row.onboarding_complete),
  };
}

async function readProfile(executor, userId, lock = false) {
  const [rows] = await executor.execute(`${selectProfile}${lock ? ' FOR UPDATE' : ''}`, [userId]);
  if (rows.length !== 1 || rows[0].role !== 'STUDENT' || rows[0].status !== 'ACTIVE' || !rows[0].email_verified_at) {
    throw new PublicError('FORBIDDEN');
  }
  const [interests] = await executor.execute(
    `SELECT interest FROM student_interests WHERE user_id=? ORDER BY position${lock ? ' FOR UPDATE' : ''}`, [userId]);
  return publicProfile(rows[0], interests.map(row => row.interest));
}

async function replaceInterests(tx, userId, interests) {
  await tx.execute('DELETE FROM student_interests WHERE user_id=?', [userId]);
  for (let index = 0; index < interests.length; index++) {
    await tx.execute('INSERT INTO student_interests (user_id,position,interest) VALUES (?,?,?)',
      [userId, index + 1, interests[index]]);
  }
}

function safeInteger(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Credit total exceeds the safe response boundary');
  return number;
}

function encodeCursor(row) {
  return Buffer.from(JSON.stringify([row.cursor_time, row.id])).toString('base64url');
}

async function readCredits(tx, userId, { limit, cursor }) {
  const [[summary]] = await tx.execute(`SELECT COALESCE(SUM(amount),0) balance,COUNT(*) transaction_count
    FROM credit_transactions WHERE user_id=?`, [userId]);
  const values = [userId];
  let boundary = '';
  if (cursor) {
    boundary = ' AND (created_at < ? OR (created_at = ? AND id < ?))';
    values.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }
  values.push(limit + 1);
  const [rows] = await tx.execute(`SELECT id,amount,reason,operation_reference,
      DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s.%f') cursor_time
    FROM credit_transactions WHERE user_id=?${boundary}
    ORDER BY created_at DESC,id DESC LIMIT ?`, values);
  const hasMore = rows.length > limit;
  const selected = rows.slice(0, limit);
  return {
    balance: safeInteger(summary.balance), totalTransactions: safeInteger(summary.transaction_count),
    transactions: selected.map(row => ({ id: row.id, amount: Number(row.amount), reason: row.reason,
      reference: row.operation_reference, occurredAt: `${row.cursor_time.replace(' ', 'T')}Z` })),
    pagination: { limit, nextCursor: hasMore ? encodeCursor(selected.at(-1)) : null },
  };
}

export function createStudentRepository(database) {
  return Object.freeze({
    findOwn(userId) { return readProfile(database, userId); },
    async updateOwn(userId, patch) {
      return database.transaction(async tx => {
        const current = await readProfile(tx, userId, true);
        const next = { ...current, ...patch };
        let careerId = current.careerCode;
        if (Object.hasOwn(patch, 'career')) {
          const [careers] = await tx.execute(
            'SELECT id,name,code,is_active FROM careers WHERE name=? ORDER BY id LIMIT 2 FOR SHARE', [patch.career]);
          if (careers.length !== 1 || careers[0].is_active !== 1) {
            throw new PublicError('VALIDATION_ERROR', { career: 'Selecciona una carrera autorizada y activa.' });
          }
          const [cycles] = await tx.execute(
            'SELECT cycle FROM career_cycles WHERE career_id=? AND cycle=? FOR SHARE', [careers[0].id, patch.cycle]);
          if (cycles.length !== 1) throw new PublicError('VALIDATION_ERROR',
            { cycle: 'Selecciona un ciclo autorizado para la carrera.' });
          careerId = careers[0].id;
        } else {
          const [careers] = await tx.execute('SELECT id FROM careers WHERE code=? LIMIT 2 FOR SHARE', [current.careerCode]);
          if (careers.length !== 1) throw new Error('Profile catalog unavailable');
          careerId = careers[0].id;
        }
        const complete = onboardingComplete(next);
        await tx.execute('UPDATE users SET first_name=?,last_name=? WHERE id=? AND role=?',
          [next.firstName, next.lastName, userId, 'STUDENT']);
        await tx.execute('UPDATE student_profiles SET career_id=?,cycle=?,onboarding_complete=? WHERE user_id=?',
          [careerId, next.cycle, complete, userId]);
        await tx.execute(`INSERT INTO student_profile_details
          (user_id,bio,learning_level,learning_goals,preferred_schedule) VALUES (?,?,?,?,?)
          ON DUPLICATE KEY UPDATE bio=VALUES(bio),learning_level=VALUES(learning_level),
          learning_goals=VALUES(learning_goals),preferred_schedule=VALUES(preferred_schedule)`,
        [userId, next.bio, next.level, next.goals, next.schedule]);
        await replaceInterests(tx, userId, next.interests);
        return readProfile(tx, userId);
      });
    },
    async catalog() {
      const [rows] = await database.execute(`SELECT c.code,c.name,cc.cycle FROM careers c
        JOIN career_cycles cc ON cc.career_id=c.id WHERE c.is_active=TRUE ORDER BY c.name,cc.cycle`, []);
      const careers = [];
      for (const row of rows) {
        let career = careers.at(-1);
        if (!career || career.code !== row.code) {
          career = { code: row.code, name: row.name, cycles: [] };
          careers.push(career);
        }
        career.cycles.push(Number(row.cycle));
      }
      return careers;
    },
    creditsOwn(userId, page) {
      return database.transaction(tx => readCredits(tx, userId, page));
    },
  });
}
