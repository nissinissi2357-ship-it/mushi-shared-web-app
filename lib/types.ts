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
  latitude?: number | null;
  longitude?: number | null;
  species: string;
  points: number;
  scoringMemo: string;
  imageUrl?: string | null;
  guidePdfUrl?: string | null;
};

export type ObservationExportLog = ObservationLog & {
  memberDisplayName: string;
};

export type InquiryObservation = {
  id: string;
  observedAt: string;
  location: string;
  species: string;
};

export type PointEntry = {
  id: string;
  memberId: string;
  awardedAt: string;
  title: string;
  description: string;
  points: number;
};

export type MemberSummary = {
  memberId: string;
  displayName: string;
  role: MemberRole;
  totalPoints: number;
  lifetimeTotalPoints: number;
  observationPoints: number;
  extraPoints: number;
  recordCount: number;
  pointEntryCount: number;
  latestObservedAt: string | null;
};

export type TabId = "home" | "record" | "logs" | "inquiry" | "points";

export type ObservationInsertInput = {
  observedAt: string;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  species: string;
  points: number;
  scoringMemo: string;
};

export type ObservationUpdateInput = ObservationInsertInput;

export type PointEntryInput = {
  memberId: string;
  awardedAt: string;
  title: string;
  description: string;
  points: number;
};

export type LoginResult = {
  member: Member;
  logs: ObservationLog[];
  pointEntries: PointEntry[];
  summaries: MemberSummary[];
};

export type InitialViewerState = LoginResult | null;
