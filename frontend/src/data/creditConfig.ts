export const ACADEMIC_CREDIT_CONFIG = {
  version: 3,
  initialVerifiedStudentBalance: 20,
  sessionCosts: {
    30: 5,
    60: 10,
    90: 15,
  },
  reviewCommentMaxLength: 500,
} as const;

export type SessionDuration = keyof typeof ACADEMIC_CREDIT_CONFIG.sessionCosts;

export function academicSessionCost(duration: SessionDuration): number {
  return ACADEMIC_CREDIT_CONFIG.sessionCosts[duration];
}
