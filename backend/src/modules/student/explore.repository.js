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

async function approvedSkills(executor, userIds) {
  if (!userIds.length) return new Map();
  const placeholders = userIds.map(() => '?').join(',');
  const [rows] = await executor.execute(`SELECT ma.user_id,s.id,s.code,s.name,s.category
    FROM mentor_applications ma JOIN skill_catalog s ON s.id=ma.skill_id AND s.is_active=TRUE
    WHERE ma.status='APPROVED' AND ma.user_id IN (${placeholders}) ORDER BY ma.user_id,s.name,s.id`, userIds);
  const result = new Map(userIds.map(id => [id, []]));
  for (const row of rows) result.get(row.user_id)?.push({ id: row.id, code: row.code,
    name: row.name, category: row.category ?? null });
  return result;
}

const mentorBase = `FROM users u JOIN student_profiles p ON p.user_id=u.id
  JOIN careers c ON c.id=p.career_id LEFT JOIN student_profile_details d ON d.user_id=u.id
  WHERE u.role='STUDENT' AND u.status='ACTIVE' AND u.email_verified_at IS NOT NULL`;

export function createExploreRepository(database) {
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
      let where = `${mentorBase} AND u.id<>? AND EXISTS (SELECT 1 FROM mentor_applications ma
        JOIN skill_catalog sx ON sx.id=ma.skill_id AND sx.is_active=TRUE
        WHERE ma.user_id=u.id AND ma.status='APPROVED'`;
      if (page.skillId) { where += ' AND sx.id=?'; values.push(page.skillId); }
      if (page.category) { where += ' AND sx.category=?'; values.push(page.category); }
      where += ')';
      if (page.q) { where += ` AND (CONCAT_WS(' ',u.first_name,u.last_name) LIKE ? ESCAPE '=' OR EXISTS
        (SELECT 1 FROM mentor_applications mq JOIN skill_catalog sq ON sq.id=mq.skill_id
          WHERE mq.user_id=u.id AND mq.status='APPROVED' AND sq.is_active=TRUE AND sq.name LIKE ? ESCAPE '='))`;
        values.push(pattern(page.q), pattern(page.q)); }
      const sort = "CONCAT_WS(' ',u.first_name,u.last_name)";
      if (page.cursor) { where += ` AND (${sort}>? OR (${sort}=? AND u.id>?))`;
        values.push(page.cursor.label, page.cursor.label, page.cursor.id); }
      values.push(page.limit + 1);
      const [rows] = await database.execute(`SELECT u.id,u.first_name,u.last_name,c.name career,p.cycle,d.bio,
        ${sort} sort_name ${where} ORDER BY sort_name,u.id LIMIT ?`, values);
      const hasMore = rows.length > page.limit;
      const selected = rows.slice(0, page.limit);
      const skills = await approvedSkills(database, selected.map(row => row.id));
      return { mentors: selected.map(row => publicMentor(row, skills.get(row.id) ?? [])),
        pagination: { limit: page.limit, nextCursor: hasMore
          ? encodeCursor(selected.at(-1).sort_name, selected.at(-1).id) : null } };
    },
    async mentor(viewerId, mentorId) {
      const [rows] = await database.execute(`SELECT u.id,u.first_name,u.last_name,c.name career,p.cycle,d.bio
        ${mentorBase} AND u.id<>? AND u.id=? AND EXISTS (SELECT 1 FROM mentor_applications ma
          JOIN skill_catalog s ON s.id=ma.skill_id AND s.is_active=TRUE
          WHERE ma.user_id=u.id AND ma.status='APPROVED')`, [viewerId, mentorId]);
      if (rows.length !== 1) throw new PublicError('FORBIDDEN');
      const skills = await approvedSkills(database, [mentorId]);
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
        ${mentorBase} AND u.id<>? AND EXISTS (SELECT 1 FROM mentor_applications ma
          WHERE ma.user_id=u.id AND ma.status='APPROVED' AND ma.skill_id IN (${placeholders}))`, [userId, ...ids]);
      const skills = await approvedSkills(database, rows.map(row => row.id));
      return { learning, mentors: rows.map(row => publicMentor(row, skills.get(row.id) ?? [])) };
    },
  });
}
