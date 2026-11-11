import { PublicError } from '../../errors/PublicError.js';

function timestamp(value) {
  if (value instanceof Date) return value.toISOString();
  return `${String(value).replace(' ', 'T')}Z`;
}

function application(row) {
  return { id: row.id, applicant: { id: row.user_id, firstName: row.first_name, lastName: row.last_name,
    career: row.career, cycle: Number(row.cycle) }, skill: { id: row.skill_id, code: row.code, name: row.skill_name },
  status: row.status, submittedAt: timestamp(row.submitted_at), documents: {
    certificate: Boolean(row.has_certificate), portfolio: Boolean(row.has_portfolio),
  }, portfolioUrlAvailable: Boolean(row.portfolio_url) };
}

export function createAdminRepository(database) {
  return Object.freeze({
    async pending(limit) {
      const [rows] = await database.execute(`SELECT ma.id,ma.user_id,ma.skill_id,ma.status,ma.submitted_at,
        ma.portfolio_url,u.first_name,u.last_name,c.name career,p.cycle,s.code,s.name skill_name,
        EXISTS (SELECT 1 FROM mentor_application_documents d WHERE d.application_id=ma.id
          AND d.document_type='CERTIFICATE') has_certificate,
        EXISTS (SELECT 1 FROM mentor_application_documents d WHERE d.application_id=ma.id
          AND d.document_type='PORTFOLIO') has_portfolio
        FROM mentor_applications ma JOIN users u ON u.id=ma.user_id
        JOIN student_profiles p ON p.user_id=ma.user_id JOIN careers c ON c.id=p.career_id
        JOIN skill_catalog s ON s.id=ma.skill_id
        WHERE ma.status='PENDING' ORDER BY ma.submitted_at,ma.id LIMIT ?`, [limit]);
      return rows.map(application);
    },
    async document(applicationId, type) {
      const [rows] = await database.execute(`SELECT pf.storage_key,pf.media_type,pf.size_bytes,pf.sha256
        FROM mentor_application_documents d JOIN private_files pf ON pf.id=d.file_id AND pf.status='READY'
        JOIN mentor_applications ma ON ma.id=d.application_id
        WHERE d.application_id=? AND d.document_type=? LIMIT 1`, [applicationId, type]);
      if (rows.length !== 1) throw new PublicError('FORBIDDEN');
      return rows[0];
    },
    decide(adminId, applicationId, decision, reason, eventId) {
      return database.transaction(async tx => {
        const [rows] = await tx.execute(`SELECT ma.id,ma.user_id,ma.skill_id,ma.status,
          EXISTS (SELECT 1 FROM mentor_application_documents d JOIN private_files pf
            ON pf.id=d.file_id AND pf.status='READY'
            WHERE d.application_id=ma.id AND d.document_type='CERTIFICATE') has_certificate
          FROM mentor_applications ma WHERE ma.id=? FOR UPDATE`, [applicationId]);
        if (rows.length !== 1) throw new PublicError('FORBIDDEN');
        const current = rows[0];
        if (current.user_id === adminId) throw new PublicError('FORBIDDEN');
        if (current.status !== 'PENDING' || (decision === 'APPROVED' && !current.has_certificate)) {
          throw new PublicError('CONFLICT');
        }
        await tx.execute(`UPDATE mentor_applications SET status=?,decided_at=UTC_TIMESTAMP(6),decided_by=?,
          decision_notes=? WHERE id=? AND status='PENDING'`, [decision, adminId, reason, applicationId]);
        await tx.execute(`INSERT INTO mentor_application_events
          (id,application_id,actor_user_id,event_type,from_status,to_status,notes)
          VALUES (?,?,?,?,'PENDING',?,?)`, [eventId, applicationId, adminId, decision, decision, reason]);
        return { id: applicationId, applicantId: current.user_id, skillId: current.skill_id,
          status: decision, decidedBy: adminId, reason };
      });
    },
    assignLevel(adminId, offerId, levelCode) {
      return database.transaction(async tx => {
        const [offers] = await tx.execute(`SELECT mo.id,mo.mentor_user_id,mo.skill_id,ma.status approval
          FROM mentor_offers mo JOIN mentor_applications ma
            ON ma.user_id=mo.mentor_user_id AND ma.skill_id=mo.skill_id
          WHERE mo.id=? FOR UPDATE`, [offerId]);
        if (offers.length !== 1 || offers[0].approval !== 'APPROVED' || offers[0].mentor_user_id === adminId) {
          throw new PublicError('FORBIDDEN');
        }
        const [levels] = await tx.execute('SELECT code,name,rank_value FROM skill_level_catalog WHERE code=? AND is_active=TRUE FOR SHARE',
          [levelCode]);
        if (levels.length !== 1) throw new PublicError('VALIDATION_ERROR', { levelCode: 'Selecciona un nivel activo.' });
        const [existing] = await tx.execute('SELECT level_code,assigned_by,assigned_at FROM mentor_skill_levels WHERE offer_id=? FOR UPDATE',
          [offerId]);
        if (existing.length) {
          if (existing[0].level_code !== levelCode) throw new PublicError('CONFLICT');
          return { offerId, level: { code: levelCode, name: levels[0].name, rank: Number(levels[0].rank_value) },
            assignedBy: existing[0].assigned_by, assignedAt: timestamp(existing[0].assigned_at) };
        }
        await tx.execute(`INSERT INTO mentor_skill_levels (offer_id,level_code,assigned_by)
          VALUES (?,?,?)`, [offerId, levelCode, adminId]);
        const [[stored]] = await tx.execute('SELECT assigned_at FROM mentor_skill_levels WHERE offer_id=?', [offerId]);
        return { offerId, level: { code: levelCode, name: levels[0].name, rank: Number(levels[0].rank_value) },
          assignedBy: adminId, assignedAt: timestamp(stored.assigned_at) };
      });
    },
  });
}
