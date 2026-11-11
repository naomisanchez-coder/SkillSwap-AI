export function createAiRepository(database) {
  return Object.freeze({
    async publicContext(viewerId) {
      const [skills] = await database.execute(`SELECT code,name,category FROM skill_catalog
        WHERE is_active=TRUE ORDER BY name,id LIMIT 20`, []);
      const [rows] = await database.execute(`SELECT u.id,u.first_name,u.last_name,s.name skill,
        EXISTS (SELECT 1 FROM mentor_availability av WHERE av.mentor_user_id=u.id AND av.is_active=TRUE) availability
        FROM mentor_offers mo JOIN mentor_applications ma
          ON ma.user_id=mo.mentor_user_id AND ma.skill_id=mo.skill_id AND ma.status='APPROVED'
        JOIN users u ON u.id=mo.mentor_user_id AND u.status='ACTIVE' AND u.email_verified_at IS NOT NULL
        JOIN skill_catalog s ON s.id=mo.skill_id AND s.is_active=TRUE
        WHERE mo.status='ACTIVE' AND u.id<>? ORDER BY u.first_name,u.last_name,u.id,s.name LIMIT 20`, [viewerId]);
      const mentors = [];
      for (const row of rows) {
        let mentor = mentors.find(item => item.key === row.id);
        if (!mentor) {
          mentor = { key: row.id, name: `${row.first_name} ${row.last_name}`.trim(),
            availabilityConfigured: Boolean(row.availability), skills: [] };
          mentors.push(mentor);
        }
        mentor.skills.push(row.skill);
      }
      return { skills: skills.map(skill => ({ code: skill.code, name: skill.name,
        category: skill.category ?? null })), mentors: mentors.map(({ key, ...mentor }) => mentor) };
    },
  });
}
