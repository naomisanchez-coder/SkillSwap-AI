import { readFile } from 'node:fs/promises';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const canonical = value => value.normalize('NFKD').replaceAll(/\p{M}/gu, '').toLocaleLowerCase('es');

export function validateSkillCatalog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'scope,skills,version' ||
      !['APPROVED', 'DEMO_ONLY'].includes(value.scope) ||
      typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.version) ||
      !Array.isArray(value.skills) || value.skills.length < 1 || value.skills.length > 500) {
    throw new Error('Invalid skill catalog');
  }
  const catalog = { version: value.version, scope: value.scope, skills: value.skills.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).sort().join(',') !== 'category,code,id,name' ||
        typeof item.id !== 'string' || !uuid.test(item.id) || typeof item.code !== 'string' ||
        !slug.test(item.code) || item.code.length > 80 || typeof item.name !== 'string' ||
        item.name !== item.name.trim() || [...item.name].length < 2 || [...item.name].length > 120 ||
        !(item.category === null || (typeof item.category === 'string' && item.category === item.category.trim() &&
          [...item.category].length >= 2 && [...item.category].length <= 100))) throw new Error('Invalid skill catalog');
    return Object.freeze({ id: item.id, code: item.code, name: item.name, category: item.category });
  }) };
  for (const field of ['id', 'code']) {
    if (new Set(catalog.skills.map(item => item[field])).size !== catalog.skills.length) throw new Error('Invalid skill catalog');
  }
  if (new Set(catalog.skills.map(item => canonical(item.name))).size !== catalog.skills.length) {
    throw new Error('Invalid skill catalog');
  }
  return Object.freeze({ version: catalog.version, scope: catalog.scope, skills: Object.freeze(catalog.skills) });
}

export async function readSkillCatalog(path) {
  return validateSkillCatalog(JSON.parse(await readFile(path, 'utf8')));
}

// Inserts only missing exact rows. Conflicts abort the transaction and existing rows are never overwritten.
export async function synchronizeSkillCatalog(database, catalog, { apply = false } = {}) {
  const value = validateSkillCatalog(catalog);
  return database.transaction(async tx => {
    let missing = 0;
    for (const skill of value.skills) {
      const [rows] = await tx.execute(`SELECT id,code,name,category,is_active FROM skill_catalog
        WHERE id=? OR code=? OR name=? FOR UPDATE`, [skill.id, skill.code, skill.name]);
      if (rows.length && (rows.length !== 1 || rows[0].id !== skill.id || rows[0].code !== skill.code ||
          rows[0].name !== skill.name || (rows[0].category ?? null) !== skill.category || Number(rows[0].is_active) !== 1)) {
        throw new Error('Skill catalog conflict; no existing rows overwritten');
      }
      if (!rows.length) {
        missing++;
        if (apply) await tx.execute('INSERT INTO skill_catalog (id,code,name,category) VALUES (?,?,?,?)',
          [skill.id, skill.code, skill.name, skill.category]);
      }
    }
    const [[stored]] = await tx.execute('SELECT COUNT(*) total FROM skill_catalog', []);
    return { version: value.version, scope: value.scope, apply, entries: value.skills.length,
      missing, stored: Number(stored.total) };
  });
}
