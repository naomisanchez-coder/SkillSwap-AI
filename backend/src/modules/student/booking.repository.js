import { randomUUID } from 'node:crypto';
import { PublicError } from '../../errors/PublicError.js';

function iso(value) {
  if (value instanceof Date) return value.toISOString();
  return `${String(value).replace(' ', 'T')}Z`;
}

function publicSession(row) {
  return { id: row.id, student: { id: row.student_user_id, firstName: row.student_first_name,
    lastName: row.student_last_name }, mentor: { id: row.mentor_user_id, firstName: row.mentor_first_name,
    lastName: row.mentor_last_name }, offerId: row.offer_id,
  skill: { id: row.skill_id, code: row.skill_code, name: row.skill_name }, status: row.status,
  startsAt: iso(row.starts_at), endsAt: iso(row.ends_at), durationMinutes: Number(row.duration_minutes),
  creditCost: Number(row.credit_cost), meetingUrl: row.meeting_url ?? null,
  review: row.review_rating === null || row.review_rating === undefined ? null : {
    rating: Number(row.review_rating), comment: row.review_comment ?? null,
  } };
}

const sessionSelect = `SELECT ms.*,su.first_name student_first_name,su.last_name student_last_name,
  mu.first_name mentor_first_name,mu.last_name mentor_last_name,mo.skill_id,sk.code skill_code,sk.name skill_name,
  sr.rating review_rating,sr.comment review_comment
  FROM mentoring_sessions ms JOIN users su ON su.id=ms.student_user_id
  JOIN users mu ON mu.id=ms.mentor_user_id JOIN mentor_offers mo ON mo.id=ms.offer_id
  JOIN skill_catalog sk ON sk.id=mo.skill_id LEFT JOIN session_reviews sr ON sr.session_id=ms.id`;

async function ownSession(executor, userId, sessionId, lock = false) {
  const [rows] = await executor.execute(`${sessionSelect} WHERE ms.id=? AND
    (ms.student_user_id=? OR ms.mentor_user_id=?)${lock ? ' FOR UPDATE' : ''}`, [sessionId, userId, userId]);
  if (rows.length !== 1) throw new PublicError('FORBIDDEN');
  return rows[0];
}

async function lockParticipants(tx, firstId, secondId) {
  const ids = [firstId, secondId].sort();
  const [rows] = await tx.execute(`SELECT u.id FROM users u JOIN student_profiles p ON p.user_id=u.id
    WHERE u.id IN (?,?) AND u.role='STUDENT' AND u.status='ACTIVE' AND u.email_verified_at IS NOT NULL
    ORDER BY u.id FOR UPDATE`, ids);
  if (rows.length !== 2) throw new PublicError('FORBIDDEN');
}

async function transitionContext(tx, userId, sessionId) {
  const [identity] = await tx.execute('SELECT student_user_id,mentor_user_id FROM mentoring_sessions WHERE id=?', [sessionId]);
  if (identity.length !== 1 || ![identity[0].student_user_id, identity[0].mentor_user_id].includes(userId)) {
    throw new PublicError('FORBIDDEN');
  }
  await lockParticipants(tx, identity[0].student_user_id, identity[0].mentor_user_id);
  return ownSession(tx, userId, sessionId, true);
}

async function addEvent(tx, id, sessionId, actor, type, from, to) {
  await tx.execute(`INSERT INTO mentoring_session_events
    (id,session_id,actor_user_id,event_type,from_status,to_status) VALUES (?,?,?,?,?,?)`,
  [id, sessionId, actor, type, from, to]);
}

async function readAvailability(database, userId) {
  const [rows] = await database.execute(`SELECT id,weekday,TIME_FORMAT(start_time,'%H:%i') start,
    TIME_FORMAT(end_time,'%H:%i') end,timezone FROM mentor_availability
    WHERE mentor_user_id=? AND is_active=TRUE ORDER BY weekday,start_time,end_time,id`, [userId]);
  return { timezone: 'America/Lima', slots: rows.map(row => ({ id: row.id, weekday: Number(row.weekday),
    start: row.start, end: row.end })) };
}

export function createBookingRepository(database) {
  return Object.freeze({
    async offers(userId) {
      const [rows] = await database.execute(`SELECT mo.id,mo.skill_id,s.code,s.name,s.category,mo.status
        FROM mentor_offers mo JOIN skill_catalog s ON s.id=mo.skill_id WHERE mo.mentor_user_id=?
        ORDER BY s.name,s.id`, [userId]);
      return rows.map(row => ({ id: row.id, skill: { id: row.skill_id, code: row.code, name: row.name,
        category: row.category ?? null }, active: row.status === 'ACTIVE' }));
    },
    setOffer(userId, skillId, value, offerId) {
      return database.transaction(async tx => {
        const [applications] = await tx.execute(`SELECT id,status FROM mentor_applications
          WHERE user_id=? AND skill_id=? FOR UPDATE`, [userId, skillId]);
        if (applications.length !== 1 || applications[0].status !== 'APPROVED') throw new PublicError('FORBIDDEN');
        await tx.execute(`INSERT INTO mentor_offers (id,mentor_user_id,skill_id,status) VALUES (?,?,?,?)
          ON DUPLICATE KEY UPDATE status=VALUES(status)`, [offerId, userId, skillId, value.active ? 'ACTIVE' : 'PAUSED']);
        const [rows] = await tx.execute('SELECT id,status FROM mentor_offers WHERE mentor_user_id=? AND skill_id=?',
          [userId, skillId]);
        return { id: rows[0].id, skillId, active: rows[0].status === 'ACTIVE' };
      });
    },
    availability(userId) { return readAvailability(database, userId); },
    replaceAvailability(userId, slots) {
      return database.transaction(async tx => {
        const [users] = await tx.execute('SELECT id FROM users WHERE id=? AND status=? FOR UPDATE', [userId, 'ACTIVE']);
        const [approved] = await tx.execute(`SELECT id FROM mentor_applications
          WHERE user_id=? AND status='APPROVED' LIMIT 1 FOR SHARE`, [userId]);
        if (users.length !== 1 || approved.length !== 1) throw new PublicError('FORBIDDEN');
        await tx.execute('DELETE FROM mentor_availability WHERE mentor_user_id=?', [userId]);
        for (const slot of slots) await tx.execute(`INSERT INTO mentor_availability
          (id,mentor_user_id,weekday,start_time,end_time) VALUES (?,?,?,?,?)`,
        [randomUUID(), userId, slot.weekday, `${slot.start}:00`, `${slot.end}:00`]);
        return { timezone: 'America/Lima', slots };
      });
    },
    async publicAvailability(mentorId) {
      const [approved] = await database.execute(`SELECT 1 present FROM mentor_offers mo
        JOIN mentor_applications ma ON ma.user_id=mo.mentor_user_id AND ma.skill_id=mo.skill_id
        WHERE mo.mentor_user_id=? AND mo.status='ACTIVE' AND ma.status='APPROVED' LIMIT 1`, [mentorId]);
      if (approved.length !== 1) throw new PublicError('FORBIDDEN');
      const schedule = await readAvailability(database, mentorId);
      const [busy] = await database.execute(`SELECT starts_at,ends_at FROM mentoring_sessions
        WHERE mentor_user_id=? AND status IN ('UPCOMING','ACTIVE','AWAITING_VALIDATION')
        AND ends_at>UTC_TIMESTAMP(6) ORDER BY starts_at,id LIMIT 200`, [mentorId]);
      return { ...schedule, busy: busy.map(row => ({ startsAt: iso(row.starts_at), endsAt: iso(row.ends_at) })) };
    },
    createBooking(studentId, value) {
      return database.transaction(async tx => {
        const [offers] = await tx.execute(`SELECT mo.id,mo.mentor_user_id,mo.skill_id,mo.status,ma.status approval
          FROM mentor_offers mo JOIN mentor_applications ma
          ON ma.user_id=mo.mentor_user_id AND ma.skill_id=mo.skill_id WHERE mo.id=?`, [value.offerId]);
        if (offers.length !== 1 || offers[0].status !== 'ACTIVE' || offers[0].approval !== 'APPROVED') {
          throw new PublicError('CONFLICT');
        }
        const mentorId = offers[0].mentor_user_id;
        if (mentorId === studentId) throw new PublicError('CONFLICT');
        await lockParticipants(tx, studentId, mentorId);
        const [existing] = await tx.execute(`${sessionSelect} WHERE ms.student_user_id=? AND ms.request_key=? FOR UPDATE`,
          [studentId, value.requestId]);
        if (existing.length) {
          const row = existing[0];
          if (row.offer_id !== value.offerId || new Date(row.starts_at).getTime() !== value.startsAt.getTime() ||
              Number(row.duration_minutes) !== value.durationMinutes) throw new PublicError('CONFLICT');
          return publicSession(row);
        }
        const [freshOffer] = await tx.execute(`SELECT mo.id FROM mentor_offers mo JOIN mentor_applications ma
          ON ma.user_id=mo.mentor_user_id AND ma.skill_id=mo.skill_id
          WHERE mo.id=? AND mo.mentor_user_id=? AND mo.status='ACTIVE' AND ma.status='APPROVED' FOR UPDATE`,
        [value.offerId, mentorId]);
        if (freshOffer.length !== 1) throw new PublicError('CONFLICT');
        const [[clock]] = await tx.execute('SELECT UTC_TIMESTAMP(6) now');
        if (value.startsAt <= new Date(clock.now)) throw new PublicError('CONFLICT');
        const [availability] = await tx.execute(`SELECT id FROM mentor_availability WHERE mentor_user_id=?
          AND weekday=? AND is_active=TRUE AND start_time<=? AND end_time>=? FOR UPDATE`,
        [mentorId, value.slot.weekday, value.slot.start, value.slot.end]);
        if (availability.length === 0) throw new PublicError('CONFLICT');
        const [overlaps] = await tx.execute(`SELECT id FROM mentoring_sessions
          WHERE status IN ('UPCOMING','ACTIVE','AWAITING_VALIDATION')
          AND (student_user_id IN (?,?) OR mentor_user_id IN (?,?))
          AND starts_at<? AND ends_at>? FOR UPDATE`,
        [studentId, mentorId, studentId, mentorId, value.endsAt, value.startsAt]);
        if (overlaps.length) throw new PublicError('CONFLICT');
        const [[wallet]] = await tx.execute('SELECT COALESCE(SUM(amount),0) balance FROM credit_transactions WHERE user_id=?',
          [studentId]);
        if (Number(wallet.balance) < value.creditCost) throw new PublicError('CONFLICT');
        await tx.execute(`INSERT INTO mentoring_sessions
          (id,request_key,student_user_id,mentor_user_id,offer_id,starts_at,ends_at,duration_minutes,credit_cost)
          VALUES (?,?,?,?,?,?,?,?,?)`, [value.sessionId, value.requestId, studentId, mentorId, value.offerId,
          value.startsAt, value.endsAt, value.durationMinutes, value.creditCost]);
        await tx.execute(`INSERT INTO credit_transactions
          (id,user_id,amount,reason,operation_reference) VALUES (?,?,-?,'SESSION_HOLD',?)`,
        [value.holdTransactionId, studentId, value.creditCost, `session:${value.sessionId}:hold`]);
        await tx.execute(`INSERT INTO session_credit_holds (session_id,hold_transaction_id)
          VALUES (?,?)`, [value.sessionId, value.holdTransactionId]);
        await addEvent(tx, value.eventId, value.sessionId, studentId, 'BOOKED', null, 'UPCOMING');
        return publicSession(await ownSession(tx, studentId, value.sessionId));
      });
    },
    async sessions(userId, page) {
      const values = [userId, userId];
      let filter = 'WHERE (ms.student_user_id=? OR ms.mentor_user_id=?)';
      if (page.status) { filter += ' AND ms.status=?'; values.push(page.status); }
      values.push(page.limit);
      const [rows] = await database.execute(`${sessionSelect} ${filter} ORDER BY ms.starts_at DESC,ms.id DESC LIMIT ?`, values);
      return rows.map(publicSession);
    },
    async session(userId, sessionId) { return publicSession(await ownSession(database, userId, sessionId)); },
    setMeeting(userId, sessionId, meetingUrl) {
      return database.transaction(async tx => {
        const row = await transitionContext(tx, userId, sessionId);
        if (row.mentor_user_id !== userId || row.status !== 'UPCOMING') throw new PublicError('CONFLICT');
        await tx.execute('UPDATE mentoring_sessions SET meeting_url=? WHERE id=?', [meetingUrl, sessionId]);
        return publicSession(await ownSession(tx, userId, sessionId));
      });
    },
    start(userId, sessionId, eventId) {
      return database.transaction(async tx => {
        const row = await transitionContext(tx, userId, sessionId);
        if (row.mentor_user_id !== userId) throw new PublicError('FORBIDDEN');
        if (row.status === 'ACTIVE') return publicSession(row);
        if (row.status !== 'UPCOMING' || !row.meeting_url) throw new PublicError('CONFLICT');
        const [[clock]] = await tx.execute('SELECT UTC_TIMESTAMP(6) now');
        if (new Date(clock.now) < new Date(row.starts_at) || new Date(clock.now) >= new Date(row.ends_at)) {
          throw new PublicError('CONFLICT');
        }
        await tx.execute("UPDATE mentoring_sessions SET status='ACTIVE',started_at=UTC_TIMESTAMP(6) WHERE id=?", [sessionId]);
        await addEvent(tx, eventId, sessionId, userId, 'STARTED', 'UPCOMING', 'ACTIVE');
        return publicSession(await ownSession(tx, userId, sessionId));
      });
    },
    performed(userId, sessionId, eventId) {
      return database.transaction(async tx => {
        const row = await transitionContext(tx, userId, sessionId);
        if (row.mentor_user_id !== userId) throw new PublicError('FORBIDDEN');
        if (row.status === 'AWAITING_VALIDATION') return publicSession(row);
        if (row.status !== 'ACTIVE') throw new PublicError('CONFLICT');
        const [[clock]] = await tx.execute('SELECT UTC_TIMESTAMP(6) now');
        if (new Date(clock.now) < new Date(row.ends_at)) throw new PublicError('CONFLICT');
        await tx.execute(`UPDATE mentoring_sessions SET status='AWAITING_VALIDATION',performed_at=UTC_TIMESTAMP(6)
          WHERE id=?`, [sessionId]);
        await addEvent(tx, eventId, sessionId, userId, 'PERFORMED', 'ACTIVE', 'AWAITING_VALIDATION');
        return publicSession(await ownSession(tx, userId, sessionId));
      });
    },
    validate(userId, sessionId, value) {
      return database.transaction(async tx => {
        const row = await transitionContext(tx, userId, sessionId);
        if (row.student_user_id !== userId) throw new PublicError('FORBIDDEN');
        if (row.status === 'COMPLETED') return publicSession(row);
        if (row.status !== 'AWAITING_VALIDATION') throw new PublicError('CONFLICT');
        const [holds] = await tx.execute('SELECT status FROM session_credit_holds WHERE session_id=? FOR UPDATE', [sessionId]);
        if (holds.length !== 1 || holds[0].status !== 'HELD') throw new PublicError('CONFLICT');
        await tx.execute(`INSERT INTO credit_transactions
          (id,user_id,amount,reason,operation_reference) VALUES (?,?,?,'SESSION_EARNING',?)`,
        [value.earningTransactionId, row.mentor_user_id, row.credit_cost, `session:${sessionId}:earning`]);
        await tx.execute(`UPDATE session_credit_holds SET status='SETTLED',settlement_transaction_id=?,
          settled_at=UTC_TIMESTAMP(6) WHERE session_id=? AND status='HELD'`, [value.earningTransactionId, sessionId]);
        await tx.execute(`UPDATE mentoring_sessions SET status='COMPLETED',validated_at=UTC_TIMESTAMP(6)
          WHERE id=?`, [sessionId]);
        await addEvent(tx, value.eventId, sessionId, userId, 'VALIDATED', 'AWAITING_VALIDATION', 'COMPLETED');
        return publicSession(await ownSession(tx, userId, sessionId));
      });
    },
    cancel(userId, sessionId, value) {
      return database.transaction(async tx => {
        const row = await transitionContext(tx, userId, sessionId);
        if (row.status === 'CANCELLED') return publicSession(row);
        if (row.status !== 'UPCOMING') throw new PublicError('CONFLICT');
        const [[clock]] = await tx.execute('SELECT UTC_TIMESTAMP(6) now');
        if (new Date(clock.now) >= new Date(row.starts_at)) throw new PublicError('CONFLICT');
        const [holds] = await tx.execute(`SELECT status,refund_transaction_id FROM session_credit_holds
          WHERE session_id=? FOR UPDATE`, [sessionId]);
        if (holds.length !== 1 || holds[0].status !== 'HELD') throw new PublicError('CONFLICT');
        await tx.execute(`INSERT INTO credit_transactions
          (id,user_id,amount,reason,operation_reference) VALUES (?,?,?,'SESSION_REFUND',?)`,
        [value.refundTransactionId, row.student_user_id, row.credit_cost, `session:${sessionId}:refund`]);
        await tx.execute(`UPDATE session_credit_holds SET status='REFUNDED',refund_transaction_id=?,
          refunded_at=UTC_TIMESTAMP(6) WHERE session_id=? AND status='HELD'`,
        [value.refundTransactionId, sessionId]);
        await tx.execute(`UPDATE mentoring_sessions SET status='CANCELLED',cancelled_at=UTC_TIMESTAMP(6)
          WHERE id=? AND status='UPCOMING'`, [sessionId]);
        await addEvent(tx, value.eventId, sessionId, userId, 'CANCELLED', 'UPCOMING', 'CANCELLED');
        return publicSession(await ownSession(tx, userId, sessionId));
      });
    },
    review(userId, sessionId, review, eventId) {
      return database.transaction(async tx => {
        const row = await transitionContext(tx, userId, sessionId);
        if (row.student_user_id !== userId || row.status !== 'COMPLETED') throw new PublicError('FORBIDDEN');
        const [existing] = await tx.execute('SELECT rating,comment FROM session_reviews WHERE session_id=? FOR UPDATE', [sessionId]);
        if (existing.length) {
          if (Number(existing[0].rating) !== review.rating || (existing[0].comment ?? null) !== review.comment) {
            throw new PublicError('CONFLICT');
          }
          return { sessionId, rating: review.rating, comment: review.comment };
        }
        await tx.execute(`INSERT INTO session_reviews
          (session_id,reviewer_user_id,mentor_user_id,rating,comment) VALUES (?,?,?,?,?)`,
        [sessionId, userId, row.mentor_user_id, review.rating, review.comment]);
        await addEvent(tx, eventId, sessionId, userId, 'REVIEWED', 'COMPLETED', 'COMPLETED');
        return { sessionId, rating: review.rating, comment: review.comment };
      });
    },
    async credits(userId) {
      const [[summary]] = await database.execute(`SELECT COALESCE(SUM(ct.amount),0) available,
        COALESCE(SUM(CASE WHEN h.status='HELD' THEN -ct.amount ELSE 0 END),0) held
        FROM credit_transactions ct LEFT JOIN session_credit_holds h ON h.hold_transaction_id=ct.id
        WHERE ct.user_id=?`, [userId]);
      const available = Number(summary.available), held = Number(summary.held);
      return { total: available + held, held, available };
    },
  });
}
