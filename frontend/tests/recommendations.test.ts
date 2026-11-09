import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { estimateMentorCompatibility, isEligibleMentor, recommendMentors, RECOMMENDATION_WEIGHTS } from '../src/data/recommendations';
import { intervalsOverlap, parseTime, preferenceIntervals } from '../src/data/scheduling';
import type { Mentor } from '../src/data/mentors';
import { mentors } from '../src/dev/mentorFixtures';
import { studentFixture } from '../src/dev/studentMock';
import StudentDashboardPage from '../src/pages/StudentDashboardPage';

const preferences = { skill: 'Python', level: 'Intermedio', availability: 'Martes · 7:00 PM – 8:00 PM', goals: 'Desarrollar un proyecto' };
const mentor = (slots: Record<string, string[]>): Mentor => ({ ...mentors[0], slots });
const availability = (offer: Mentor, value = preferences) => estimateMentorCompatibility(offer, value).factors.find(factor => factor.key === 'availability')!;

test('regresión: dos intervalos que solo se tocan no se solapan', () => {
  assert.equal(intervalsOverlap(parseTime('7:00 PM'), parseTime('8:00 PM'), parseTime('8:00 PM'), parseTime('9:00 PM')), false);
  assert.equal(intervalsOverlap(120, 180, 60, 120), false);
  const result = estimateMentorCompatibility(mentor({ Martes: ['8:00 PM'] }), preferences);
  assert.deepEqual(result.matchingSlots, []);
  assert.equal(availability(mentor({ Martes: ['8:00 PM'] })).points, 15); // Solo coincide el día, como en el motor original.
  assert.equal(availability(mentor({ Martes: ['7:00 PM'] })).points, 25);
});

test('el rango no incluye su final y respeta día, AM/PM y solapamientos parciales', () => {
  assert.deepEqual(estimateMentorCompatibility(mentor({ Martes: ['7:00 PM', '8:00 PM'] }), preferences).matchingSlots, ['Martes · 7:00 PM']);
  assert.equal(availability(mentor({ Miércoles: ['7:00 PM'] })).points, 0);
  assert.equal(availability(mentor({ Martes: ['7:00 AM'] })).points, 15);
  assert.equal(availability(mentor({ Martes: ['7:30 PM'] })).points, 25);
  assert.equal(availability(mentor({ Martes: ['6:00 PM'] })).points, 15);
  assert.deepEqual(preferenceIntervals('Martes · 8:00 PM – 7:00 PM'), []);
  assert.deepEqual(preferenceIntervals('Martes · 99:99 PM'), []);
  assert.deepEqual(preferenceIntervals('Martes · 7:00 PM'), [{ day: 'Martes', start: 1140, end: 1200 }]);
});

test('mantiene los pesos, la calidad neutral y un máximo de tres resultados con desempate estable', () => {
  assert.deepEqual(RECOMMENDATION_WEIGHTS, { skill: 45, level: 20, availability: 25, quality: 10 });
  const offer = mentor({ Martes: ['7:00 PM'] });
  assert.equal(estimateMentorCompatibility(offer, preferences).total, 95);
  assert.equal(estimateMentorCompatibility(offer, preferences, 5, 2).total, 100);
  const pool = ['z', 'd', 'b', 'a', 'c'].map(id => ({ ...offer, id }));
  assert.deepEqual(recommendMentors({ mentors: pool, preferences, ratings: {} }).map(result => result.mentor.id), ['a', 'b', 'c']);
});

test('excluye ofertas propias, inactivas, sin validar, sin horarios o de otra habilidad', () => {
  const offer = mentor({ Martes: ['7:00 PM'] });
  const pool = [
    { ...offer, id: 'student-mentor-current' }, { ...offer, id: 'inactive', active: false },
    { ...offer, id: 'unverified', skillValidated: false }, { ...offer, id: 'empty', slots: {} },
    { ...offer, id: 'react', skill: 'React' }, { ...offer, id: 'valid' },
  ];
  assert.deepEqual(recommendMentors({ mentors: pool, preferences, ratings: {}, currentUserId: 'current' }).map(result => result.mentor.id), ['valid']);
  assert.deepEqual(recommendMentors({ mentors, preferences: { ...preferences, skill: '' }, ratings: {} }), []);
  assert.equal(isEligibleMentor({ ...offer, offer: { ...offer.offer, skillId: 'marketing' } }), false);
  assert.equal(isEligibleMentor({ ...offer, offer: { ...offer.offer, skillId: 'missing' } }), false);
});

test('el panel distingue preferencias incompletas de catálogo sin coincidencias', () => {
  const state = structuredClone(studentFixture);
  const props = { state, mentors, onExplore() {}, onDiscover() {}, onSessions() {}, onWallet() {}, onMentorRequest() {}, onMentor() {}, onEditPreferences() {} };
  assert.match(renderToStaticMarkup(createElement(StudentDashboardPage, props)), /Completa tus preferencias para recibir recomendaciones/);
  state.profile = { ...state.profile, interests: ['React'], level: 'Intermedio', availability: preferences.availability, goals: 'Desarrollar un proyecto' };
  const html = renderToStaticMarkup(createElement(StudentDashboardPage, props));
  assert.match(html, /No encontramos mentores para tus preferencias/);
  assert.doesNotMatch(html, /Completa tus preferencias para recibir recomendaciones/);
});

test('el resumen usa únicamente sesiones y solicitudes del estudiante actual', () => {
  const state = structuredClone(studentFixture);
  state.profile = { ...state.profile, interests: ['Python'], level: 'Intermedio', availability: preferences.availability, goals: 'Desarrollar un proyecto' };
  state.sessions = [
    { id: 'own', studentId: state.profile.id, mentorId: 'carlos', mentorName: 'Carlos', skill: 'Python', date: '2030-04-09', time: '7:00 PM', duration: 60, status: 'upcoming' },
    { id: 'other', studentId: 'other', mentorId: 'carlos', mentorName: 'Oculto', skill: 'Privado', date: '2029-01-01', time: '1:00 PM', duration: 90, status: 'upcoming' },
  ];
  const html = renderToStaticMarkup(createElement(StudentDashboardPage, { state, mentors: [], onExplore() {}, onDiscover() {}, onSessions() {}, onWallet() {}, onMentorRequest() {}, onMentor() {}, onEditPreferences() {} }));
  assert.match(html, /Python con Carlos/);
  assert.doesNotMatch(html, /Privado|Oculto/);
});
