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
  serverManaged?: boolean;
  category?: string;
  availabilityWindows?: { weekday: number; start: string; end: string }[];
  id: string;
  ownerUserId?: string;
  requestId?: string;
  name: string;
  skill: string;
  level: string;
  rating: number | null;
  sessions: number | null;
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
