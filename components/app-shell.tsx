"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import { formatDateTime } from "@/lib/format";
import { resizeImageBeforeUpload } from "@/lib/image";
import { LOCATION_OPTIONS } from "@/lib/locations";
import { parseCaptainMessage } from "@/lib/line-parser";
import type {
  InquiryObservation,
  InitialViewerState,
  LoginResult,
  Member,
  MemberRole,
  MemberSummary,
  ObservationLog,
  PointEntry,
  TabId
} from "@/lib/types";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "home", label: "ホーム" },
  { id: "record", label: "観察登録" },
  { id: "logs", label: "観察ログ" },
  { id: "inquiry", label: "記録照会" },
  { id: "points", label: "追加ポイント" }
];

type AppShellProps = {
  initialMembers: Member[];
  source: "supabase" | "fallback";
  warning: string | null;
  initialViewer: InitialViewerState;
};

type DraftObservation = {
  observedAt: string;
  location: string;
  locationDetail: string;
  latitude: string;
  longitude: string;
  species: string;
  points: string;
  scoringMemo: string;
};

type DraftPointEntry = {
  memberId: string;
  awardedAt: string;
  title: string;
  description: string;
  points: string;
};

type RegisterDraft = {
  displayName: string;
  passcode: string;
};

type AdminCreateDraft = {
  displayName: string;
  passcode: string;
  role: MemberRole;
};

type RankingPeriodOption = {
  value: string;
  label: string;
};

type InquiryLocationRow = {
  location: string;
  monthCounts: number[];
  totalCount: number;
};

type InquiryDetailRow = {
  key: string;
  date: string;
  location: string;
  count: number;
};

function toLocalInputValue(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function toDateInputValue(dateLike: string | Date) {
  const date = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function getDefaultObservationDraft(): DraftObservation {
  return {
    observedAt: toLocalInputValue(),
    location: "",
    locationDetail: "",
    latitude: "",
    longitude: "",
    species: "",
    points: "",
    scoringMemo: ""
  };
}

function getDefaultPointEntryDraft(memberId = ""): DraftPointEntry {
  return {
    memberId,
    awardedAt: toLocalInputValue(),
    title: "",
    description: "",
    points: ""
  };
}

function buildRoleDrafts(members: Member[]) {
  return Object.fromEntries(members.map((member) => [member.id, member.role])) as Record<string, MemberRole>;
}

const defaultParseStatus =
  "隊長メッセージを貼ると、日時・場所・種名・ポイントを自動で読み取ります。";

export function AppShell({ initialMembers, source, warning, initialViewer }: AppShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [selectedMemberId, setSelectedMemberId] = useState(initialViewer?.member.id ?? initialMembers[0]?.id ?? "");
  const [loginPasscode, setLoginPasscode] = useState("");
  const [currentMember, setCurrentMember] = useState<Member | null>(initialViewer?.member ?? null);
  const [logs, setLogs] = useState<ObservationLog[]>(initialViewer?.logs ?? []);
  const [pointEntries, setPointEntries] = useState<PointEntry[]>(initialViewer?.pointEntries ?? []);
  const [summaries, setSummaries] = useState<MemberSummary[]>(initialViewer?.summaries ?? []);
  const [draftPhotoMessage, setDraftPhotoMessage] = useState(
    "写真は長辺1600px、JPEG品質0.75を目安に自動で軽くします。"
  );
  const [draft, setDraft] = useState<DraftObservation>(getDefaultObservationDraft);
  const [pointDraft, setPointDraft] = useState<DraftPointEntry>(
    getDefaultPointEntryDraft(initialViewer?.member.id ?? initialMembers[0]?.id ?? "")
  );
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingLogDraft, setEditingLogDraft] = useState<DraftObservation>(getDefaultObservationDraft);
  const [editingPointEntryId, setEditingPointEntryId] = useState<string | null>(null);
  const [linePaste, setLinePaste] = useState("");
  const [parseStatus, setParseStatus] = useState(defaultParseStatus);
  const [registerDraft, setRegisterDraft] = useState<RegisterDraft>({ displayName: "", passcode: "" });
  const [accountDisplayName, setAccountDisplayName] = useState(initialViewer?.member.displayName ?? "");
  const [accountPasscode, setAccountPasscode] = useState("");
  const [adminCreateDraft, setAdminCreateDraft] = useState<AdminCreateDraft>({
    displayName: "",
    passcode: "",
    role: "member"
  });
  const [adminRoleDrafts, setAdminRoleDrafts] = useState<Record<string, MemberRole>>(buildRoleDrafts(initialMembers));
  const [statusMessage, setStatusMessage] = useState<string | null>(warning);
  const [isSaving, setIsSaving] = useState(false);
  const [isPointSaving, setIsPointSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isAccountSaving, setIsAccountSaving] = useState(false);
  const [isAdminSaving, setIsAdminSaving] = useState(false);
  const [logMemberFilterId, setLogMemberFilterId] = useState<string | null>(null);
  const [pointMemberFilterId, setPointMemberFilterId] = useState<string | null>(null);
  const [isAuthPanelOpen, setIsAuthPanelOpen] = useState(false);
  const [isRegisterPanelOpen, setIsRegisterPanelOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [isLogSearchOpen, setIsLogSearchOpen] = useState(false);
  const [isLogDataMenuOpen, setIsLogDataMenuOpen] = useState(false);
  const [isInquirySearchOpen, setIsInquirySearchOpen] = useState(false);
  const [loginWarningMessage, setLoginWarningMessage] = useState<string | null>(null);
  const [logSearchMode, setLogSearchMode] = useState<"and" | "or">("and");
  const [logSearchSpecies, setLogSearchSpecies] = useState("");
  const [logSearchLocation, setLogSearchLocation] = useState("");
  const [logSearchDate, setLogSearchDate] = useState("");
  const [inquirySearchMode, setInquirySearchMode] = useState<"and" | "or">("and");
  const [inquirySearchSpecies, setInquirySearchSpecies] = useState("");
  const [inquirySearchLocation, setInquirySearchLocation] = useState("");
  const [inquirySearchDate, setInquirySearchDate] = useState("");
  const [inquiryLogs, setInquiryLogs] = useState<InquiryObservation[]>([]);
  const [isInquiryLoading, setIsInquiryLoading] = useState(false);
  const [selectedInquirySpecies, setSelectedInquirySpecies] = useState("");
  const [selectedInquiryYear, setSelectedInquiryYear] = useState("");
  const [inquirySpeciesPage, setInquirySpeciesPage] = useState(1);
  const [highlightedLogId, setHighlightedLogId] = useState<string | null>(null);
  const [openRecordMenuKey, setOpenRecordMenuKey] = useState<string | null>(null);
  const [logsPage, setLogsPage] = useState(1);
  const [rankingPeriod, setRankingPeriod] = useState(() => `month:${toMonthKey(new Date())}`);
  const csvImportInputRef = useRef<HTMLInputElement | null>(null);

  const selectedMember = members.find((member) => member.id === selectedMemberId);
  const currentSummary = summaries.find((summary) => summary.memberId === currentMember?.id) ?? null;
  const canViewRanking = currentMember?.role === "captain" || currentMember?.role === "admin";
  const isAdmin = currentMember?.role === "admin";
  const currentYear = new Date().getFullYear();

  const hasLogSearch = Boolean(logSearchSpecies.trim() || logSearchLocation.trim() || logSearchDate);

  const filteredLogs = useMemo(() => {
    const scopedLogs =
      canViewRanking && logMemberFilterId ? logs.filter((log) => log.memberId === logMemberFilterId) : logs;

    const speciesQuery = logSearchSpecies.trim().toLocaleLowerCase("ja-JP");
    const locationQuery = logSearchLocation.trim().toLocaleLowerCase("ja-JP");
    const activeChecks = [
      speciesQuery
        ? (log: ObservationLog) => log.species.toLocaleLowerCase("ja-JP").includes(speciesQuery)
        : null,
      locationQuery
        ? (log: ObservationLog) =>
            formatObservationLocation(log.location, log.locationDetail).toLocaleLowerCase("ja-JP").includes(locationQuery)
        : null,
      logSearchDate ? (log: ObservationLog) => toDateInputValue(log.observedAt) === logSearchDate : null
    ].filter(Boolean) as Array<(log: ObservationLog) => boolean>;

    if (activeChecks.length === 0) {
      return scopedLogs;
    }

    return scopedLogs.filter((log) =>
      logSearchMode === "and" ? activeChecks.every((check) => check(log)) : activeChecks.some((check) => check(log))
    );
  }, [canViewRanking, logMemberFilterId, logs, logSearchDate, logSearchLocation, logSearchMode, logSearchSpecies]);

  const filteredLogMemberName =
    canViewRanking && logMemberFilterId
      ? members.find((member) => member.id === logMemberFilterId)?.displayName || null
      : null;

  const logPageSize = 10;
  const totalLogPages = Math.max(1, Math.ceil(filteredLogs.length / logPageSize));
  const paginatedLogs = filteredLogs.slice((logsPage - 1) * logPageSize, logsPage * logPageSize);

  const filteredPointEntries = useMemo(() => {
    if (!canViewRanking || !pointMemberFilterId) {
      return pointEntries;
    }

    return pointEntries.filter((entry) => entry.memberId === pointMemberFilterId);
  }, [canViewRanking, pointEntries, pointMemberFilterId]);

  const filteredPointMemberName =
    canViewRanking && pointMemberFilterId
      ? members.find((member) => member.id === pointMemberFilterId)?.displayName || null
      : null;
  const hasInquirySearch = Boolean(inquirySearchSpecies.trim() || inquirySearchLocation.trim() || inquirySearchDate);

  const filteredInquiryLogs = useMemo(() => {
    const speciesQuery = inquirySearchSpecies.trim().toLocaleLowerCase("ja-JP");
    const locationQuery = inquirySearchLocation.trim().toLocaleLowerCase("ja-JP");
    const activeChecks = [
      speciesQuery
        ? (log: InquiryObservation) => log.species.toLocaleLowerCase("ja-JP").includes(speciesQuery)
        : null,
      locationQuery
        ? (log: InquiryObservation) =>
            formatObservationLocation(log.location, log.locationDetail).toLocaleLowerCase("ja-JP").includes(locationQuery)
        : null,
      inquirySearchDate ? (log: InquiryObservation) => toDateInputValue(log.observedAt) === inquirySearchDate : null
    ].filter(Boolean) as Array<(log: InquiryObservation) => boolean>;

    if (activeChecks.length === 0) {
      return inquiryLogs;
    }

    return inquiryLogs.filter((log) =>
      inquirySearchMode === "and" ? activeChecks.every((check) => check(log)) : activeChecks.some((check) => check(log))
    );
  }, [inquiryLogs, inquirySearchDate, inquirySearchLocation, inquirySearchMode, inquirySearchSpecies]);

  const inquirySpeciesList = useMemo(
    () =>
      [...new Set(filteredInquiryLogs.map((log) => log.species))]
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, "ja-JP")),
    [filteredInquiryLogs]
  );

  const inquirySpeciesPageSize = 10;
  const totalInquirySpeciesPages = Math.max(1, Math.ceil(inquirySpeciesList.length / inquirySpeciesPageSize));
  const paginatedInquirySpecies = inquirySpeciesList.slice(
    (inquirySpeciesPage - 1) * inquirySpeciesPageSize,
    inquirySpeciesPage * inquirySpeciesPageSize
  );

  const selectedInquirySpeciesLogs = useMemo(
    () => filteredInquiryLogs.filter((log) => log.species === selectedInquirySpecies),
    [filteredInquiryLogs, selectedInquirySpecies]
  );

  const inquiryYearOptions = useMemo(
    () =>
      [...new Set(selectedInquirySpeciesLogs.map((log) => String(new Date(log.observedAt).getFullYear())))]
        .filter(Boolean)
        .sort((left, right) => right.localeCompare(left)),
    [selectedInquirySpeciesLogs]
  );

  const selectedInquiryYearLogs = useMemo(
    () =>
      selectedInquirySpeciesLogs.filter(
        (log) => String(new Date(log.observedAt).getFullYear()) === selectedInquiryYear
      ),
    [selectedInquirySpeciesLogs, selectedInquiryYear]
  );

  const inquiryLocationRows = useMemo(
    () => buildInquiryLocationRows(selectedInquiryYearLogs),
    [selectedInquiryYearLogs]
  );

  const inquiryDetailRows = useMemo(
    () => buildInquiryDetailRows(selectedInquiryYearLogs),
    [selectedInquiryYearLogs]
  );
  const summaryYear = new Date().getFullYear();

  const monthlyPointSeries = useMemo(() => {
    if (!currentMember) {
      return [];
    }

    return buildMonthlyPointSeries(logs, pointEntries, currentMember.id);
  }, [currentMember, logs, pointEntries]);

  const rankingPeriodOptions = useMemo(
    () => buildRankingPeriodOptions(logs, pointEntries, currentYear),
    [currentYear, logs, pointEntries]
  );

  const rankingSummaries = useMemo(
    () => buildRankingSummaries(members, logs, pointEntries, rankingPeriod),
    [logs, members, pointEntries, rankingPeriod]
  );

  const selectedRankingPeriodLabel =
    rankingPeriodOptions.find((option) => option.value === rankingPeriod)?.label ?? "今月ランキング";

  useEffect(() => {
    if (currentMember && !editingPointEntryId) {
      setPointDraft((current) => ({
        ...current,
        memberId: current.memberId || currentMember.id
      }));
    }
  }, [currentMember, editingPointEntryId]);

  useEffect(() => {
    setLogsPage(1);
  }, [logMemberFilterId, logSearchDate, logSearchLocation, logSearchMode, logSearchSpecies, activeTab]);

  useEffect(() => {
    setLogsPage((current) => Math.min(current, totalLogPages));
  }, [totalLogPages]);

  useEffect(() => {
    if (!rankingPeriodOptions.some((option) => option.value === rankingPeriod)) {
      setRankingPeriod(rankingPeriodOptions[0]?.value ?? `month:${toMonthKey(new Date())}`);
    }
  }, [rankingPeriod, rankingPeriodOptions]);

  useEffect(() => {
    setSelectedInquirySpecies((current) => (current && inquirySpeciesList.includes(current) ? current : ""));
  }, [inquirySpeciesList]);

  useEffect(() => {
    setSelectedInquiryYear((current) =>
      current && inquiryYearOptions.includes(current) ? current : (inquiryYearOptions[0] ?? "")
    );
  }, [inquiryYearOptions]);

  useEffect(() => {
    setInquirySpeciesPage(1);
  }, [inquirySearchDate, inquirySearchLocation, inquirySearchMode, inquirySearchSpecies]);

  useEffect(() => {
    setInquirySpeciesPage((current) => Math.min(current, totalInquirySpeciesPages));
  }, [totalInquirySpeciesPages]);

  useEffect(() => {
    if (!currentMember) {
      setInquiryLogs([]);
      return;
    }

    if (activeTab !== "inquiry") {
      return;
    }

    let cancelled = false;
    setIsInquiryLoading(true);

    refreshInquiryLogs()
      .catch((error) => {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : "記録照会データの取得に失敗しました。");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsInquiryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, currentMember]);

  function applyMembers(nextMembers: Member[]) {
    setMembers(nextMembers);
    setAdminRoleDrafts(buildRoleDrafts(nextMembers));
    setSelectedMemberId((current) =>
      nextMembers.some((member) => member.id === current) ? current : (nextMembers[0]?.id ?? "")
    );
    setLogMemberFilterId((current) =>
      current && nextMembers.some((member) => member.id === current) ? current : null
    );
    setPointMemberFilterId((current) =>
      current && nextMembers.some((member) => member.id === current) ? current : null
    );
  }

  function applyViewerPayload(payload: LoginResult) {
    setCurrentMember(payload.member);
    setSelectedMemberId(payload.member.id);
    setLogs(payload.logs);
    setPointEntries(payload.pointEntries);
    setSummaries(payload.summaries);
    setAccountDisplayName(payload.member.displayName);
    setAccountPasscode("");
    setPointDraft((current) => ({
      ...current,
      memberId:
        canViewRanking && pointMemberFilterId ? pointMemberFilterId : current.memberId || payload.member.id
    }));

    if (!(payload.member.role === "captain" || payload.member.role === "admin")) {
      setLogMemberFilterId(null);
      setPointMemberFilterId(null);
    }
  }

  async function refreshMembers() {
    const response = await fetch("/api/members", {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      }
    });

    const payload = (await response.json()) as { members?: Member[]; error?: string };
    if (!response.ok || !payload.members) {
      throw new Error(payload.error || "隊員一覧の取得に失敗しました。");
    }

    applyMembers(payload.members);
    return payload.members;
  }

  async function refreshViewerState() {
    const response = await fetch("/api/viewer", {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      }
    });

    const payload = (await response.json()) as LoginResult | { error?: string };
    if (!response.ok || !("member" in payload)) {
      throw new Error("error" in payload ? payload.error : "最新データの取得に失敗しました。");
    }

    applyViewerPayload(payload);
    return payload;
  }

  async function refreshInquiryLogs() {
    const response = await fetch("/api/inquiry", {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      }
    });

    const payload = (await response.json()) as { logs?: InquiryObservation[]; error?: string };
    if (!response.ok || !payload.logs) {
      throw new Error(payload.error || "記録照会データの取得に失敗しました。");
    }

    setInquiryLogs(payload.logs);
    return payload.logs;
  }

  async function refreshEverything() {
    await Promise.all([refreshMembers(), refreshViewerState()]);
  }

  function revealSavedLog(payload: LoginResult, log: ObservationLog) {
    setIsLogSearchOpen(false);
    setLogSearchMode("and");
    setLogSearchSpecies("");
    setLogSearchLocation("");
    setLogSearchDate("");
    setHighlightedLogId(log.id);

    const shouldFilterToMember = payload.member.role === "captain" || payload.member.role === "admin";
    const targetLogs = shouldFilterToMember
      ? payload.logs.filter((entry) => entry.memberId === log.memberId)
      : payload.logs;

    if (shouldFilterToMember) {
      setLogMemberFilterId(log.memberId);
    }

    const logIndex = targetLogs.findIndex((entry) => entry.id === log.id);
    const nextPage = logIndex >= 0 ? Math.floor(logIndex / logPageSize) + 1 : 1;
    setLogsPage(nextPage);
    setActiveTab("logs");
  }

  async function handleExportLogs() {
    if (!currentMember) {
      setStatusMessage("先にログインしてください。");
      return;
    }

    setIsExporting(true);
    setStatusMessage(null);

    try {
      const params = new URLSearchParams();
      if (canViewRanking && logMemberFilterId) {
        params.set("memberId", logMemberFilterId);
      }

      const response = await fetch(`/api/observations/export${params.size ? `?${params.toString()}` : ""}`, {
        method: "GET"
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "CSV出力に失敗しました。");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") || "";
      const fileNameMatch = contentDisposition.match(/filename="?(?<name>[^"]+)"?/);
      const fileName = decodeURIComponent(fileNameMatch?.groups?.name || "mushi-observations.csv");
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);

      setStatusMessage("観察ログをCSVで出力しました。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "CSV出力に失敗しました。");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleImportLogs(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsImporting(true);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (canViewRanking && logMemberFilterId) {
        formData.append("memberId", logMemberFilterId);
      }

      const response = await fetch("/api/observations/import", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as { importedCount?: number; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "CSV取り込みに失敗しました。");
      }

      await refreshViewerState();
      setStatusMessage(`${payload.importedCount ?? 0}件の観察ログをCSVから取り込みました。`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "CSV取り込みに失敗しました。");
    } finally {
      event.target.value = "";
      setIsImporting(false);
    }
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setDraftPhotoMessage("写真は長辺1600px、JPEG品質0.75を目安に自動で軽くします。");
      return;
    }

    const resized = await resizeImageBeforeUpload(file);
    const beforeKb = Math.round(file.size / 1024);
    const afterKb = Math.round(resized.size / 1024);
    setDraftPhotoMessage(`${file.name} を軽量化しました: ${beforeKb}KB → ${afterKb}KB`);
  }

  function applyParsedToDraft(rawText: string) {
    const parsed = parseCaptainMessage(rawText);

    setDraft((current) => ({
      observedAt: parsed.observedAt || current.observedAt,
      location: parsed.location || current.location,
      locationDetail: current.locationDetail,
      latitude: current.latitude,
      longitude: current.longitude,
      species: parsed.species || current.species,
      points: parsed.points !== null ? String(parsed.points) : current.points,
      scoringMemo: parsed.scoringMemo || current.scoringMemo
    }));

    const found = [
      parsed.species ? `種名: ${parsed.species}` : "",
      parsed.points !== null ? `ポイント: ${parsed.points}P` : "",
      parsed.location ? `観察地域: ${parsed.location}` : "",
      parsed.observedAt ? `日時: ${parsed.observedAt}` : ""
    ].filter(Boolean);

    setParseStatus(found.length === 0 ? "読み取れた項目がありませんでした。" : `自動入力しました。${found.join(" / ")}`);
    return parsed;
  }

  async function handleLogin() {
    if (!selectedMember) {
      setStatusMessage("先に隊員を選んでください。");
      return;
    }

    setIsLoggingIn(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          displayName: selectedMember.displayName,
          passcode: loginPasscode
        })
      });

      const payload = (await response.json()) as LoginResult | { error?: string };
      if (!response.ok || !("member" in payload)) {
        throw new Error("error" in payload ? payload.error : "ログインに失敗しました。");
      }

      await refreshEverything();
      setLoginPasscode("");
      setIsAuthPanelOpen(false);
      setLoginWarningMessage(null);
      setStatusMessage(`${payload.member.displayName} さんでログインしました。`);
      setActiveTab("home");
    } catch (error) {
      const message = error instanceof Error ? error.message : "ログインに失敗しました。";
      setStatusMessage(message);
      if (message.includes("合言葉が違います")) {
        setLoginWarningMessage("合言葉が違います。もう一度確認してください。");
      }
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setCurrentMember(null);
      setLogs([]);
      setPointEntries([]);
      setInquiryLogs([]);
      setSummaries([]);
      setLogMemberFilterId(null);
      setPointMemberFilterId(null);
      setLoginPasscode("");
      setAccountDisplayName("");
      setAccountPasscode("");
      setIsAuthPanelOpen(false);
      setIsAccountSettingsOpen(false);
      setEditingLogId(null);
      setEditingPointEntryId(null);
      setStatusMessage("ログアウトしました。");
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsRegistering(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(registerDraft)
      });

      const payload = (await response.json()) as { member?: Member; error?: string };
      if (!response.ok || !payload.member) {
        throw new Error(payload.error || "隊員登録に失敗しました。");
      }

      await refreshMembers();
      setSelectedMemberId(payload.member.id);
      setRegisterDraft({ displayName: "", passcode: "" });
      setIsRegisterPanelOpen(false);
      setStatusMessage(`${payload.member.displayName} さんを追加しました。続けてログインできます。`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "隊員登録に失敗しました。");
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleAccountUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentMember) {
      return;
    }

    setIsAccountSaving(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          displayName: accountDisplayName,
          passcode: accountPasscode
        })
      });

      const payload = (await response.json()) as { member?: Member; error?: string };
      if (!response.ok || !payload.member) {
        throw new Error(payload.error || "アカウント更新に失敗しました。");
      }

      await refreshEverything();
      setStatusMessage("アカウント名と合言葉を更新しました。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "アカウント更新に失敗しました。");
    } finally {
      setIsAccountSaving(false);
    }
  }

  async function handleAdminCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAdminSaving(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/admin/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(adminCreateDraft)
      });

      const payload = (await response.json()) as { member?: Member; error?: string };
      if (!response.ok || !payload.member) {
        throw new Error(payload.error || "Admin操作に失敗しました。");
      }

      await refreshEverything();
      setAdminCreateDraft({ displayName: "", passcode: "", role: "member" });
      setStatusMessage(`${payload.member.displayName} さんを追加しました。`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Admin操作に失敗しました。");
    } finally {
      setIsAdminSaving(false);
    }
  }

  async function handleAdminRoleUpdate(memberId: string) {
    setIsAdminSaving(true);
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/admin/members/${memberId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "update-role",
          role: adminRoleDrafts[memberId]
        })
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "権限更新に失敗しました。");
      }

      await refreshEverything();
      setStatusMessage("権限を更新しました。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "権限更新に失敗しました。");
    } finally {
      setIsAdminSaving(false);
    }
  }

  async function handleAdminResetPasscode(memberId: string) {
    setIsAdminSaving(true);
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/admin/members/${memberId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "reset-passcode"
        })
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "合言葉のリセットに失敗しました。");
      }

      await refreshEverything();
      setStatusMessage("合言葉を 0000 にリセットしました。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "合言葉のリセットに失敗しました。");
    } finally {
      setIsAdminSaving(false);
    }
  }

  async function handleAdminDelete(memberId: string, displayName: string) {
    const confirmed = window.confirm(`${displayName} さんのアカウントを削除しますか？`);
    if (!confirmed) {
      return;
    }

    setIsAdminSaving(true);
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/admin/members/${memberId}`, {
        method: "DELETE"
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "削除に失敗しました。");
      }

      await refreshEverything();
      setStatusMessage("アカウントを削除しました。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "削除に失敗しました。");
    } finally {
      setIsAdminSaving(false);
    }
  }

  async function saveObservation(nextDraft: DraftObservation) {
    const response = await fetch("/api/observations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        observedAt: new Date(nextDraft.observedAt).toISOString(),
        location: nextDraft.location,
        locationDetail: nextDraft.locationDetail,
        latitude: nextDraft.latitude ? Number(nextDraft.latitude) : null,
        longitude: nextDraft.longitude ? Number(nextDraft.longitude) : null,
        species: nextDraft.species,
        points: Number(nextDraft.points),
        scoringMemo: nextDraft.scoringMemo
      })
    });

    const payload = (await response.json()) as { log?: ObservationLog; error?: string };
    if (!response.ok || !payload.log) {
      throw new Error(payload.error || "観察ログの保存に失敗しました。");
    }

    const viewer = await refreshViewerState();
    setDraft(getDefaultObservationDraft());
    setLinePaste("");
    setParseStatus(defaultParseStatus);
    setStatusMessage("観察ログを保存しました。");
    revealSavedLog(viewer, payload.log);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentMember) {
      setStatusMessage("先にログインしてください。");
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      await saveObservation(draft);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "観察ログの保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleQuickRegister() {
    if (!currentMember) {
      setStatusMessage("先にログインしてください。");
      return;
    }

    const rawText = linePaste.trim();
    if (!rawText) {
      setParseStatus("まずは隊長メッセージを貼り付けてください。");
      return;
    }

    const parsed = applyParsedToDraft(rawText);
    const nextDraft: DraftObservation = {
      observedAt: parsed.observedAt || draft.observedAt,
      location: parsed.location || draft.location,
      locationDetail: draft.locationDetail,
      latitude: draft.latitude,
      longitude: draft.longitude,
      species: parsed.species || draft.species,
      points: parsed.points !== null ? String(parsed.points) : draft.points,
      scoringMemo: parsed.scoringMemo || draft.scoringMemo
    };

    const missing = [
      !nextDraft.species ? "種名" : "",
      !nextDraft.location ? "観察地域" : "",
      !nextDraft.points ? "ポイント" : ""
    ].filter(Boolean);

    if (missing.length > 0) {
      setParseStatus(`まだ ${missing.join("・")} が足りません。必要ならそのまま手入力してください。`);
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      await saveObservation(nextDraft);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "観察ログの保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  function startEditingLog(log: ObservationLog) {
    setOpenRecordMenuKey(null);
    setEditingLogId(log.id);
    setEditingLogDraft({
      observedAt: toLocalInputValue(new Date(log.observedAt)),
      location: log.location,
      locationDetail: log.locationDetail || "",
      latitude: log.latitude === null || log.latitude === undefined ? "" : String(log.latitude),
      longitude: log.longitude === null || log.longitude === undefined ? "" : String(log.longitude),
      species: log.species,
      points: String(log.points),
      scoringMemo: log.scoringMemo
    });
  }

  async function handleUpdateLog(logId: string) {
    setIsSaving(true);
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/observations/${logId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
          body: JSON.stringify({
            observedAt: new Date(editingLogDraft.observedAt).toISOString(),
            location: editingLogDraft.location,
            locationDetail: editingLogDraft.locationDetail,
            latitude: editingLogDraft.latitude ? Number(editingLogDraft.latitude) : null,
            longitude: editingLogDraft.longitude ? Number(editingLogDraft.longitude) : null,
            species: editingLogDraft.species,
            points: Number(editingLogDraft.points),
            scoringMemo: editingLogDraft.scoringMemo
        })
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "観察ログの更新に失敗しました。");
      }

      await refreshViewerState();
      setEditingLogId(null);
      setStatusMessage("観察ログを更新しました。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "観察ログの更新に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteLog(log: ObservationLog) {
    setOpenRecordMenuKey(null);
    const confirmed = window.confirm(`${log.species} の観察ログを削除しますか？`);
    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/observations/${log.id}`, {
        method: "DELETE"
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "観察ログの削除に失敗しました。");
      }

      await refreshViewerState();
      setEditingLogId(null);
      setStatusMessage("観察ログを削除しました。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "観察ログの削除に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  function startEditingPointEntry(entry: PointEntry) {
    setOpenRecordMenuKey(null);
    setEditingPointEntryId(entry.id);
    setPointDraft({
      memberId: entry.memberId,
      awardedAt: toLocalInputValue(new Date(entry.awardedAt)),
      title: entry.title,
      description: entry.description,
      points: String(entry.points)
    });
    setActiveTab("points");
  }

  function resetPointDraft() {
    setEditingPointEntryId(null);
    setPointDraft(getDefaultPointEntryDraft(currentMember?.id ?? members[0]?.id ?? ""));
  }

  async function handlePointSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentMember) {
      setStatusMessage("先にログインしてください。");
      return;
    }

    setIsPointSaving(true);
    setStatusMessage(null);

    try {
      const response = await fetch(
        editingPointEntryId ? `/api/point-entries/${editingPointEntryId}` : "/api/point-entries",
        {
          method: editingPointEntryId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            memberId: pointDraft.memberId || currentMember.id,
            awardedAt: new Date(pointDraft.awardedAt).toISOString(),
            title: pointDraft.title,
            description: pointDraft.description,
            points: Number(pointDraft.points)
          })
        }
      );

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "追加ポイントの保存に失敗しました。");
      }

      await refreshViewerState();
      setStatusMessage(editingPointEntryId ? "追加ポイントを更新しました。" : "追加ポイントを保存しました。");
      resetPointDraft();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "追加ポイントの保存に失敗しました。");
    } finally {
      setIsPointSaving(false);
    }
  }

  async function handleDeletePointEntry(entry: PointEntry) {
    setOpenRecordMenuKey(null);
    const confirmed = window.confirm(`${entry.title} を削除しますか？`);
    if (!confirmed) {
      return;
    }

    setIsPointSaving(true);
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/point-entries/${entry.id}`, {
        method: "DELETE"
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "追加ポイントの削除に失敗しました。");
      }

      await refreshViewerState();
      if (editingPointEntryId === entry.id) {
        resetPointDraft();
      }
      setStatusMessage("追加ポイントを削除しました。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "追加ポイントの削除に失敗しました。");
    } finally {
      setIsPointSaving(false);
    }
  }

  function canManageMemberData(memberId: string) {
    if (!currentMember) {
      return false;
    }

    return currentMember.role === "captain" || currentMember.role === "admin" || currentMember.id === memberId;
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-top">
          <div>
            <p className="eyebrow">Shared Edition</p>
            <h1>ムシムシ探検隊</h1>
          </div>

          <div className="hero-menu">
            {currentMember ? <p className="hero-member">{currentMember.displayName}</p> : null}
            {currentMember ? (
              <button
                type="button"
                className="menu-button"
                aria-label={`${currentMember.displayName} のアカウントメニュー`}
                onClick={() => setIsAuthPanelOpen(true)}
              >
                ...
              </button>
            ) : (
              <button type="button" className="secondary-button" onClick={() => setIsAuthPanelOpen(true)}>
                ログイン
              </button>
            )}
          </div>
        </div>

        {statusMessage ? <p className="helper-text">{statusMessage}</p> : null}

        {currentMember && currentSummary ? (
          <div className="hero-stats">
            <StatCard label="合計ポイント" value={`${currentSummary.totalPoints}P`} />
            <StatCard label="観察ポイント" value={`${currentSummary.observationPoints}P`} />
            <StatCard label="追加ポイント" value={`${currentSummary.extraPoints}P`} />
            <StatCard label="観察件数" value={`${currentSummary.recordCount}件`} />
          </div>
        ) : null}
      </header>

      {loginWarningMessage ? (
        <div className="alert-overlay" onClick={() => setLoginWarningMessage(null)}>
          <section className="alert-panel" onClick={(event) => event.stopPropagation()}>
            <p className="section-label">Warning</p>
            <h2>ログインできません</h2>
            <p>{loginWarningMessage}</p>
            <div className="inline-actions">
              <button type="button" className="primary-button" onClick={() => setLoginWarningMessage(null)}>
                閉じる
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {selectedInquirySpecies ? (
        <div className="alert-overlay" onClick={() => setSelectedInquirySpecies("")}>
          <section className="alert-panel inquiry-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="inquiry-panel-head">
              <div>
                <p className="section-label">Profile</p>
                <h2>{selectedInquirySpecies}</h2>
              </div>

              <div className="inline-actions">
                <label className="inquiry-year-field">
                  表示する年
                  <select value={selectedInquiryYear} onChange={(event) => setSelectedInquiryYear(event.target.value)}>
                    {inquiryYearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}年
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="ghost-button" onClick={() => setSelectedInquirySpecies("")}>
                  閉じる
                </button>
              </div>
            </div>

            {selectedInquiryYear ? (
              <p className="helper-text">{selectedInquiryYear}年の記録は {selectedInquiryYearLogs.length}件です。</p>
            ) : null}

            <div className="table-scroll inquiry-calendar-scroll">
              <table className="inquiry-calendar">
                <thead>
                  <tr>
                    <th>地域</th>
                    {Array.from({ length: 12 }, (_, index) => (
                      <th key={index + 1}>{index + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inquiryLocationRows.map((row) => (
                    <tr key={row.location}>
                      <th>{row.location}</th>
                      {row.monthCounts.map((count, index) => (
                        <td
                          key={`${row.location}-${index + 1}`}
                          className={count > 0 ? "inquiry-month-cell inquiry-month-cell-active" : "inquiry-month-cell"}
                        >
                          {count > 0 ? count : ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <section className="inquiry-detail-block">
              <div className="inquiry-panel-head">
                <div>
                  <p className="section-label">Details</p>
                  <h4>詳細記録</h4>
                </div>
                <p className="helper-text">同じ日付・同じ場所の記録は件数でまとめています。</p>
              </div>

              {inquiryDetailRows.length === 0 ? (
                <p className="helper-text">この年の記録はありません。</p>
              ) : (
                <div className="table-scroll">
                  <table className="inquiry-table inquiry-detail-table">
                    <thead>
                      <tr>
                        <th>日付</th>
                        <th>場所</th>
                        <th>件数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inquiryDetailRows.map((row) => (
                        <tr key={row.key}>
                          <td>{row.date}</td>
                          <td>{row.location}</td>
                          <td>{row.count}件</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </section>
        </div>
      ) : null}

      {isAuthPanelOpen ? (
        <div className="auth-overlay" onClick={() => setIsAuthPanelOpen(false)}>
          <section className="session-panel auth-panel" onClick={(event) => event.stopPropagation()}>
            <div className="auth-panel-head">
              <div>
                <p className="section-label">Account</p>
                <h2>{currentMember ? "アカウント設定" : "ログイン"}</h2>
              </div>
              <div className="auth-panel-actions">
                {currentMember ? (
                  <button type="button" className="ghost-button" onClick={handleLogout}>
                    ログアウト
                  </button>
                ) : null}
                <button type="button" className="ghost-button" onClick={() => setIsAuthPanelOpen(false)}>
                  閉じる
                </button>
              </div>
            </div>

            <section className="auth-section">
              <p className="section-label">Login</p>
              <div className="session-grid">
                <label>
                  ログインする隊員
                  <select
                    value={selectedMemberId}
                    onChange={(event) => setSelectedMemberId(event.target.value)}
                    disabled={members.length === 0}
                  >
                    {members.length === 0 ? <option value="">隊員がまだいません</option> : null}
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName} ({member.role === "captain" ? "隊長" : member.role === "admin" ? "Admin" : "隊員"})
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  合言葉
                  <input
                    type="password"
                    placeholder="4文字以上"
                    value={loginPasscode}
                    onChange={(event) => setLoginPasscode(event.target.value)}
                  />
                </label>

                <div className="session-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleLogin}
                    disabled={isLoggingIn || !selectedMember}
                  >
                    {isLoggingIn ? "ログイン中..." : "ログイン"}
                  </button>
                </div>
              </div>
            </section>

            {!currentMember ? (
              <section className="auth-section">
                <p className="section-label">Join</p>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setIsRegisterPanelOpen((current) => !current)}
                  >
                    {isRegisterPanelOpen ? "新規作成を閉じる" : "新しいアカウントを作成する"}
                  </button>
                </div>

                {isRegisterPanelOpen ? (
                  <form className="registration-box" onSubmit={handleRegister}>
                    <label>
                      新しい隊員名
                      <input
                        type="text"
                        placeholder="例: たろう"
                        value={registerDraft.displayName}
                        onChange={(event) =>
                          setRegisterDraft((current) => ({ ...current, displayName: event.target.value }))
                        }
                      />
                    </label>

                    <label>
                      合言葉
                      <input
                        type="password"
                        placeholder="4文字以上"
                        value={registerDraft.passcode}
                        onChange={(event) =>
                          setRegisterDraft((current) => ({ ...current, passcode: event.target.value }))
                        }
                      />
                    </label>

                    <div className="session-actions">
                      <button type="submit" className="secondary-button" disabled={isRegistering}>
                        {isRegistering ? "登録中..." : "隊員を追加"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </section>
            ) : null}

            {currentMember ? (
              <section className="auth-section">
                <p className="section-label">My Account</p>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setIsAccountSettingsOpen((current) => !current)}
                  >
                    {isAccountSettingsOpen ? "アカウント設定を閉じる" : "アカウント設定"}
                  </button>
                </div>

                {isAccountSettingsOpen ? (
                  <form className="account-form" onSubmit={handleAccountUpdate}>
                    <label>
                      アカウント名
                      <input
                        type="text"
                        value={accountDisplayName}
                        onChange={(event) => setAccountDisplayName(event.target.value)}
                      />
                    </label>

                    <label>
                      新しい合言葉
                      <input
                        type="password"
                        placeholder="変更しないなら空欄"
                        value={accountPasscode}
                        onChange={(event) => setAccountPasscode(event.target.value)}
                      />
                    </label>

                    <div className="session-actions">
                      <button type="submit" className="secondary-button" disabled={isAccountSaving}>
                        {isAccountSaving ? "更新中..." : "アカウント名と合言葉を更新"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </section>
            ) : null}

            {isAdmin ? (
              <section className="auth-section admin-section">
                <p className="section-label">Admin</p>

                <form className="admin-create-form" onSubmit={handleAdminCreate}>
                  <label>
                    新規アカウント名
                    <input
                      type="text"
                      value={adminCreateDraft.displayName}
                      onChange={(event) =>
                        setAdminCreateDraft((current) => ({ ...current, displayName: event.target.value }))
                      }
                    />
                  </label>

                  <label>
                    初期合言葉
                    <input
                      type="password"
                      value={adminCreateDraft.passcode}
                      onChange={(event) =>
                        setAdminCreateDraft((current) => ({ ...current, passcode: event.target.value }))
                      }
                    />
                  </label>

                  <label>
                    権限
                    <select
                      value={adminCreateDraft.role}
                      onChange={(event) =>
                        setAdminCreateDraft((current) => ({
                          ...current,
                          role: event.target.value as MemberRole
                        }))
                      }
                    >
                      <option value="member">隊員</option>
                      <option value="captain">隊長</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>

                  <div className="session-actions">
                    <button type="submit" className="primary-button" disabled={isAdminSaving}>
                      {isAdminSaving ? "作成中..." : "アカウントを作成"}
                    </button>
                  </div>
                </form>

                <div className="admin-member-list">
                  {members.map((member) => (
                    <article key={member.id} className="admin-member-card">
                      <div>
                        <p className="ranking-name">{member.displayName}</p>
                        <p className="ranking-meta">{member.id === currentMember.id ? "現在ログイン中" : "管理対象"}</p>
                      </div>

                      <label>
                        権限
                        <select
                          value={adminRoleDrafts[member.id] ?? member.role}
                          onChange={(event) =>
                            setAdminRoleDrafts((current) => ({
                              ...current,
                              [member.id]: event.target.value as MemberRole
                            }))
                          }
                          disabled={member.id === currentMember.id}
                        >
                          <option value="member">隊員</option>
                          <option value="captain">隊長</option>
                          <option value="admin">Admin</option>
                        </select>
                      </label>

                      <div className="admin-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => handleAdminRoleUpdate(member.id)}
                          disabled={isAdminSaving || member.id === currentMember.id}
                        >
                          権限を更新
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => handleAdminResetPasscode(member.id)}
                          disabled={isAdminSaving}
                        >
                          合言葉を0000に
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => handleAdminDelete(member.id, member.displayName)}
                          disabled={isAdminSaving || member.id === currentMember.id}
                        >
                          削除
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <p className="helper-text">データソース: {source === "supabase" ? "Supabase" : "フォールバック表示"}</p>
          </section>
        </div>
      ) : null}

      {currentMember ? (
        <>
          <nav className="tab-bar" aria-label="画面切り替え">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={tab.id === activeTab ? "tab-button is-active" : "tab-button"}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {activeTab === "home" ? (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="section-label">Home</p>
                  <h2>ホーム</h2>
                </div>
              </div>

              {currentSummary ? (
                <div className="hero-stats">
                  <StatCard label={`${currentYear}年の合計`} value={`${currentSummary.totalPoints}P`} />
                  <StatCard label="通算ポイント" value={`${currentSummary.lifetimeTotalPoints}P`} />
                  <StatCard label="観察件数" value={`${currentSummary.recordCount}件`} />
                </div>
              ) : null}

              <div className="home-copy">
                <p>合計ポイントは今年1月からの集計です。年が変わると、今年のポイントは0から始まります。</p>
                <p>通算ポイントでは、これまでの累計ポイントも確認できます。</p>
                <p>ランキングは隊長と Admin だけが見られます。</p>
              </div>

              <MonthlyTrendChart data={monthlyPointSeries} />

              {canViewRanking ? (
                <>
                  <div className="panel-head ranking-head">
                    <div>
                      <p className="section-label">Ranking</p>
                      <h3>{selectedRankingPeriodLabel}</h3>
                    </div>

                    <label>
                      期間
                      <select value={rankingPeriod} onChange={(event) => setRankingPeriod(event.target.value)}>
                        {rankingPeriodOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="ranking-list">
                    {rankingSummaries.map((summary, index) => (
                      <article
                        key={`${rankingPeriod}-${summary.memberId}`}
                        className="ranking-item"
                        onClick={() => {
                          setLogMemberFilterId(summary.memberId);
                          setActiveTab("logs");
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <span className="ranking-rank">{index + 1}</span>
                        <div>
                          <p className="ranking-name">{summary.displayName}</p>
                          <p className="ranking-meta">
                            {summary.role === "captain" ? "隊長" : summary.role === "admin" ? "Admin" : "隊員"} / 観察
                            {summary.recordCount}件
                          </p>
                        </div>
                        <div className="ranking-points">{summary.totalPoints}P</div>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <p className="helper-text">ランキングは隊長またはAdminだけが見られます。</p>
              )}
            </section>
          ) : null}

          {activeTab === "record" ? (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="section-label">Record</p>
                  <h2>観察を登録する</h2>
                </div>
              </div>

              <form className="record-form" onSubmit={handleSubmit}>
                <label className="full-width">
                  LINE貼り付け
                  <textarea
                    rows={7}
                    placeholder="隊長メッセージをここに貼り付けてください"
                    value={linePaste}
                    onChange={(event) => setLinePaste(event.target.value)}
                  />
                </label>

                <div className="form-actions full-width">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      const rawText = linePaste.trim();
                      if (!rawText) {
                        setParseStatus("まずは隊長メッセージを貼り付けてください。");
                        return;
                      }
                      applyParsedToDraft(rawText);
                    }}
                  >
                    貼り付けから自動入力
                  </button>
                  <button type="button" className="primary-button" onClick={handleQuickRegister} disabled={isSaving}>
                    {isSaving ? "保存中..." : "貼り付けだけで保存"}
                  </button>
                </div>

                <p className="helper-text full-width">{parseStatus}</p>

                <label>
                  観察日時
                  <input
                    type="datetime-local"
                    value={draft.observedAt}
                    onChange={(event) => setDraft((current) => ({ ...current, observedAt: event.target.value }))}
                    required
                  />
                </label>

                <label>
                  観察地域
                  <select
                    value={draft.location}
                    onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))}
                    required
                  >
                    <option value="">一覧から選んでください</option>
                    {LOCATION_OPTIONS.map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  詳細な場所
                  <input
                    type="text"
                    placeholder="例: 焼山中央、西条町寺家"
                    value={draft.locationDetail}
                    onChange={(event) => setDraft((current) => ({ ...current, locationDetail: event.target.value }))}
                  />
                </label>

                <div className="full-width map-field">
                  <MapCoordinatePicker
                    latitude={draft.latitude}
                    longitude={draft.longitude}
                    locationDetail={draft.locationDetail}
                    onChange={(coords) =>
                      setDraft((current) => ({
                        ...current,
                        latitude: coords.latitude,
                        longitude: coords.longitude
                      }))
                    }
                    onAddressResolved={(result) =>
                      setDraft((current) => ({
                        ...current,
                        location: result.region || current.location,
                        locationDetail: result.locationDetail || current.locationDetail
                      }))
                    }
                  />
                </div>

                <label>
                  種名
                  <input
                    type="text"
                    placeholder="例: セボシジョウカイ"
                    value={draft.species}
                    onChange={(event) => setDraft((current) => ({ ...current, species: event.target.value }))}
                    required
                  />
                </label>

                <label>
                  ポイント
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="例: 8"
                    value={draft.points}
                    onChange={(event) => setDraft((current) => ({ ...current, points: event.target.value }))}
                    required
                  />
                </label>

                <label className="full-width">
                  隊長メモ
                  <textarea
                    rows={4}
                    placeholder="例: 呉市1年ぶり、旧呉市初、呉市、広島県 8P"
                    value={draft.scoringMemo}
                    onChange={(event) => setDraft((current) => ({ ...current, scoringMemo: event.target.value }))}
                  />
                </label>

                <label>
                  写真
                  <input type="file" accept="image/*" onChange={handlePhotoChange} />
                </label>
                <p className="helper-text">{draftPhotoMessage}</p>

                <p className="helper-text">写真の共有保存は次の段階で対応予定です。</p>

                <div className="form-actions full-width">
                  <button type="submit" className="primary-button" disabled={isSaving}>
                    {isSaving ? "保存中..." : "保存する"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setDraft(getDefaultObservationDraft());
                      setLinePaste("");
                      setParseStatus(defaultParseStatus);
                    }}
                    disabled={isSaving}
                  >
                    入力をクリア
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {activeTab === "logs" ? (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="section-label">Logs</p>
                  <h2>観察ログ</h2>
                  {filteredLogMemberName ? <p className="helper-text">{filteredLogMemberName} さんのログを表示中です。</p> : null}
                </div>

                <div className="toolbar-row logs-toolbar">
                  {canViewRanking ? (
                    <label className="logs-filter-field">
                      隊員で絞り込み
                      <select
                        value={logMemberFilterId ?? ""}
                        onChange={(event) => setLogMemberFilterId(event.target.value || null)}
                      >
                        <option value="">全員</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setIsLogSearchOpen((current) => !current)}
                  >
                    {isLogSearchOpen ? "検索を閉じる" : hasLogSearch ? "検索中" : "検索"}
                  </button>

                  <input
                    ref={csvImportInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={handleImportLogs}
                  />

                  <div className="card-menu">
                    <button
                      type="button"
                      className="card-menu-button"
                      aria-label="観察ログのデータ操作を開く"
                      onClick={() => setIsLogDataMenuOpen((current) => !current)}
                    >
                      データ
                    </button>
                    {isLogDataMenuOpen ? (
                      <div className="card-menu-popup">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            setIsLogDataMenuOpen(false);
                            csvImportInputRef.current?.click();
                          }}
                          disabled={isImporting}
                        >
                          {isImporting ? "CSV取込中..." : "CSV取込"}
                        </button>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            setIsLogDataMenuOpen(false);
                            void handleExportLogs();
                          }}
                          disabled={isExporting || filteredLogs.length === 0}
                        >
                          {isExporting ? "CSV出力中..." : "CSV出力"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {isLogSearchOpen ? (
                  <div className="search-panel">
                    <div className="search-panel-head">
                      <p className="section-label">Search</p>
                      <div className="inline-actions">
                        <button
                          type="button"
                          className={logSearchMode === "and" ? "primary-button" : "ghost-button"}
                          onClick={() => setLogSearchMode("and")}
                        >
                          AND検索
                        </button>
                        <button
                          type="button"
                          className={logSearchMode === "or" ? "primary-button" : "ghost-button"}
                          onClick={() => setLogSearchMode("or")}
                        >
                          OR検索
                        </button>
                      </div>
                    </div>

                    <div className="search-grid">
                      <label>
                        種名
                        <input
                          type="text"
                          placeholder="例: ナミアゲハ"
                          value={logSearchSpecies}
                          onChange={(event) => setLogSearchSpecies(event.target.value)}
                        />
                      </label>

                      <label>
                        場所
                        <input
                          type="text"
                          placeholder="例: 呉市焼山"
                          value={logSearchLocation}
                          onChange={(event) => setLogSearchLocation(event.target.value)}
                        />
                      </label>

                      <label>
                        日付
                        <input type="date" value={logSearchDate} onChange={(event) => setLogSearchDate(event.target.value)} />
                      </label>
                    </div>

                    <div className="inline-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          setLogSearchSpecies("");
                          setLogSearchLocation("");
                          setLogSearchDate("");
                          setLogSearchMode("and");
                        }}
                        disabled={!hasLogSearch && logSearchMode === "and"}
                      >
                        条件をクリア
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {filteredLogs.length > 0 ? (
                <div className="pagination-bar">
                  <p className="helper-text">
                    {filteredLogs.length}件中 {(logsPage - 1) * logPageSize + 1}-
                    {Math.min(logsPage * logPageSize, filteredLogs.length)}件を表示
                  </p>
                  <div className="pagination-actions logs-pagination-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setLogsPage((current) => Math.max(1, current - 1))}
                      disabled={logsPage === 1}
                    >
                      前の10件
                    </button>
                    <span className="pagination-label">
                      {logsPage} / {totalLogPages}
                    </span>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setLogsPage((current) => Math.min(totalLogPages, current + 1))}
                      disabled={logsPage === totalLogPages}
                    >
                      次の10件
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="record-list">
                {highlightedLogId ? <p className="helper-text">追加した記録が見える位置を表示しています。</p> : null}
                {filteredLogs.length === 0 ? (
                  <p className="helper-text">{hasLogSearch ? "検索条件に合う観察ログがありません。" : "まだ観察ログがありません。"}</p>
                ) : null}
                {paginatedLogs.map((log) => {
                  const memberName = members.find((member) => member.id === log.memberId)?.displayName || "不明";
                  const canManage = canManageMemberData(log.memberId);

                  return (
                    <article
                      key={log.id}
                      className={highlightedLogId === log.id ? "record-card record-card-highlighted" : "record-card"}
                    >
                      {editingLogId === log.id ? (
                        <div className="editor-grid">
                          <label>
                            観察日時
                            <input
                              type="datetime-local"
                              value={editingLogDraft.observedAt}
                              onChange={(event) =>
                                setEditingLogDraft((current) => ({ ...current, observedAt: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            観察地域
                            <select
                              value={editingLogDraft.location}
                              onChange={(event) =>
                                setEditingLogDraft((current) => ({ ...current, location: event.target.value }))
                              }
                              required
                            >
                              <option value="">一覧から選んでください</option>
                              {LOCATION_OPTIONS.map((location) => (
                                <option key={location} value={location}>
                                  {location}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            詳細な場所
                            <input
                              type="text"
                              value={editingLogDraft.locationDetail}
                              onChange={(event) =>
                                setEditingLogDraft((current) => ({ ...current, locationDetail: event.target.value }))
                              }
                            />
                          </label>
                          <div className="full-width map-field">
                            <MapCoordinatePicker
                              latitude={editingLogDraft.latitude}
                              longitude={editingLogDraft.longitude}
                              locationDetail={editingLogDraft.locationDetail}
                              onChange={(coords) =>
                                setEditingLogDraft((current) => ({
                                  ...current,
                                  latitude: coords.latitude,
                                  longitude: coords.longitude
                                }))
                              }
                              onAddressResolved={(result) =>
                                setEditingLogDraft((current) => ({
                                  ...current,
                                  location: result.region || current.location,
                                  locationDetail: result.locationDetail || current.locationDetail
                                }))
                              }
                            />
                          </div>
                          <label>
                            種名
                            <input
                              type="text"
                              value={editingLogDraft.species}
                              onChange={(event) =>
                                setEditingLogDraft((current) => ({ ...current, species: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            ポイント
                            <input
                              type="number"
                              value={editingLogDraft.points}
                              onChange={(event) =>
                                setEditingLogDraft((current) => ({ ...current, points: event.target.value }))
                              }
                            />
                          </label>
                          <label className="full-width">
                            隊長メモ
                            <textarea
                              rows={4}
                              value={editingLogDraft.scoringMemo}
                              onChange={(event) =>
                                setEditingLogDraft((current) => ({ ...current, scoringMemo: event.target.value }))
                              }
                            />
                          </label>
                          <div className="form-actions full-width">
                            <button type="button" className="primary-button" onClick={() => handleUpdateLog(log.id)}>
                              更新する
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => setEditingLogId(null)}
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="record-top">
                            <div>
                              <p className="record-meta">{formatDateTime(log.observedAt)}</p>
                              {canViewRanking ? <p className="record-meta">{memberName}</p> : null}
                              <h3 className="record-species">{log.species}</h3>
                            </div>
                            <div className="record-top-actions">
                              <div className="point-badge">{log.points}P</div>
                              {canManage ? (
                                <div className="card-menu">
                                  <button
                                    type="button"
                                    className="card-menu-button"
                                    aria-label={`${log.species} の操作を開く`}
                                    onClick={() =>
                                      setOpenRecordMenuKey((current) => (current === `log:${log.id}` ? null : `log:${log.id}`))
                                    }
                                  >
                                    ...
                                  </button>
                                  {openRecordMenuKey === `log:${log.id}` ? (
                                    <div className="card-menu-popup">
                                      <button type="button" className="secondary-button" onClick={() => startEditingLog(log)}>
                                        編集
                                      </button>
                                      <button type="button" className="ghost-button" onClick={() => handleDeleteLog(log)}>
                                        削除
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <p className="record-location">{formatObservationLocation(log.location, log.locationDetail)}</p>
                          {log.latitude !== null && log.latitude !== undefined && log.longitude !== null && log.longitude !== undefined ? (
                            <p className="record-meta">
                              緯度 {log.latitude.toFixed(5)} / 経度 {log.longitude.toFixed(5)} ・{" "}
                              <a
                                href={`https://www.openstreetmap.org/?mlat=${log.latitude}&mlon=${log.longitude}#map=15/${log.latitude}/${log.longitude}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                地図で見る
                              </a>
                            </p>
                          ) : null}
                          <p className="record-memo">{log.scoringMemo || "メモなし"}</p>

                          <div className="record-assets">
                            {log.imageUrl ? (
                              <div className="photo-thumbnail">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={log.imageUrl} alt={log.species} />
                                <span className="photo-thumbnail-label">写真あり</span>
                              </div>
                            ) : null}

                            {log.guidePdfUrl ? <span className="asset-label">PDFあり</span> : null}
                          </div>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>

              {filteredLogs.length > 0 ? (
                <div className="pagination-bar pagination-bar-bottom">
                  <p className="helper-text">
                    {filteredLogs.length}件中 {(logsPage - 1) * logPageSize + 1}-
                    {Math.min(logsPage * logPageSize, filteredLogs.length)}件を表示
                  </p>
                  <div className="pagination-actions logs-pagination-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setLogsPage((current) => Math.max(1, current - 1))}
                      disabled={logsPage === 1}
                    >
                      前の10件
                    </button>
                    <span className="pagination-label">
                      {logsPage} / {totalLogPages}
                    </span>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setLogsPage((current) => Math.min(totalLogPages, current + 1))}
                      disabled={logsPage === totalLogPages}
                    >
                      次の10件
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {activeTab === "inquiry" ? (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="section-label">Inquiry</p>
                  <h2>記録照会</h2>
                  <p className="helper-text">全隊員の観察記録から、種類ごとの出現状況を年ごとに確認できます。</p>
                </div>

                <div className="toolbar-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setIsInquirySearchOpen((current) => !current)}
                  >
                    {isInquirySearchOpen ? "検索を閉じる" : hasInquirySearch ? "検索中" : "検索"}
                  </button>
                </div>

                {isInquirySearchOpen ? (
                  <div className="search-panel">
                    <div className="search-panel-head">
                      <p className="section-label">Search</p>
                      <div className="inline-actions">
                        <button
                          type="button"
                          className={inquirySearchMode === "and" ? "primary-button" : "ghost-button"}
                          onClick={() => setInquirySearchMode("and")}
                        >
                          AND検索
                        </button>
                        <button
                          type="button"
                          className={inquirySearchMode === "or" ? "primary-button" : "ghost-button"}
                          onClick={() => setInquirySearchMode("or")}
                        >
                          OR検索
                        </button>
                      </div>
                    </div>

                    <div className="search-grid">
                      <label>
                        種名
                        <input
                          type="text"
                          placeholder="例: セボシジョウカイ"
                          value={inquirySearchSpecies}
                          onChange={(event) => setInquirySearchSpecies(event.target.value)}
                        />
                      </label>

                      <label>
                        場所
                        <input
                          type="text"
                          placeholder="例: 呉市焼山"
                          value={inquirySearchLocation}
                          onChange={(event) => setInquirySearchLocation(event.target.value)}
                        />
                      </label>

                      <label>
                        日付
                        <input
                          type="date"
                          value={inquirySearchDate}
                          onChange={(event) => setInquirySearchDate(event.target.value)}
                        />
                      </label>
                    </div>

                    <div className="inline-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          setInquirySearchSpecies("");
                          setInquirySearchLocation("");
                          setInquirySearchDate("");
                          setInquirySearchMode("and");
                        }}
                        disabled={!hasInquirySearch && inquirySearchMode === "and"}
                      >
                        条件をクリア
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {isInquiryLoading ? <p className="helper-text">記録照会データを読み込み中です。</p> : null}

              {!isInquiryLoading ? (
                <p className="helper-text">
                  {filteredInquiryLogs.length}件の記録から、{inquirySpeciesList.length}種類を表示しています。
                </p>
              ) : null}

              {!isInquiryLoading && inquirySpeciesList.length === 0 ? (
                <p className="helper-text">
                  {hasInquirySearch ? "検索条件に合う記録はありません。" : "照会できる観察記録がまだありません。"}
                </p>
              ) : null}

              {!isInquiryLoading && inquirySpeciesList.length > 0 ? (
                <section className="inquiry-species-panel">
                  <div className="inquiry-panel-head">
                    <div>
                      <p className="section-label">Species</p>
                      <h3>種類一覧</h3>
                    </div>
                    <p className="helper-text">50音順に並んでいます。種類名を押すと詳細が開きます。</p>
                  </div>

                  <div className="inquiry-species-rows">
                    {paginatedInquirySpecies.map((species) => (
                      <button
                        key={species}
                        type="button"
                        className="inquiry-species-row"
                        onClick={() => setSelectedInquirySpecies(species)}
                      >
                        <span>{species}</span>
                        <span className="inquiry-row-arrow">›</span>
                      </button>
                    ))}
                  </div>

                  <div className="pagination-bar pagination-bar-bottom">
                    <p className="helper-text">
                      {inquirySpeciesList.length}種類中 {(inquirySpeciesPage - 1) * inquirySpeciesPageSize + 1}-
                      {Math.min(inquirySpeciesPage * inquirySpeciesPageSize, inquirySpeciesList.length)}種類を表示
                    </p>
                    <div className="pagination-actions logs-pagination-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setInquirySpeciesPage((current) => Math.max(1, current - 1))}
                        disabled={inquirySpeciesPage === 1}
                      >
                        前の10件
                      </button>
                      <span className="pagination-label">
                        {inquirySpeciesPage} / {totalInquirySpeciesPages}
                      </span>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setInquirySpeciesPage((current) => Math.min(totalInquirySpeciesPages, current + 1))}
                        disabled={inquirySpeciesPage === totalInquirySpeciesPages}
                      >
                        次の10件
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}
            </section>
          ) : null}

          {activeTab === "points" ? (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="section-label">Points</p>
                  <h2>追加ポイント</h2>
                  {filteredPointMemberName ? <p className="helper-text">{filteredPointMemberName} さんの追加ポイントを表示中です。</p> : null}
                </div>

                {canViewRanking ? (
                  <label>
                    隊員で絞り込み
                    <select
                      value={pointMemberFilterId ?? ""}
                      onChange={(event) => setPointMemberFilterId(event.target.value || null)}
                    >
                      <option value="">全員</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <form className="record-form" onSubmit={handlePointSubmit}>
                <label>
                  日時
                  <input
                    type="datetime-local"
                    value={pointDraft.awardedAt}
                    onChange={(event) => setPointDraft((current) => ({ ...current, awardedAt: event.target.value }))}
                    required
                  />
                </label>

                <label>
                  対象隊員
                  <select
                    value={pointDraft.memberId || currentMember.id}
                    onChange={(event) => setPointDraft((current) => ({ ...current, memberId: event.target.value }))}
                    disabled={!canViewRanking}
                  >
                    {(canViewRanking ? members : [currentMember]).map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  項目名
                  <input
                    type="text"
                    placeholder="例: 誤同定の指摘"
                    value={pointDraft.title}
                    onChange={(event) => setPointDraft((current) => ({ ...current, title: event.target.value }))}
                    required
                  />
                </label>

                <label>
                  ポイント
                  <input
                    type="number"
                    step="1"
                    placeholder="例: 2"
                    value={pointDraft.points}
                    onChange={(event) => setPointDraft((current) => ({ ...current, points: event.target.value }))}
                    required
                  />
                </label>

                <label className="full-width">
                  説明
                  <textarea
                    rows={3}
                    placeholder="例: 同定の修正提案が採用された"
                    value={pointDraft.description}
                    onChange={(event) => setPointDraft((current) => ({ ...current, description: event.target.value }))}
                  />
                </label>

                <div className="form-actions full-width">
                  <button type="submit" className="primary-button" disabled={isPointSaving}>
                    {isPointSaving ? "保存中..." : editingPointEntryId ? "更新する" : "追加する"}
                  </button>
                  <button type="button" className="secondary-button" onClick={resetPointDraft} disabled={isPointSaving}>
                    クリア
                  </button>
                </div>
              </form>

              <div className="record-list">
                {filteredPointEntries.length === 0 ? <p className="helper-text">まだ追加ポイントはありません。</p> : null}
                {filteredPointEntries.map((entry) => {
                  const memberName = members.find((member) => member.id === entry.memberId)?.displayName || "不明";
                  const canManage = canManageMemberData(entry.memberId);

                  return (
                    <article key={entry.id} className="record-card">
                      <div className="record-top">
                        <div>
                          <p className="record-meta">{formatDateTime(entry.awardedAt)}</p>
                          {canViewRanking ? <p className="record-meta">{memberName}</p> : null}
                          <h3 className="record-species">{entry.title}</h3>
                        </div>
                        <div className="record-top-actions">
                          <div className="point-badge">{entry.points}P</div>
                          {canManage ? (
                            <div className="card-menu">
                              <button
                                type="button"
                                className="card-menu-button"
                                aria-label={`${entry.title} の操作を開く`}
                                onClick={() =>
                                  setOpenRecordMenuKey((current) =>
                                    current === `point-entry:${entry.id}` ? null : `point-entry:${entry.id}`
                                  )
                                }
                              >
                                ...
                              </button>
                              {openRecordMenuKey === `point-entry:${entry.id}` ? (
                                <div className="card-menu-popup">
                                  <button type="button" className="secondary-button" onClick={() => startEditingPointEntry(entry)}>
                                    編集
                                  </button>
                                  <button
                                    type="button"
                                    className="ghost-button"
                                    onClick={() => handleDeletePointEntry(entry)}
                                  >
                                    削除
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <p className="record-memo">{entry.description || "説明なし"}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="section-label">Start</p>
              <h2>ログインしてください</h2>
            </div>
          </div>
          <p className="helper-text">
            右上のログインボタンから入ると、ホーム・観察登録・観察ログ・記録照会・追加ポイントが使えるようになります。
          </p>
        </section>
      )}
    </div>
  );
}

function MapCoordinatePicker({
  latitude,
  longitude,
  locationDetail,
  onChange,
  onAddressResolved
}: {
  latitude: string;
  longitude: string;
  locationDetail?: string;
  onChange: (coords: { latitude: string; longitude: string }) => void;
  onAddressResolved?: (result: { region: string; locationDetail: string }) => void;
}) {
  const defaultCenter = parseCoordinates(latitude, longitude) ?? { latitude: 34.3963, longitude: 132.4596 };
  const [center, setCenter] = useState(defaultCenter);
  const [zoom, setZoom] = useState(11);
  const [viewportSize, setViewportSize] = useState(320);
  const [isLocating, setIsLocating] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const mapRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{
    mode: "idle" | "pan" | "pinch";
    startX: number;
    startY: number;
    startCenter: { latitude: number; longitude: number };
    startZoom: number;
    pinchStartDistance: number;
    dragged: boolean;
  }>({
    mode: "idle",
    startX: 0,
    startY: 0,
    startCenter: defaultCenter,
    startZoom: 11,
    pinchStartDistance: 0,
    dragged: false
  });
  const mapSize = viewportSize;
  const centerWorld = latLngToWorldPixels(center.latitude, center.longitude, zoom);
  const topLeftWorld = {
    x: centerWorld.x - mapSize / 2,
    y: centerWorld.y - mapSize / 2
  };
  const marker = parseCoordinates(latitude, longitude);
  const markerPosition = marker
    ? projectToViewportPixels(marker.latitude, marker.longitude, zoom, topLeftWorld.x, topLeftWorld.y)
    : null;
  const tiles = buildVisibleTiles(topLeftWorld.x, topLeftWorld.y, zoom, mapSize);

  useEffect(() => {
    const nextCenter = parseCoordinates(latitude, longitude);
    if (nextCenter) {
      setCenter(nextCenter);
    }
  }, [latitude, longitude]);

  useEffect(() => {
    const element = mapRef.current;
    if (!element) {
      return;
    }

    function syncViewportSize() {
      if (!element) {
        return;
      }
      const nextSize = Math.max(280, Math.round(element.getBoundingClientRect().width));
      setViewportSize((current) => (current === nextSize ? current : nextSize));
    }

    syncViewportSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncViewportSize);
      return () => window.removeEventListener("resize", syncViewportSize);
    }

    const observer = new ResizeObserver(() => {
      syncViewportSize();
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  function updateZoom(nextZoom: number, anchorClientX?: number, anchorClientY?: number) {
    const clampedZoom = clampZoom(nextZoom);
    if (clampedZoom === zoom) {
      return;
    }

    if (!mapRef.current || anchorClientX == null || anchorClientY == null) {
      setZoom(clampedZoom);
      return;
    }

    const rect = mapRef.current.getBoundingClientRect();
    const anchorX = ((anchorClientX - rect.left) / rect.width) * mapSize;
    const anchorY = ((anchorClientY - rect.top) / rect.height) * mapSize;
    const anchorCoordinates = worldPixelsToLatLng(topLeftWorld.x + anchorX, topLeftWorld.y + anchorY, zoom);
    const anchorWorldAtNextZoom = latLngToWorldPixels(
      anchorCoordinates.latitude,
      anchorCoordinates.longitude,
      clampedZoom
    );
    const nextCenterWorld = {
      x: anchorWorldAtNextZoom.x - (anchorX - mapSize / 2),
      y: anchorWorldAtNextZoom.y - (anchorY - mapSize / 2)
    };
    const nextCenter = worldPixelsToLatLng(nextCenterWorld.x, nextCenterWorld.y, clampedZoom);

    setZoom(clampedZoom);
    setCenter({
      latitude: clampLatitude(nextCenter.latitude),
      longitude: normalizeLongitude(nextCenter.longitude)
    });
  }

  function pickCoordinate(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * mapSize;
    const y = ((event.clientY - rect.top) / rect.height) * mapSize;
    const coords = worldPixelsToLatLng(topLeftWorld.x + x, topLeftWorld.y + y, zoom);
    applyCoordinates(coords.latitude, coords.longitude);
    void resolveAddress(coords.latitude, coords.longitude);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 1) {
      gestureRef.current = {
        mode: "pan",
        startX: event.clientX,
        startY: event.clientY,
        startCenter: center,
        startZoom: zoom,
        pinchStartDistance: 0,
        dragged: false
      };
      return;
    }

    if (pointersRef.current.size === 2) {
      const [firstPointer, secondPointer] = Array.from(pointersRef.current.values());
      gestureRef.current = {
        mode: "pinch",
        startX: 0,
        startY: 0,
        startCenter: center,
        startZoom: zoom,
        pinchStartDistance: getPointerDistance(firstPointer, secondPointer),
        dragged: true
      };
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }

    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (gestureRef.current.mode === "pinch" && pointersRef.current.size >= 2) {
      const [firstPointer, secondPointer] = Array.from(pointersRef.current.values());
      const nextDistance = getPointerDistance(firstPointer, secondPointer);
      const midpoint = {
        x: (firstPointer.x + secondPointer.x) / 2,
        y: (firstPointer.y + secondPointer.y) / 2
      };
      const distanceRatio = nextDistance / Math.max(gestureRef.current.pinchStartDistance, 1);
      const nextZoom = clampZoom(Math.round(gestureRef.current.startZoom + Math.log2(distanceRatio)));
      updateZoom(nextZoom, midpoint.x, midpoint.y);
      return;
    }

    if (gestureRef.current.mode !== "pan") {
      return;
    }

    const deltaX = event.clientX - gestureRef.current.startX;
    const deltaY = event.clientY - gestureRef.current.startY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      gestureRef.current.dragged = true;
    }

    const startWorld = latLngToWorldPixels(
      gestureRef.current.startCenter.latitude,
      gestureRef.current.startCenter.longitude,
      zoom
    );
    const nextCenter = worldPixelsToLatLng(startWorld.x - deltaX, startWorld.y - deltaY, zoom);
    setCenter({
      latitude: clampLatitude(nextCenter.latitude),
      longitude: normalizeLongitude(nextCenter.longitude)
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const wasSingleTap = gestureRef.current.mode === "pan" && !gestureRef.current.dragged && pointersRef.current.size === 1;
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (pointersRef.current.size === 0) {
      gestureRef.current.mode = "idle";
    } else if (pointersRef.current.size === 1) {
      const [remainingPointer] = Array.from(pointersRef.current.values());
      gestureRef.current = {
        mode: "pan",
        startX: remainingPointer.x,
        startY: remainingPointer.y,
        startCenter: center,
        startZoom: zoom,
        pinchStartDistance: 0,
        dragged: true
      };
    }

    if (wasSingleTap) {
      pickCoordinate(event);
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 1 : -1;
    updateZoom(zoom + delta, event.clientX, event.clientY);
  }

  function stopMapGesture(event: ReactPointerEvent<HTMLElement>) {
    event.stopPropagation();
  }

  function applyCoordinates(nextLatitude: number, nextLongitude: number) {
    const normalized = {
      latitude: clampLatitude(nextLatitude),
      longitude: normalizeLongitude(nextLongitude)
    };

    onChange({
      latitude: normalized.latitude.toFixed(6),
      longitude: normalized.longitude.toFixed(6)
    });
    setCenter(normalized);
  }

  async function resolveAddress(nextLatitude: number, nextLongitude: number) {
    setIsResolvingAddress(true);

    try {
      const response = await fetch(
        `/api/geocode/reverse?lat=${encodeURIComponent(nextLatitude.toFixed(6))}&lon=${encodeURIComponent(nextLongitude.toFixed(6))}`,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json"
          }
        }
      );

      const payload = (await response.json()) as {
        region?: string;
        locationDetail?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "住所の取得に失敗しました。");
      }

      onAddressResolved?.({
        region: payload.region || "",
        locationDetail: payload.locationDetail || ""
      });

      if (payload.region || payload.locationDetail) {
        const found = [
          payload.region ? `地域: ${payload.region}` : "",
          payload.locationDetail ? `詳細: ${payload.locationDetail}` : ""
        ].filter(Boolean);
        setLocationMessage(`住所候補を入れました。${found.join(" / ")}`);
      } else {
        setLocationMessage("座標は入りました。観察地域は必要に応じて手で選んでください。");
      }
    } catch (error) {
      setLocationMessage(error instanceof Error ? error.message : "住所の取得に失敗しました。");
    } finally {
      setIsResolvingAddress(false);
    }
  }

  function handleUseCurrentLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationMessage("この端末では現在地を取得できません。");
      return;
    }

    setIsLocating(true);
    setLocationMessage("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        applyCoordinates(position.coords.latitude, position.coords.longitude);
        setZoom((current) => Math.max(current, 15));
        void resolveAddress(position.coords.latitude, position.coords.longitude);
        setIsLocating(false);
      },
      () => {
        setLocationMessage("現在地を取得できませんでした。");
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  }

  return (
    <div className="coordinate-picker">
      <div className="coordinate-picker-head">
        <div>
          <p className="section-label">Map</p>
          <strong className="map-title">地図から場所を選ぶ</strong>
          <strong>地図から座標を選ぶ</strong>
        </div>
          <p className="helper-text">
            任意項目です。ドラッグで移動、ピンチやホイール、右上の + / - で拡大縮小できます。タップで座標を選べます。
          </p>
          <p className="helper-text map-help">「現在地を使う」を押すと、今いる場所の座標をすぐに入れられます。</p>
      </div>

      <div className="map-controls">
        <button type="button" className="secondary-button" onClick={handleUseCurrentLocation} disabled={isLocating}>
          {isLocating ? "現在地取得中..." : "現在地を使う"}
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            onChange({ latitude: "", longitude: "" });
            setLocationMessage("");
          }}
        >
          座標をクリア
        </button>
      </div>

      <div
        ref={mapRef}
      className="map-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        role="button"
        tabIndex={0}
        aria-label="観察場所の地図"
      >
        <div className="map-overlay-controls" onPointerDown={stopMapGesture}>
          <button type="button" className="map-zoom-button" onClick={() => updateZoom(zoom + 1)} aria-label="拡大">
            +
          </button>
          <button type="button" className="map-zoom-button" onClick={() => updateZoom(zoom - 1)} aria-label="縮小">
            -
          </button>
        </div>

        {tiles.map((tile) => (
          <img
            key={`${tile.zoom}-${tile.x}-${tile.y}`}
            src={`https://tile.openstreetmap.org/${tile.zoom}/${tile.x}/${tile.y}.png`}
            alt=""
            className="map-tile"
            style={{ left: `${tile.left}px`, top: `${tile.top}px` }}
            draggable={false}
          />
        ))}
        {markerPosition ? (
          <span
            className="map-marker"
            style={{
              left: `${Math.max(0, Math.min(100, (markerPosition.x / mapSize) * 100))}%`,
              top: `${Math.max(0, Math.min(100, (markerPosition.y / mapSize) * 100))}%`
            }}
          />
        ) : null}
      </div>

      {locationMessage ? <p className="helper-text">{locationMessage}</p> : null}
      {isResolvingAddress ? <p className="helper-text">住所候補を確認しています...</p> : null}

      <div className="coordinate-inputs">
        <label>
          緯度
          <input
            type="number"
            step="0.000001"
            placeholder="例: 34.396300"
            value={latitude}
            onChange={(event) => {
              onChange({ latitude: event.target.value, longitude });
              setLocationMessage("");
            }}
          />
        </label>
        <label>
          経度
          <input
            type="number"
            step="0.000001"
            placeholder="例: 132.459600"
            value={longitude}
            onChange={(event) => {
              onChange({ latitude, longitude: event.target.value });
              setLocationMessage("");
            }}
          />
        </label>
      </div>
      {locationDetail ? <p className="helper-text">詳細場所: {locationDetail}</p> : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formatObservationLocation(location: string, locationDetail?: string | null) {
  const detail = locationDetail?.trim();
  return detail ? `${location} / ${detail}` : location;
}

function MonthlyTrendChart({ data }: { data: Array<{ label: string; total: number; recordCount: number }> }) {
  const width = 640;
  const height = 220;
  const paddingX = 28;
  const paddingTop = 18;
  const paddingBottom = 34;
  const graphWidth = width - paddingX * 2;
  const graphHeight = height - paddingTop - paddingBottom;
  const maxValue = Math.max(...data.map((item) => item.total), 1);

  const points = data.map((item, index) => {
    const x = paddingX + (graphWidth * index) / Math.max(data.length - 1, 1);
    const y = paddingTop + graphHeight - (item.total / maxValue) * graphHeight;
    return { ...item, x, y };
  });

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${paddingTop + graphHeight} L ${points[0].x} ${paddingTop + graphHeight} Z`
    : "";

  return (
    <section className="trend-card">
      <div className="trend-head">
        <div>
          <p className="section-label">Trend</p>
          <h3>月別ポイント推移</h3>
        </div>
          <p className="helper-text">直近6か月の観察ポイントと追加ポイントの合計です。観察件数も併記しています。</p>
      </div>

      {data.length === 0 ? (
        <p className="helper-text">まだグラフに表示できるポイントがありません。</p>
      ) : (
        <>
          <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="月別ポイント推移">
            <line
              x1={paddingX}
              y1={paddingTop + graphHeight}
              x2={width - paddingX}
              y2={paddingTop + graphHeight}
              className="trend-axis"
            />
            {areaPath ? <path d={areaPath} className="trend-area" /> : null}
            {linePath ? <path d={linePath} className="trend-line" /> : null}
            {points.map((point) => (
              <g key={point.label}>
                <circle cx={point.x} cy={point.y} r="5" className="trend-dot" />
                <text x={point.x} y={height - 10} textAnchor="middle" className="trend-label">
                  {point.label}
                </text>
                <text x={point.x} y={height - 24} textAnchor="middle" className="trend-count">
                  {point.recordCount}件
                </text>
                <text x={point.x} y={point.y - 12} textAnchor="middle" className="trend-value">
                  {point.total}P
                </text>
              </g>
            ))}
          </svg>

          <div className="trend-legend">
            {data.map((item) => (
              <div key={item.label} className="trend-legend-item">
                <span>{item.label}</span>
                <strong>{item.total}P</strong>
                <small>{item.recordCount}件</small>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function buildInquiryLocationRows(logs: InquiryObservation[]): InquiryLocationRow[] {
  const grouped = new Map<string, InquiryLocationRow>();

  for (const log of logs) {
    const monthIndex = new Date(log.observedAt).getMonth();
    const current =
      grouped.get(log.location) ??
      {
        location: log.location,
        monthCounts: Array.from({ length: 12 }, () => 0),
        totalCount: 0
      };

    current.monthCounts[monthIndex] += 1;
    current.totalCount += 1;
    grouped.set(log.location, current);
  }

  return [...grouped.values()].sort((left, right) => {
    const countComparison = right.totalCount - left.totalCount;
    if (countComparison !== 0) {
      return countComparison;
    }

    return left.location.localeCompare(right.location, "ja-JP");
  });
}

function buildInquiryDetailRows(logs: InquiryObservation[]): InquiryDetailRow[] {
  const grouped = new Map<string, InquiryDetailRow>();

  for (const log of logs) {
    const date = toDateInputValue(log.observedAt);
    const location = formatObservationLocation(log.location, log.locationDetail);
    const key = `${date}||${location}`;
    const current = grouped.get(key);

    if (current) {
      current.count += 1;
      continue;
    }

    grouped.set(key, {
      key,
      date,
      location,
      count: 1
    });
  }

  return [...grouped.values()].sort((left, right) => {
    const dateComparison = right.date.localeCompare(left.date);
    if (dateComparison !== 0) {
      return dateComparison;
    }

    return left.location.localeCompare(right.location, "ja-JP");
  });
}

function buildRankingPeriodOptions(logs: ObservationLog[], pointEntries: PointEntry[], currentYear: number): RankingPeriodOption[] {
  const currentMonthKey = toMonthKey(new Date());
  const monthKeys = new Set<string>([currentMonthKey]);

  for (const log of logs) {
    monthKeys.add(toMonthKey(log.observedAt));
  }

  for (const entry of pointEntries) {
    monthKeys.add(toMonthKey(entry.awardedAt));
  }

  const monthlyOptions = Array.from(monthKeys)
    .sort((left, right) => right.localeCompare(left))
    .map((monthKey) => ({
      value: `month:${monthKey}`,
      label: monthKey === currentMonthKey ? "今月ランキング" : `${formatMonthKey(monthKey)}ランキング`
    }));

  return [...monthlyOptions, { value: `year:${currentYear}`, label: `通算（${currentYear}年）` }];
}

function buildRankingSummaries(
  members: Member[],
  logs: ObservationLog[],
  pointEntries: PointEntry[],
  period: string
): MemberSummary[] {
  const [scope, rawValue] = period.split(":");
  const filteredLogs = logs.filter((log) => matchesRankingPeriod(log.observedAt, scope, rawValue));
  const filteredPointEntries = pointEntries.filter((entry) => matchesRankingPeriod(entry.awardedAt, scope, rawValue));

  return members
    .map((member) => {
      const memberLogs = filteredLogs.filter((log) => log.memberId === member.id);
      const memberPointEntries = filteredPointEntries.filter((entry) => entry.memberId === member.id);
      const observationPoints = memberLogs.reduce((sum, log) => sum + log.points, 0);
      const extraPoints = memberPointEntries.reduce((sum, entry) => sum + entry.points, 0);
      const sortedLogs = [...memberLogs].sort((left, right) => right.observedAt.localeCompare(left.observedAt));

      return {
        memberId: member.id,
        displayName: member.displayName,
        role: member.role,
        totalPoints: observationPoints + extraPoints,
        lifetimeTotalPoints:
          logs.filter((log) => log.memberId === member.id).reduce((sum, log) => sum + log.points, 0) +
          pointEntries.filter((entry) => entry.memberId === member.id).reduce((sum, entry) => sum + entry.points, 0),
        observationPoints,
        extraPoints,
        recordCount: memberLogs.length,
        pointEntryCount: memberPointEntries.length,
        latestObservedAt: sortedLogs[0]?.observedAt ?? null
      };
    })
    .sort((left, right) => {
      if (right.totalPoints !== left.totalPoints) {
        return right.totalPoints - left.totalPoints;
      }

      if (right.recordCount !== left.recordCount) {
        return right.recordCount - left.recordCount;
      }

      return left.displayName.localeCompare(right.displayName, "ja");
    });
}

function buildMonthlyPointSeries(
  logs: ObservationLog[],
  pointEntries: PointEntry[],
  memberId: string,
  months = 6
): Array<{ label: string; total: number; recordCount: number }> {
  const totals = new Map<string, { total: number; recordCount: number }>();
  const current = new Date();
  const currentMonth = new Date(current.getFullYear(), current.getMonth(), 1);

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const monthDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - offset, 1);
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    totals.set(key, { total: 0, recordCount: 0 });
  }

  for (const log of logs) {
    if (log.memberId !== memberId) {
      continue;
    }

    const observedAt = new Date(log.observedAt);
    const key = `${observedAt.getFullYear()}-${String(observedAt.getMonth() + 1).padStart(2, "0")}`;
    if (totals.has(key)) {
      const currentMonthTotal = totals.get(key)!;
      totals.set(key, {
        total: currentMonthTotal.total + log.points,
        recordCount: currentMonthTotal.recordCount + 1
      });
    }
  }

  for (const entry of pointEntries) {
    if (entry.memberId !== memberId) {
      continue;
    }

    const awardedAt = new Date(entry.awardedAt);
    const key = `${awardedAt.getFullYear()}-${String(awardedAt.getMonth() + 1).padStart(2, "0")}`;
    if (totals.has(key)) {
      const currentMonthTotal = totals.get(key)!;
      totals.set(key, {
        total: currentMonthTotal.total + entry.points,
        recordCount: currentMonthTotal.recordCount
      });
    }
  }

  return Array.from(totals.entries()).map(([key, value]) => {
    const [, month] = key.split("-");
    return {
      label: `${Number(month)}月`,
      total: value.total,
      recordCount: value.recordCount
    };
  });
}

function matchesRankingPeriod(value: string, scope: string, rawValue: string) {
  if (scope === "year") {
    return new Date(value).getFullYear() === Number(rawValue);
  }

  return toMonthKey(value) === rawValue;
}

function toMonthKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `${year}年${Number(month)}月`;
}

function parseCoordinates(latitude: string, longitude: string) {
  if (!latitude || !longitude) {
    return null;
  }

  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);
  if (Number.isNaN(parsedLatitude) || Number.isNaN(parsedLongitude)) {
    return null;
  }

  return {
    latitude: parsedLatitude,
    longitude: parsedLongitude
  };
}

function latLngToTile(latitude: number, longitude: number, zoom: number) {
  const scale = 2 ** zoom;
  const latRad = (clampLatitude(latitude) * Math.PI) / 180;
  const rawX = Math.floor(((normalizeLongitude(longitude) + 180) / 360) * scale);
  const rawY = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale
  );
  const x = ((rawX % scale) + scale) % scale;
  const y = Math.max(0, Math.min(scale - 1, rawY));

  return { x, y };
}

function latLngToWorldPixels(latitude: number, longitude: number, zoom: number) {
  const scale = 2 ** zoom;
  const latRad = (clampLatitude(latitude) * Math.PI) / 180;
  const worldX = ((normalizeLongitude(longitude) + 180) / 360) * scale * 256;
  const worldY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale * 256;

  return { x: worldX, y: worldY };
}

function projectToViewportPixels(
  latitude: number,
  longitude: number,
  zoom: number,
  topLeftWorldX: number,
  topLeftWorldY: number
) {
  const world = latLngToWorldPixels(latitude, longitude, zoom);

  return {
    x: world.x - topLeftWorldX,
    y: world.y - topLeftWorldY
  };
}

function worldPixelsToLatLng(worldX: number, worldY: number, zoom: number) {
  const scale = 2 ** zoom;
  const longitude = (worldX / (256 * scale)) * 360 - 180;
  const mercatorY = Math.PI - (2 * Math.PI * worldY) / (256 * scale);
  const latitude = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(mercatorY) - Math.exp(-mercatorY)));

  return { latitude, longitude };
}

function buildVisibleTiles(topLeftWorldX: number, topLeftWorldY: number, zoom: number, mapSize: number) {
  const scale = 2 ** zoom;
  const startTileX = Math.floor(topLeftWorldX / 256);
  const startTileY = Math.floor(topLeftWorldY / 256);
  const endTileX = Math.floor((topLeftWorldX + mapSize) / 256);
  const endTileY = Math.floor((topLeftWorldY + mapSize) / 256);
  const tiles: Array<{ x: number; y: number; zoom: number; left: number; top: number }> = [];

  for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
    if (tileY < 0 || tileY >= scale) {
      continue;
    }

    for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
      const wrappedTileX = ((tileX % scale) + scale) % scale;
      tiles.push({
        x: wrappedTileX,
        y: tileY,
        zoom,
        left: tileX * 256 - topLeftWorldX,
        top: tileY * 256 - topLeftWorldY
      });
    }
  }

  return tiles;
}

function getPointerDistance(firstPointer: { x: number; y: number }, secondPointer: { x: number; y: number }) {
  return Math.hypot(firstPointer.x - secondPointer.x, firstPointer.y - secondPointer.y);
}

function clampZoom(value: number) {
  return Math.max(7, Math.min(17, value));
}

function clampLatitude(value: number) {
  return Math.max(-85, Math.min(85, value));
}

function normalizeLongitude(value: number) {
  if (value > 180) {
    return value - 360;
  }

  if (value < -180) {
    return value + 360;
  }

  return value;
}
