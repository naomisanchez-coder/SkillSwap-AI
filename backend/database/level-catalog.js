import { readFile } from 'node:fs/promises';

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const canonical = value => value.normalize('NFKD').replaceAll(/\p{M}/gu, '').toLocaleLowerCase('es');

export function validateLevelCatalog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'levels,scope,version' ||
      !['APPROVED', 'DEMO_ONLY'].includes(value.scope) || typeof value.version !== 'string' ||
      !/^\d+\.\d+\.\d+$/.test(value.version) || !Array.isArray(value.levels) ||
      value.levels.length < 1 || value.levels.length > 20) throw new Error('Invalid level catalog');
  const levels = value.levels.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).sort().join(',') !== 'code,name,rank' || typeof item.code !== 'string' ||
        !slug.test(item.code) || item.code.length > 40 || typeof item.name !== 'string' ||
        item.name !== item.name.trim() || [...item.name].length < 2 || [...item.name].length > 80 ||
        !Number.isInteger(item.rank) || item.rank < 1 || item.rank > 100) throw new Error('Invalid level catalog');
    return Object.freeze({ code: item.code, name: item.name, rank: item.rank });
  });
  for (const values of [levels.map(item => item.code), levels.map(item => canonical(item.name)), levels.map(item => item.rank)]) {
    if (new Set(values).size !== levels.length) throw new Error('Invalid level catalog');
  }
  return Object.freeze({ version: value.version, scope: value.scope, levels: Object.freeze(levels) });
}

export async function readLevelCatalog(path) {
  return validateLevelCatalog(JSON.parse(await readFile(path, 'utf8')));
}

export async function synchronizeLevelCatalog(database, catalog, { apply = false } = {}) {
  const value = validateLevelCatalog(catalog);
  return database.transaction(async tx => {
    let missing = 0;
    for (const level of value.levels) {
      const [rows] = await tx.execute(`SELECT code,name,rank_value,is_active FROM skill_level_catalog
        WHERE code=? OR name=? OR rank_value=? FOR UPDATE`, [level.code, level.name, level.rank]);
      if (rows.length && (rows.length !== 1 || rows[0].code !== level.code || rows[0].name !== level.name ||
          Number(rows[0].rank_value) !== level.rank || Number(rows[0].is_active) !== 1)) {
        throw new Error('Level catalog conflict; no existing rows overwritten');
      }
      if (!rows.length) {
        missing++;
        if (apply) await tx.execute('INSERT INTO skill_level_catalog (code,name,rank_value) VALUES (?,?,?)',
          [level.code, level.name, level.rank]);
      }
    }
    const [[stored]] = await tx.execute('SELECT COUNT(*) total FROM skill_level_catalog', []);
    return { version: value.version, scope: value.scope, apply, entries: value.levels.length,
      missing, stored: Number(stored.total) };
  });
}
