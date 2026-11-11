import { readFile } from 'node:fs/promises';

// Only careers and cycles from the existing schema; no academic grouping.
export async function readAcademicCatalog() {
  const catalog = JSON.parse(await readFile(new URL('./catalogs/academic-1.0.0.json', import.meta.url), 'utf8'));
  const unique = (values) => new Set(values).size === values.length;
  if (catalog.version !== '1.0.0' || catalog.careers.length !== 14 ||
      JSON.stringify(catalog.cycles) !== '[1,2,3,4,5,6]' ||
      ['id', 'code', 'name'].some((key) => !unique(catalog.careers.map((c) => c[key]))) ||
      catalog.careers.some((c) => !/^[a-z0-9-]{1,50}$/.test(c.code) ||
        !/^[0-9a-f-]{36}$/.test(c.id) || !c.name || [...c.name].length > 150 ||
        Object.keys(c).some((key) => !['id', 'code', 'name'].includes(key)))) throw new Error('Invalid versioned catalog');
  return catalog;
}

// No upsert/overwrite: an existing conflicting identity or name aborts the transaction.
export async function synchronizeAcademicCatalog(database, { apply = false } = {}) {
  const catalog = await readAcademicCatalog();
  return database.transaction(async (tx) => {
    let missingCareers = 0;
    let missingCycles = 0;
    for (const career of catalog.careers) {
      const [rows] = await tx.execute(
        'SELECT id, code, name, is_active FROM careers WHERE id = ? OR code = ? OR name = ? FOR UPDATE',
        [career.id, career.code, career.name]);
      if (rows.length && (rows.length !== 1 || rows[0].id !== career.id || rows[0].code !== career.code ||
          rows[0].name !== career.name || rows[0].is_active !== 1)) throw new Error('Catalog conflict; no existing rows overwritten');
      if (!rows.length) {
        missingCareers++;
        if (apply) await tx.execute('INSERT INTO careers (id, code, name) VALUES (?, ?, ?)', [career.id, career.code, career.name]);
      }
      const [cycles] = await tx.execute('SELECT cycle FROM career_cycles WHERE career_id = ? FOR UPDATE', [career.id]);
      if (cycles.some((row) => !catalog.cycles.includes(row.cycle))) throw new Error('Catalog cycles conflict');
      for (const cycle of catalog.cycles) {
        if (!cycles.some((row) => row.cycle === cycle)) {
          missingCycles++;
          if (apply) await tx.execute('INSERT INTO career_cycles (career_id, cycle) VALUES (?, ?)', [career.id, cycle]);
        }
      }
    }
    return { version: catalog.version, apply, missingCareers, missingCycles };
  });
}
