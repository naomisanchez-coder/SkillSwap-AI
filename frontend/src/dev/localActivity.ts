import { createLocalBookingStore } from './bookingStore';
import { mockAccountService } from './accountMock';
import { mentors } from './mentorFixtures';
import { composeMentorCatalog } from '../data/catalog';
import { ACADEMIC_CREDIT_CONFIG } from '../data/creditConfig';

export const localIdentity = { id: 'frontend-demo-student', name: 'Alex' };
const openingWallet = () => ({ available: ACADEMIC_CREDIT_CONFIG.initialVerifiedStudentBalance, held: 0, used: 0, earned: 0 });
/** Participantes exclusivos de pruebas; no cambian la identidad de la cuenta abierta. */
export const learnerFixtures = { 'fixture-elena': { name: 'Elena Torres', initialWallet: openingWallet() }, 'fixture-diego': { name: 'Diego Ruiz', initialWallet: openingWallet() } };
export const localActivity = createLocalBookingStore({
  storage: () => localStorage, routeStorage: () => sessionStorage, identity: localIdentity, initialWallet: openingWallet(), participants: learnerFixtures,
  async getApprovedRequests() { return (await mockAccountService.getAccount()).requests; },
  async getMentors(ledger) {
    const account = await mockAccountService.getAccount();
    return composeMentorCatalog(mentors, account, ledger, localIdentity.name);
  },
});
