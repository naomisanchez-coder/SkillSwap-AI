import { PublicError } from '../../errors/PublicError.js';

async function insertFile(tx, owner, value) {
  await tx.execute(`INSERT INTO private_files
    (id,owner_user_id,purpose,storage_key,media_type,size_bytes,sha256)
    VALUES (?,?,?,?,?,?,?)`, [value.id, owner, value.purpose, value.storageKey,
    value.mediaType, value.size, value.sha256]);
}

async function applicationRow(tx, userId, applicationId, lock = false) {
  const [rows] = await tx.execute(`SELECT id,user_id,skill_id,status,portfolio_url,submitted_at,updated_at,
      decided_at,decision_notes FROM mentor_applications WHERE id=? AND user_id=?${lock ? ' FOR UPDATE' : ''}`,
  [applicationId, userId]);
  if (rows.length !== 1) throw new PublicError('FORBIDDEN');
  return rows[0];
}

function publicApplication(row) {
  return { id: row.id, skillId: row.skill_id, skill: row.skill, skillCode: row.skill_code,
    status: row.status, portfolioUrl: row.portfolio_url ?? null, declaredLevel: row.declared_level ?? null,
    experience: row.experience ?? null, topics: row.topics ?? null,
    submittedAt: row.submitted_at, updatedAt: row.updated_at,
    decidedAt: row.decided_at ?? null, decisionNotes: row.decision_notes ?? null,
    certificateAttached: Boolean(row.certificate_attached), portfolioAttached: Boolean(row.portfolio_attached) };
}

export function createMentorRepository(database, { detailsAvailable = false } = {}) {
  return Object.freeze({
    detailsAvailable,
    async catalog() {
      const [rows] = await database.execute(`SELECT id,code,name,category FROM skill_catalog
        WHERE is_active=TRUE ORDER BY name,id`, []);
      return rows.map(row => ({ id: row.id, code: row.code, name: row.name, category: row.category ?? null }));
    },
    async ownSkills(userId) {
      const [rows] = await database.execute(`SELECT s.id,s.code,s.name,s.category,ss.intent,
          EXISTS(SELECT 1 FROM mentor_applications ma WHERE ma.user_id=ss.user_id
            AND ma.skill_id=ss.skill_id AND ma.status='APPROVED') approved
        FROM student_skills ss JOIN skill_catalog s ON s.id=ss.skill_id
        WHERE ss.user_id=? ORDER BY s.name,ss.intent`, [userId]);
      const skills = [];
      for (const row of rows) {
        let skill = skills.at(-1);
        if (!skill || skill.id !== row.id) {
          skill = { id: row.id, code: row.code, name: row.name, category: row.category ?? null,
            learning: false, teaching: false, approvedToMentor: Boolean(row.approved) };
          skills.push(skill);
        }
        if (row.intent === 'LEARN') skill.learning = true;
        if (row.intent === 'TEACH') skill.teaching = true;
      }
      return skills;
    },
    async setOwnSkill(userId, skillId, { learning, teaching }) {
      return database.transaction(async tx => {
        const [skills] = await tx.execute('SELECT id FROM skill_catalog WHERE id=? AND is_active=TRUE FOR SHARE', [skillId]);
        if (skills.length !== 1) throw new PublicError('VALIDATION_ERROR', { skillId: 'Selecciona una habilidad activa.' });
        await tx.execute('DELETE FROM student_skills WHERE user_id=? AND skill_id=?', [userId, skillId]);
        if (learning) await tx.execute('INSERT INTO student_skills (user_id,skill_id,intent) VALUES (?,?,?)',
          [userId, skillId, 'LEARN']);
        if (teaching) await tx.execute('INSERT INTO student_skills (user_id,skill_id,intent) VALUES (?,?,?)',
          [userId, skillId, 'TEACH']);
        return { skillId, learning, teaching };
      });
    },
    async applications(userId) {
      const [rows] = await database.execute(`SELECT ma.*,s.name skill,s.code skill_code,${detailsAvailable ? 'md.declared_level,md.experience,md.topics,' : ''}
          EXISTS(SELECT 1 FROM mentor_application_documents d WHERE d.application_id=ma.id
            AND d.document_type='CERTIFICATE') certificate_attached,
          EXISTS(SELECT 1 FROM mentor_application_documents d WHERE d.application_id=ma.id
            AND d.document_type='PORTFOLIO') portfolio_attached
        FROM mentor_applications ma JOIN skill_catalog s ON s.id=ma.skill_id
        ${detailsAvailable ? 'LEFT JOIN mentor_application_details md ON md.application_id=ma.id' : ''}
        WHERE ma.user_id=? ORDER BY ma.submitted_at DESC,ma.id DESC`, [userId]);
      return rows.map(publicApplication);
    },
    async createApplication(userId, value) {
      return database.transaction(async tx => {
        const [skills] = await tx.execute('SELECT id FROM skill_catalog WHERE id=? AND is_active=TRUE FOR SHARE', [value.skillId]);
        if (skills.length !== 1) throw new PublicError('VALIDATION_ERROR', { skillId: 'Selecciona una habilidad activa.' });
        const [existing] = await tx.execute(
          'SELECT id FROM mentor_applications WHERE user_id=? AND skill_id=? FOR UPDATE', [userId, value.skillId]);
        if (existing.length) throw new PublicError('CONFLICT');
        await insertFile(tx, userId, value.certificate);
        if (value.portfolio) await insertFile(tx, userId, value.portfolio);
        await tx.execute(`INSERT INTO mentor_applications
          (id,user_id,skill_id,status,portfolio_url) VALUES (?,?,?,'PENDING',?)`,
        [value.id, userId, value.skillId, value.portfolioUrl]);
        if (value.details) {
          if (!detailsAvailable) throw new PublicError('APPLICATION_DETAILS_UNAVAILABLE');
          await tx.execute(`INSERT INTO mentor_application_details (application_id,declared_level,experience,topics) VALUES (?,?,?,?)`, [value.id, value.details.declaredLevel, value.details.experience, value.details.topics]);
        }
        await tx.execute(`INSERT INTO mentor_application_documents
          (application_id,document_type,file_id) VALUES (?,'CERTIFICATE',?)`, [value.id, value.certificate.id]);
        if (value.portfolio) await tx.execute(`INSERT INTO mentor_application_documents
          (application_id,document_type,file_id) VALUES (?,'PORTFOLIO',?)`, [value.id, value.portfolio.id]);
        await tx.execute(`INSERT IGNORE INTO student_skills (user_id,skill_id,intent) VALUES (?,?,'TEACH')`,
          [userId, value.skillId]);
        await tx.execute(`INSERT INTO mentor_application_events
          (id,application_id,actor_user_id,event_type,to_status) VALUES (?,?,?,'SUBMITTED','PENDING')`,
        [value.eventId, value.id, userId]);
        return { id: value.id, skillId: value.skillId, status: 'PENDING', portfolioUrl: value.portfolioUrl,
          certificateAttached: true, portfolioAttached: Boolean(value.portfolio) };
      });
    },
    async updateApplication(userId, applicationId, value) {
      if (!detailsAvailable) throw new PublicError('APPLICATION_DETAILS_UNAVAILABLE');
      return database.transaction(async tx => {
        const application = await applicationRow(tx, userId, applicationId, true);
        if (!['PENDING', 'REJECTED'].includes(application.status)) throw new PublicError('CONFLICT');
        await tx.execute(`INSERT INTO mentor_application_details (application_id,declared_level,experience,topics) VALUES (?,?,?,?)
          ON DUPLICATE KEY UPDATE declared_level=?,experience=?,topics=?`,
        [applicationId, value.declaredLevel, value.experience, value.topics, value.declaredLevel, value.experience, value.topics]);
        await tx.execute('UPDATE mentor_applications SET portfolio_url=?,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND user_id=?', [value.portfolioUrl, applicationId, userId]);
        return { id: applicationId, status: application.status, declaredLevel: value.declaredLevel, experience: value.experience, topics: value.topics, portfolioUrl: value.portfolioUrl };
      });
    },
    async replaceCertificate(userId, applicationId, value) {
      return database.transaction(async tx => {
        const application = await applicationRow(tx, userId, applicationId, true);
        if (!['PENDING', 'REJECTED'].includes(application.status)) throw new PublicError('CONFLICT');
        const [documents] = await tx.execute(`SELECT d.file_id,f.storage_key FROM mentor_application_documents d
          JOIN private_files f ON f.id=d.file_id WHERE d.application_id=? AND d.document_type='CERTIFICATE' FOR UPDATE`,
        [applicationId]);
        await insertFile(tx, userId, value.file);
        if (documents.length) {
          await tx.execute(`UPDATE mentor_application_documents SET file_id=?,created_at=UTC_TIMESTAMP(6)
            WHERE application_id=? AND document_type='CERTIFICATE'`, [value.file.id, applicationId]);
          await tx.execute(`UPDATE private_files SET status='DELETED',deleted_at=UTC_TIMESTAMP(6)
            WHERE id=? AND status='READY'`, [documents[0].file_id]);
        } else await tx.execute(`INSERT INTO mentor_application_documents
          (application_id,document_type,file_id) VALUES (?,'CERTIFICATE',?)`, [applicationId, value.file.id]);
        await tx.execute(`INSERT INTO mentor_application_events
          (id,application_id,actor_user_id,event_type,from_status,to_status)
          VALUES (?,?,?,'CERTIFICATE_REPLACED',?,?)`,
        [value.eventId, applicationId, userId, application.status, application.status]);
        return { oldStorageKey: documents[0]?.storage_key ?? null, status: application.status };
      });
    },
    async resubmit(userId, applicationId, eventId) {
      return database.transaction(async tx => {
        const application = await applicationRow(tx, userId, applicationId, true);
        if (application.status !== 'REJECTED') throw new PublicError('CONFLICT');
        const [certificate] = await tx.execute(`SELECT 1 present FROM mentor_application_documents d
          JOIN private_files f ON f.id=d.file_id AND f.status='READY'
          WHERE d.application_id=? AND d.document_type='CERTIFICATE'`, [applicationId]);
        if (certificate.length !== 1) throw new PublicError('CONFLICT');
        await tx.execute(`UPDATE mentor_applications SET status='PENDING',submitted_at=UTC_TIMESTAMP(6),
          decided_at=NULL,decided_by=NULL,decision_notes=NULL WHERE id=?`, [applicationId]);
        await tx.execute(`INSERT INTO mentor_application_events
          (id,application_id,actor_user_id,event_type,from_status,to_status)
          VALUES (?,?,?,'RESUBMITTED','REJECTED','PENDING')`, [eventId, applicationId, userId]);
        return { id: applicationId, status: 'PENDING' };
      });
    },
    async document(userId, applicationId, type) {
      const [rows] = await database.execute(`SELECT f.storage_key,f.media_type,f.size_bytes,f.sha256
        FROM mentor_applications ma JOIN mentor_application_documents d ON d.application_id=ma.id
        JOIN private_files f ON f.id=d.file_id AND f.status='READY'
        WHERE ma.id=? AND ma.user_id=? AND d.document_type=?`, [applicationId, userId, type]);
      if (rows.length !== 1) throw new PublicError('FORBIDDEN');
      return rows[0];
    },
    async photo(userId) {
      const [rows] = await database.execute(`SELECT f.storage_key,f.media_type,f.size_bytes,f.sha256
        FROM student_profile_photos p JOIN private_files f ON f.id=p.file_id AND f.status='READY'
        WHERE p.user_id=?`, [userId]);
      if (rows.length !== 1) throw new PublicError('FORBIDDEN');
      return rows[0];
    },
    async replacePhoto(userId, value) {
      return database.transaction(async tx => {
        const [current] = await tx.execute(`SELECT p.file_id,f.storage_key FROM student_profile_photos p
          JOIN private_files f ON f.id=p.file_id WHERE p.user_id=? FOR UPDATE`, [userId]);
        await insertFile(tx, userId, value.file);
        if (current.length) {
          await tx.execute('UPDATE student_profile_photos SET file_id=? WHERE user_id=?', [value.file.id, userId]);
          await tx.execute(`UPDATE private_files SET status='DELETED',deleted_at=UTC_TIMESTAMP(6)
            WHERE id=? AND status='READY'`, [current[0].file_id]);
        } else await tx.execute('INSERT INTO student_profile_photos (user_id,file_id) VALUES (?,?)',
          [userId, value.file.id]);
        return { oldStorageKey: current[0]?.storage_key ?? null };
      });
    },
    async deletePhoto(userId) {
      return database.transaction(async tx => {
        const [current] = await tx.execute(`SELECT p.file_id,f.storage_key FROM student_profile_photos p
          JOIN private_files f ON f.id=p.file_id WHERE p.user_id=? FOR UPDATE`, [userId]);
        if (!current.length) return { deleted: false, oldStorageKey: null };
        await tx.execute('DELETE FROM student_profile_photos WHERE user_id=?', [userId]);
        await tx.execute(`UPDATE private_files SET status='DELETED',deleted_at=UTC_TIMESTAMP(6)
          WHERE id=? AND status='READY'`, [current[0].file_id]);
        return { deleted: true, oldStorageKey: current[0].storage_key };
      });
    },
  });
}
