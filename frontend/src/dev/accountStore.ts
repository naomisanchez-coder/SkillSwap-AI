import { AccountError, applicationStatuses, normalizeApplication, normalizePersonalProfile, type AccountData, type ApplicationCommand, type PersonalProfile } from '../data/account';
import type { AccountService } from '../services/account';
import { auditRecord, validateAudit, type SkillDecision } from '../data/admin';

export const accountStorageKey = 'skillswap:frontend-demo:account:v1';
export type AccountFiles = {
  savePhoto: (userId: string, file: File) => Promise<string>; getPhoto: (id: string) => Promise<Blob | null>; removePhoto: (id: string) => Promise<void>;
  saveEvidence: (file: File) => Promise<string>; getEvidence: (id: string) => Promise<Blob | null>; removeEvidence: (id: string) => Promise<void>;
  validateEvidence: (file: File) => Promise<string | null>;
};
type Options = { storage: () => Pick<Storage, 'getItem' | 'setItem'>; files: AccountFiles; identity: { id: string; name: string }; now?: () => Date };
/** Adaptación del guardado de ProfilePage/submitSkillRequest de Make. Nunca modifica preferencias, reservas o saldos. */
export function createLocalAccountStore({ storage, files, identity, now = () => new Date() }: Options) {
  let queue: Promise<unknown> = Promise.resolve();
  const read = (): AccountData => {
    try {
      const raw = storage().getItem(accountStorageKey);
      if (raw === null) return { version: 1, userId: identity.id, profile: {}, requests: [], notifications: [] };
      const value = JSON.parse(raw) as AccountData;
      if (value.version !== 1 || value.userId !== identity.id || !value.profile || typeof value.profile !== 'object' || !Array.isArray(value.requests) || !Array.isArray(value.notifications)) throw new Error();
      if (value.profile.name !== undefined && (typeof value.profile.name !== 'string' || !value.profile.name.trim() || value.profile.name.length > 120)) throw new Error();
      if (value.profile.bio !== undefined && (typeof value.profile.bio !== 'string' || value.profile.bio.length > 1000)) throw new Error();
      if (value.profile.photoStorageId !== undefined && typeof value.profile.photoStorageId !== 'string') throw new Error();
      if (new Set(value.requests.map(item => item.id)).size !== value.requests.length) throw new Error();
      for (const item of value.requests) {
        if (!item || typeof item.id !== 'string' || item.ownerUserId !== identity.id || !Object.hasOwn(applicationStatuses, item.status) || !['skill', 'level', 'experience', 'topics', 'portfolio', 'evidenceName', 'requestedAt', 'userName', 'submissionId', 'submissionSignature'].every(key => typeof item[key as keyof typeof item] === 'string') || !Array.isArray(item.history) || !Number.isFinite(Date.parse(item.requestedAt))) throw new Error();
        if (item.evidenceStorageId !== undefined && typeof item.evidenceStorageId !== 'string') throw new Error();
        if (item.history.some(event => !event || !Object.hasOwn(applicationStatuses, event.status) || typeof event.id !== 'string' || !Number.isFinite(Date.parse(event.at)))) throw new Error();
      }
      if (new Set(value.notifications.map(item => item.id)).size !== value.notifications.length || value.notifications.some(item => item.userId !== identity.id || item.target !== 'skills')) throw new Error();
      validateAudit(value.adminAuditLog);
      return value;
    } catch { throw new AccountError('storage_invalid', 'No pudimos recuperar el perfil o las solicitudes guardadas en este navegador. No se borraron tus datos. Vuelve a intentarlo.'); }
  };
  const write = (data: AccountData) => {
    try { storage().setItem(accountStorageKey, JSON.stringify(data)); }
    catch { throw new AccountError('storage_failed', 'No pudimos guardar los cambios en este navegador. Se conservó la información anterior. Inténtalo nuevamente.'); }
    return structuredClone(data);
  };
  const serialized = <T,>(run: () => T | Promise<T>): Promise<T> => {
    const next = queue.then(() => typeof window !== 'undefined' && window.navigator.locks ? window.navigator.locks.request(accountStorageKey, run) : run());
    queue = next.catch(() => undefined); return next;
  };
  const compensate = async (remove: () => Promise<void>) => { try { await remove(); } catch { /* Solo podría quedar un archivo sin enlazar; no se altera el registro anterior. */ } };
  const service: AccountService = {
    async getAccount() { return structuredClone(read()); },
    async saveProfile(patch: Pick<PersonalProfile, 'name' | 'bio'>) {
      return serialized(() => { const normalized = normalizePersonalProfile(patch); const account = read(); return write({ ...account, profile: { ...account.profile, ...normalized } }); });
    },
    async savePhoto(file) {
      return serialized(async () => {
        const account = read(); const id = await files.savePhoto(identity.id, file);
        try { return write({ ...account, profile: { ...account.profile, photoStorageId: id } }); }
        catch (error) { await compensate(() => files.removePhoto(id)); throw error; }
      });
    },
    async getPhoto(id) {
      if (read().profile.photoStorageId !== id) throw new AccountError('not_found', 'La fotografía no corresponde al perfil.');
      return files.getPhoto(id);
    },
    async getEvidence(id) {
      if (!read().requests.some(item => item.evidenceStorageId === id && item.ownerUserId === identity.id)) throw new AccountError('not_found', 'El documento no corresponde a una de tus solicitudes.');
      return files.getEvidence(id);
    },
    async submitApplication(command: ApplicationCommand) {
      return serialized(async () => {
        const account = read(); const fields = normalizeApplication(command);
        if (![command.id, command.submissionId].every(id => typeof id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(id))) throw new AccountError('validation', 'La solicitud no es válida. Abre nuevamente el formulario.');
        const existing = account.requests.find(item => item.id === command.id);
        let signatureEvidence: string;
        if (command.evidenceFile) {
          const error = await files.validateEvidence(command.evidenceFile);
          if (error) throw new AccountError('validation', error);
          const digest = await crypto.subtle.digest('SHA-256', await command.evidenceFile.arrayBuffer());
          signatureEvidence = Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
        } else {
          if (!existing?.evidenceStorageId || existing.evidenceStorageId !== command.evidenceStorageId) throw new AccountError('validation', 'Adjunta un PDF válido de hasta 5 MB.');
          if (!await files.getEvidence(existing.evidenceStorageId)) throw new AccountError('evidence_missing', 'El PDF no está disponible en este navegador. Adjunta nuevamente el documento.');
          signatureEvidence = existing.evidenceStorageId;
        }
        const signature = JSON.stringify({ ...fields, evidence: signatureEvidence });
        if (existing?.submissionId === command.submissionId) {
          if (existing.submissionSignature !== signature) throw new AccountError('id_conflict', 'Este envío ya corresponde a otros datos. Abre nuevamente el formulario.');
          return structuredClone(account);
        }
        if (existing && !['observation', 'rejected'].includes(existing.status)) throw new AccountError('duplicate', 'Esta solicitud ya fue enviada y no admite modificaciones en su estado actual.');
        if (account.requests.some(item => item.id !== command.id && ['pending', 'observation', 'approved'].includes(item.status) && item.skill.toLowerCase() === fields.skill.toLowerCase())) throw new AccountError('duplicate', 'Ya tienes una solicitud activa para esta habilidad.');
        let newId: string | undefined;
        try {
          if (command.evidenceFile) newId = await files.saveEvidence(command.evidenceFile);
          const at = now().toISOString();
          const request = { ...fields, id: command.id, ownerUserId: identity.id, userName: account.profile.name ?? identity.name,
            evidenceStorageId: newId ?? existing?.evidenceStorageId, evidenceName: command.evidenceFile?.name ?? existing!.evidenceName,
            requestedAt: at, status: 'pending' as const, submissionId: command.submissionId, submissionSignature: signature,
            history: [...(existing?.history ?? []), { id: `SUB-${command.submissionId}`, status: 'pending' as const, at }],
          };
          return write({ ...account, requests: [request, ...account.requests.filter(item => item.id !== command.id)], notifications: [{ id: `NOT-${command.submissionId}-skill`, userId: identity.id, title: 'Solicitud recibida', description: `${fields.skill} está pendiente de revisión.`, date: 'Ahora', read: false, target: 'skills' }, ...account.notifications] });
        } catch (error) { if (newId) await compensate(() => files.removeEvidence(newId!)); throw error; }
      });
    },
  };
  return { ...service,
    async decideSkill(command: SkillDecision) {
      return serialized(() => {
        const account = read(); const request = account.requests.find(item => item.id === command.id);
        const comment = typeof command.comment === 'string' ? command.comment.trim() : '';
        if (!request || request.submissionId !== command.submissionId || !/^[a-zA-Z0-9-]{1,100}$/.test(command.decisionId) || !['approved', 'rejected'].includes(command.status) || (command.status === 'rejected' && !comment) || comment.length > 2000) throw new AccountError('validation', 'La revisión no es válida o la solicitud cambió. Actualiza la vista.');
        const previous = request.history.find(item => item.id === command.decisionId);
        if (previous) {
          if (previous.status !== command.status || previous.comment !== comment) throw new AccountError('id_conflict', 'Esta decisión ya corresponde a otros datos.');
          return structuredClone(account);
        }
        if (request.status !== 'pending') throw new AccountError('validation', 'La solicitud ya tiene una decisión. Actualiza la vista.');
        const at = now(); request.status = command.status; request.adminComment = comment; request.reviewedAt = at.toISOString();
        request.history.push({ id: command.decisionId, status: command.status, at: at.toISOString(), comment });
        account.adminAuditLog = [auditRecord(command.status === 'approved' ? 'skill_approved' : 'skill_rejected', 'request', request.id, `${request.skill}: ${command.status === 'approved' ? 'Habilidad aprobada' : comment}`, at, command.decisionId), ...(account.adminAuditLog ?? [])];
        account.notifications.unshift({ id: `NOT-${command.decisionId}-review`, userId: request.ownerUserId, title: command.status === 'approved' ? 'Solicitud aprobada' : 'Solicitud rechazada', description: `${request.skill}. ${comment || 'Ya puedes configurar tu oferta.'}`, date: 'Ahora', read: false, target: 'skills' });
        return write(account);
      });
    },
    /** Fixture administrativo explícito; no forma parte de AccountService ni ofrece controles de revisión al estudiante. */
    async reviewFixture(id: string, status: 'observation' | 'rejected' | 'approved', comment: string) {
      return serialized(() => {
        const account = read(); const request = account.requests.find(item => item.id === id);
        if (!request || request.status !== 'pending' || !['observation', 'rejected', 'approved'].includes(status) || (status !== 'approved' && !comment.trim()) || comment.length > 2000) throw new AccountError('validation', 'La revisión de prueba no es válida.');
        const at = now().toISOString();
        request.status = status; request.adminComment = comment.trim(); request.reviewedAt = at;
        request.history.push({ id: `REVIEW-${crypto.randomUUID()}`, status, at, comment: comment.trim() });
        return write(account);
      });
    },
  };
}
