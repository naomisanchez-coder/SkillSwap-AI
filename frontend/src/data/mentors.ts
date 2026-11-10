import type { SessionDuration } from './creditConfig';

export type MentorOffer = {
  skillId: string;
  topic: string;
  level: string;
  description: string;
  durations: SessionDuration[];
  availability: string;
  costByDuration: Record<SessionDuration, number>;
};

export type Mentor = {
  id: string;
  ownerUserId?: string;
  requestId?: string;
  name: string;
  skill: string;
  level: string;
  rating: number;
  sessions: number;
  availability: string;
  modalities: string[];
  skillValidated: boolean;
  image: string;
  bio: string;
  slots: Record<string, string[]>;
  topics?: string[];
  portfolio?: string;
  active?: boolean;
  isDemo?: boolean;
  offer: MentorOffer;
};
