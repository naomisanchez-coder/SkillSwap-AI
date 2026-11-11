import { readFile } from 'node:fs/promises';

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...fields].sort().join(',');

export function validateDemoMentors(value) {
  if (!exact(value, ['version', 'scope', 'mentors']) || value.scope !== 'DEMO_ONLY' ||
      typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.version) ||
      !Array.isArray(value.mentors) || value.mentors.length !== 3) throw new Error('Invalid demo mentor manifest');
  const mentors = value.mentors.map(item => {
    if (!exact(item, ['key', 'firstName', 'lastName', 'bio', 'careerCode', 'cycle', 'skillCode',
      'levelCode', 'availability']) || !slug.test(item.key) || !slug.test(item.careerCode) ||
        !slug.test(item.skillCode) || !slug.test(item.levelCode) || !Number.isInteger(item.cycle) ||
        item.cycle < 1 || item.cycle > 12 || typeof item.firstName !== 'string' ||
        typeof item.lastName !== 'string' || typeof item.bio !== 'string' ||
        !item.bio.includes('ficticio') || !Array.isArray(item.availability) || !item.availability.length ||
        item.availability.some(slot => !exact(slot, ['weekday', 'start', 'end']) ||
          !Number.isInteger(slot.weekday) || slot.weekday < 1 || slot.weekday > 7 ||
          !/^\d{2}:\d{2}$/.test(slot.start) || !/^\d{2}:\d{2}$/.test(slot.end) || slot.start >= slot.end)) {
      throw new Error('Invalid demo mentor manifest');
    }
    return Object.freeze({ ...item, availability: Object.freeze(item.availability.map(slot => Object.freeze({ ...slot }))) });
  });
  for (const values of [mentors.map(item => item.key), mentors.map(item => item.skillCode)]) {
    if (new Set(values).size !== mentors.length) throw new Error('Invalid demo mentor manifest');
  }
  return Object.freeze({ version: value.version, scope: value.scope, mentors: Object.freeze(mentors) });
}

export async function readDemoMentors(path = new URL('./catalogs/demo-mentors-1.0.0.json', import.meta.url)) {
  return validateDemoMentors(JSON.parse(await readFile(path, 'utf8')));
}
