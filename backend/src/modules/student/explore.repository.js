import { PublicError } from '../../errors/PublicError.js';

function pattern(value) {
  return `%${value.replaceAll('=', '==').replaceAll('%', '=%').replaceAll('_', '=_')}%`;
}
function encodeCursor(label, id) {
  return Buffer.from(JSON.stringify([label, id])).toString('base64url');
}

function publicMentor(row, skills) {
  return { id: row.id, firstName: row.first_name, lastName: row.last_name,
    career: row.career, cycle: Number(row.cycle), bio: row.bio ?? null, skills };
}

async function offeredSkills(executor, userIds, levelsAvailable) {
  if (!userIds.length) return new Map();
  const placeholders = userIds.map(() => '?').join(',');
  const levelSelect = levelsAvailable
    ? ',lc.code level_code,lc.name level_name,lc.rank_value level_rank'
    : ',NULL level_code,NULL level_name,NULL level_rank';
  const levelJoin = levelsAvailable
    ? 'LEFT JOIN mentor_skill_levels msl ON msl.offer_id=mo.id LEFT JOIN skill_level_catalog lc ON lc.code=msl.level_code AND lc.is_active=TRUE'
    : '';
  const [rows] = await executor.execute(`SELECT mo.mentor_user_id user_id,s.id,s.code,s.name,s.category${levelSelect}
    FROM mentor_offers mo JOIN mentor_applications ma
      ON ma.user_id=mo.mentor_user_id AND ma.skill_id=mo.skill_id AND ma.status='APPROVED'
    JOIN skill_catalog s ON s.id=mo.skill_id AND s.is_active=TRUE
    ${levelJoin}
    WHERE mo.status='ACTIVE' AND mo.mentor_user_id IN (${placeholders})
    ORDER BY mo.mentor_user_id,s.name,s.id`, userIds);
  const result = new Map(userIds.map(id => [id, []]));
  for (const row of rows) result.get(row.user_id)?.push({ id: row.id, code: row.code,
    name: row.name, category: row.category ?? null, level: row.level_code ? {
      code: row.level_code, name: row.level_name, rank: Number(row.level_rank),
    } : null });
  return result;
}

const mentorBase = `FROM users u JOIN student_profiles p ON p.user_id=u.id
  JOIN careers c ON c.id=p.career_id LEFT JOIN student_profile_details d ON d.user_id=u.id
  WHERE u.role='STUDENT' AND u.status='ACTIVE' AND u.email_verified_at IS NOT NULL`;

export function createExploreRepository(database, { levelsAvailable = false } = {}) {
  return Object.freeze({
    async catalog(page) {
      const values = [];
      let where = 'WHERE s.is_active=TRUE';
      if (page.q) { where += " AND (s.name LIKE ? ESCAPE '=' OR s.code LIKE ? ESCAPE '=')";
        values.push(pattern(page.q), pattern(page.q)); }
      if (page.category) { where += ' AND s.category=?'; values.push(page.category); }
      if (page.skillId) { where += ' AND s.id=?'; values.push(page.skillId); }
      if (page.cursor) { where += ' AND (s.name>? OR (s.name=? AND s.id>?))';
        values.push(page.cursor.label, page.cursor.label, page.cursor.id); }
      values.push(page.limit + 1);
      const [rows] = await database.execute(`SELECT s.id,s.code,s.name,s.category FROM skill_catalog s ${where}
        ORDER BY s.name,s.id LIMIT ?`, values);
      const [categoryRows] = await database.execute(`SELECT DISTINCT category FROM skill_catalog
        WHERE is_active=TRUE AND category IS NOT NULL ORDER BY category`, []);
      const hasMore = rows.length > page.limit;
      const selected = rows.slice(0, page.limit);
      return { skills: selected.map(row => ({ id: row.id, code: row.code, name: row.name,
        category: row.category ?? null })), categories: categoryRows.map(row => row.category),
        pagination: { limit: page.limit, nextCursor: hasMore
          ? encodeCursor(selected.at(-1).name, selected.at(-1).id) : null } };
    },
    async mentors(viewerId, page) {
      const values = [viewerId];
      let where = `${mentorBase} AND u.id<>? AND EXISTS (SELECT 1 FROM mentor_offers mo
        JOIN mentor_applications ma ON ma.user_id=mo.mentor_user_id AND ma.skill_id=mo.skill_id AND ma.status='APPROVED'
        JOIN skill_catalog sx ON sx.id=mo.skill_id AND sx.is_active=TRUE
        WHERE mo.mentor_user_id=u.id AND mo.status='ACTIVE'`;
      if (page.skillId) { where += ' AND mo.skill_id=?'; values.push(page.skillId); }
      if (page.category) { where += ' AND sx.category=?'; values.push(page.category); }
      where += ')';
      if (page.q) { where += ` AND (CONCAT_WS(' ',u.first_name,u.last_name) LIKE ? ESCAPE '=' OR EXISTS
        (SELECT 1 FROM mentor_offers oq JOIN mentor_applications mq
          ON mq.user_id=oq.mentor_user_id AND mq.skill_id=oq.skill_id AND mq.status='APPROVED'
          JOIN skill_catalog sq ON sq.id=oq.skill_id AND sq.is_active=TRUE
          WHERE oq.mentor_user_id=u.id AND oq.status='ACTIVE' AND sq.name LIKE ? ESCAPE '='))`;
        values.push(pattern(page.q), pattern(page.q)); }
      const sort = "CONCAT_WS(' ',u.first_name,u.last_name)";
      if (page.cursor) { where += ` AND (${sort}>? OR (${sort}=? AND u.id>?))`;
        values.push(page.cursor.label, page.cursor.label, page.cursor.id); }
      values.push(page.limit + 1);
      const [rows] = await database.execute(`SELECT u.id,u.first_name,u.last_name,c.name career,p.cycle,d.bio,
        ${sort} sort_name ${where} ORDER BY sort_name,u.id LIMIT ?`, values);
      const hasMore = rows.length > page.limit;
      const selected = rows.slice(0, page.limit);
      const skills = await offeredSkills(database, selected.map(row => row.id), levelsAvailable);
      return { mentors: selected.map(row => publicMentor(row, skills.get(row.id) ?? [])),
        pagination: { limit: page.limit, nextCursor: hasMore
          ? encodeCursor(selected.at(-1).sort_name, selected.at(-1).id) : null } };
    },
    async mentor(viewerId, mentorId) {
      const [rows] = await database.execute(`SELECT u.id,u.first_name,u.last_name,c.name career,p.cycle,d.bio
        ${mentorBase} AND u.id<>? AND u.id=? AND EXISTS (SELECT 1 FROM mentor_offers mo
          JOIN mentor_applications ma ON ma.user_id=mo.mentor_user_id AND ma.skill_id=mo.skill_id AND ma.status='APPROVED'
          JOIN skill_catalog s ON s.id=mo.skill_id AND s.is_active=TRUE
          WHERE mo.mentor_user_id=u.id AND mo.status='ACTIVE')`, [viewerId, mentorId]);
      if (rows.length !== 1) throw new PublicError('FORBIDDEN');
      const skills = await offeredSkills(database, [mentorId], levelsAvailable);
      return publicMentor(rows[0], skills.get(mentorId) ?? []);
    },
    async recommendationInputs(userId) {
      const [learning] = await database.execute(`SELECT s.id,s.code,s.name FROM student_skills ss
        JOIN skill_catalog s ON s.id=ss.skill_id AND s.is_active=TRUE
        WHERE ss.user_id=? AND ss.intent='LEARN' ORDER BY s.name,s.id`, [userId]);
      if (!learning.length) return { learning, mentors: [] };
      const ids = learning.map(skill => skill.id);
      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await database.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name,c.name career,p.cycle,d.bio
        ${mentorBase} AND u.id<>? AND EXISTS (SELECT 1 FROM mentor_offers mo JOIN mentor_applications ma
          ON ma.user_id=mo.mentor_user_id AND ma.skill_id=mo.skill_id AND ma.status='APPROVED'
          WHERE mo.mentor_user_id=u.id AND mo.status='ACTIVE' AND mo.skill_id IN (${placeholders}))`, [userId, ...ids]);
      const mentorIds = rows.map(row => row.id);
      const skills = await offeredSkills(database, mentorIds, levelsAvailable);
      if (!mentorIds.length) return { learning, mentors: [] };
      const mentorPlaceholders = mentorIds.map(() => '?').join(',');
      const [[clock]] = await database.execute('SELECT UTC_TIMESTAMP(6) now', []);
      const [slots] = await database.execute(`SELECT mentor_user_id,weekday,
        TIME_FORMAT(start_time,'%H:%i') start,TIME_FORMAT(end_time,'%H:%i') end
        FROM mentor_availability WHERE is_active=TRUE AND mentor_user_id IN (${mentorPlaceholders})
        ORDER BY mentor_user_id,weekday,start_time,end_time,id`, mentorIds);
      const [busy] = await database.execute(`SELECT mentor_user_id,starts_at,ends_at FROM mentoring_sessions
        WHERE mentor_user_id IN (${mentorPlaceholders}) AND status IN ('UPCOMING','ACTIVE','AWAITING_VALIDATION')
        AND ends_at>UTC_TIMESTAMP(6) AND starts_at<DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 8 DAY)
        ORDER BY mentor_user_id,starts_at,id`, mentorIds);
      const [quality] = await database.execute(`SELECT ms.mentor_user_id,COUNT(*) completed_sessions,
        COUNT(sr.session_id) reviewed_sessions,AVG(sr.rating) average_rating
        FROM mentoring_sessions ms LEFT JOIN session_reviews sr ON sr.session_id=ms.id
        WHERE ms.mentor_user_id IN (${mentorPlaceholders}) AND ms.status='COMPLETED'
        GROUP BY ms.mentor_user_id ORDER BY ms.mentor_user_id`, mentorIds);
      const byMentor = (values, field = 'mentor_user_id') => values.reduce((map, value) => {
        const list = map.get(value[field]) ?? []; list.push(value); map.set(value[field], list); return map;
      }, new Map());
      const slotMap = byMentor(slots), busyMap = byMentor(busy);
      const qualityMap = new Map(quality.map(value => [value.mentor_user_id, value]));
      return { learning, mentors: rows.map(row => ({ ...publicMentor(row, skills.get(row.id) ?? []),
        availability: { now: clock.now, slots: slotMap.get(row.id) ?? [], busy: busyMap.get(row.id) ?? [] },
        quality: qualityMap.get(row.id) ?? null })) };
    },
  });
}
