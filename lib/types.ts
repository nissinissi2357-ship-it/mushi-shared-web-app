export type MemberRole = "member" | "captain" | "admin";

export type Member = {
  id: string;
  displayName: string;
  role: MemberRole;
  pinHint?: string | null;
};

export type ObservationLog = {
  id: string;
  memberId: string;
  observedAt: string;
  location: string;
  species: string;
  points: number;
  scoringMemo: string;
  imageUrl?: string | null;
  guidePdfUrl?: string | null;
};

export type MemberSummary = {
  memberId: string;
  displayName: string;
  role: MemberRole;
  totalPoints: number;
  recordCount: number;
  latestObservedAt: string | null;
};

export type TabId = "home" | "record" | "logs";

export type ObservationInsertInput = {
  observedAt: string;
  location: string;
  species: string;
  points: number;
  scoringMemo: string;
};

export type LoginResult = {
  member: Member;
  logs: ObservationLog[];
  summaries: MemberSummary[];
};

export type InitialViewerState = LoginResult | null;
