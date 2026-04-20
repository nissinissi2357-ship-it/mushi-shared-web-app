"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import { formatDateTime } from "@/lib/format";
import { resizeImageBeforeUpload } from "@/lib/image";
import { parseCaptainMessage } from "@/lib/line-parser";
import type {
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

function toLocalInputValue(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function getDefaultObservationDraft(): DraftObservation {
  return {
    observedAt: toLocalInputValue(),
    location: "",
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
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isAccountSaving, setIsAccountSaving] = useState(false);
  const [isAdminSaving, setIsAdminSaving] = useState(false);
  const [logMemberFilterId, setLogMemberFilterId] = useState<string | null>(null);
  const [pointMemberFilterId, setPointMemberFilterId] = useState<string | null>(null);
  const [isAuthPanelOpen, setIsAuthPanelOpen] = useState(false);

  const selectedMember = members.find((member) => member.id === selectedMemberId);
  const currentSummary = summaries.find((summary) => summary.memberId === currentMember?.id) ?? null;
  const canViewRanking = currentMember?.role === "captain" || currentMember?.role === "admin";
  const isAdmin = currentMember?.role === "admin";

  const filteredLogs = useMemo(() => {
    if (!canViewRanking || !logMemberFilterId) {
      return logs;
    }

    return logs.filter((log) => log.memberId === logMemberFilterId);
  }, [canViewRanking, logMemberFilterId, logs]);

  const filteredLogMemberName =
    canViewRanking && logMemberFilterId
      ? members.find((member) => member.id === logMemberFilterId)?.displayName || null
      : null;

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

  const monthlyPointSeries = useMemo(() => {
    if (!currentMember) {
      return [];
    }

    return buildMonthlyPointSeries(logs, pointEntries, currentMember.id);
  }, [currentMember, logs, pointEntries]);

  useEffect(() => {
    if (currentMember && !editingPointEntryId) {
      setPointDraft((current) => ({
        ...current,
        memberId: current.memberId || currentMember.id
      }));
    }
  }, [currentMember, editingPointEntryId]);

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

  async function refreshEverything() {
    await Promise.all([refreshMembers(), refreshViewerState()]);
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
        throw new Error(payload.error || "Excel出力に失敗しました。");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") || "";
      const fileNameMatch = contentDisposition.match(/filename="?(?<name>[^"]+)"?/);
      const fileName = decodeURIComponent(fileNameMatch?.groups?.name || "mushi-observations.xls");
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);

      setStatusMessage("観察ログをExcel形式で出力しました。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Excel出力に失敗しました。");
    } finally {
      setIsExporting(false);
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
      latitude: current.latitude,
      longitude: current.longitude,
      species: parsed.species || current.species,
      points: parsed.points !== null ? String(parsed.points) : current.points,
      scoringMemo: parsed.scoringMemo || current.scoringMemo
    }));

    const found = [
      parsed.species ? `種名: ${parsed.species}` : "",
      parsed.points !== null ? `ポイント: ${parsed.points}P` : "",
      parsed.location ? `場所: ${parsed.location}` : "",
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
      setStatusMessage(`${payload.member.displayName} さんでログインしました。`);
      setActiveTab("home");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "ログインに失敗しました。");
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
      setSummaries([]);
      setLogMemberFilterId(null);
      setPointMemberFilterId(null);
      setLoginPasscode("");
      setAccountDisplayName("");
      setAccountPasscode("");
      setIsAuthPanelOpen(false);
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
      setStatusMessage("表示名と合言葉を更新しました。");
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

    await refreshViewerState();
    setDraft(getDefaultObservationDraft());
    setLinePaste("");
    setParseStatus(defaultParseStatus);
    setStatusMessage("観察ログを保存しました。");
    setActiveTab("logs");
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
      latitude: draft.latitude,
      longitude: draft.longitude,
      species: parsed.species || draft.species,
      points: parsed.points !== null ? String(parsed.points) : draft.points,
      scoringMemo: parsed.scoringMemo || draft.scoringMemo
    };

    const missing = [
      !nextDraft.species ? "種名" : "",
      !nextDraft.location ? "場所" : "",
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
    setEditingLogId(log.id);
    setEditingLogDraft({
      observedAt: toLocalInputValue(new Date(log.observedAt)),
      location: log.location,
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
            <p className="helper-text">
              隊員ごとの観察ログ、追加ポイント、ランキングをひとつの画面で管理できます。
            </p>
          </div>

          <div className="auth-buttons">
            <button type="button" className="secondary-button" onClick={() => setIsAuthPanelOpen(true)}>
              {currentMember ? `${currentMember.displayName}` : "ログイン"}
            </button>
            {currentMember ? (
              <button type="button" className="ghost-button" onClick={handleLogout}>
                ログアウト
              </button>
            ) : null}
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

      {isAuthPanelOpen ? (
        <div className="auth-overlay" onClick={() => setIsAuthPanelOpen(false)}>
          <section className="session-panel auth-panel" onClick={(event) => event.stopPropagation()}>
            <div className="auth-panel-head">
              <div>
                <p className="section-label">Account</p>
                <h2>{currentMember ? "アカウント設定" : "ログイン"}</h2>
              </div>
              <button type="button" className="ghost-button" onClick={() => setIsAuthPanelOpen(false)}>
                閉じる
              </button>
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

            <section className="auth-section">
              <p className="section-label">Join</p>
              <form className="registration-box" onSubmit={handleRegister}>
                <label>
                  新しい隊員名
                  <input
                    type="text"
                    placeholder="例: たろう"
                    value={registerDraft.displayName}
                    onChange={(event) => setRegisterDraft((current) => ({ ...current, displayName: event.target.value }))}
                  />
                </label>

                <label>
                  合言葉
                  <input
                    type="password"
                    placeholder="4文字以上"
                    value={registerDraft.passcode}
                    onChange={(event) => setRegisterDraft((current) => ({ ...current, passcode: event.target.value }))}
                  />
                </label>

                <div className="session-actions">
                  <button type="submit" className="secondary-button" disabled={isRegistering}>
                    {isRegistering ? "登録中..." : "隊員を追加"}
                  </button>
                </div>
              </form>
            </section>

            {currentMember ? (
              <section className="auth-section">
                <p className="section-label">My Account</p>
                <form className="account-form" onSubmit={handleAccountUpdate}>
                  <label>
                    表示名
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
                      {isAccountSaving ? "更新中..." : "表示名と合言葉を更新"}
                    </button>
                  </div>
                </form>
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
                  <StatCard label="合計ポイント" value={`${currentSummary.totalPoints}P`} />
                  <StatCard label="観察ポイント" value={`${currentSummary.observationPoints}P`} />
                  <StatCard label="追加ポイント" value={`${currentSummary.extraPoints}P`} />
                  <StatCard label="追加回数" value={`${currentSummary.pointEntryCount}件`} />
                </div>
              ) : null}

              <div className="home-copy">
                <p>自分の集計や最近の状況をここで確認できます。</p>
                <p>ランキングは隊長と Admin だけが見られます。</p>
              </div>

              <MonthlyTrendChart data={monthlyPointSeries} />

              {canViewRanking ? (
                <div className="ranking-list">
                  {summaries.map((summary, index) => (
                    <article
                      key={summary.memberId}
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
                          {summary.recordCount}件 / 追加{summary.pointEntryCount}件
                        </p>
                      </div>
                      <div className="ranking-points">{summary.totalPoints}P</div>
                    </article>
                  ))}
                </div>
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
                  場所
                  <input
                    type="text"
                    placeholder="例: 呉市焼山"
                    value={draft.location}
                    onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))}
                    required
                  />
                </label>

                <div className="full-width map-field">
                  <MapCoordinatePicker
                    latitude={draft.latitude}
                    longitude={draft.longitude}
                    onChange={(coords) =>
                      setDraft((current) => ({
                        ...current,
                        latitude: coords.latitude,
                        longitude: coords.longitude
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

                <div className="toolbar-row">
                  {canViewRanking ? (
                    <label>
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
                    onClick={handleExportLogs}
                    disabled={isExporting || filteredLogs.length === 0}
                  >
                    {isExporting ? "Excel出力中..." : "Excel出力"}
                  </button>
                </div>
              </div>

              <div className="record-list">
                {filteredLogs.length === 0 ? <p className="helper-text">まだ観察ログがありません。</p> : null}
                {filteredLogs.map((log) => {
                  const memberName = members.find((member) => member.id === log.memberId)?.displayName || "不明";
                  const canManage = canManageMemberData(log.memberId);

                  return (
                    <article key={log.id} className="record-card">
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
                            場所
                            <input
                              type="text"
                              value={editingLogDraft.location}
                              onChange={(event) =>
                                setEditingLogDraft((current) => ({ ...current, location: event.target.value }))
                              }
                            />
                          </label>
                          <div className="full-width map-field">
                            <MapCoordinatePicker
                              latitude={editingLogDraft.latitude}
                              longitude={editingLogDraft.longitude}
                              onChange={(coords) =>
                                setEditingLogDraft((current) => ({
                                  ...current,
                                  latitude: coords.latitude,
                                  longitude: coords.longitude
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
                            <div className="point-badge">{log.points}P</div>
                          </div>

                          <p className="record-location">{log.location}</p>
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

                          {canManage ? (
                            <div className="inline-actions">
                              <button type="button" className="secondary-button" onClick={() => startEditingLog(log)}>
                                編集
                              </button>
                              <button type="button" className="ghost-button" onClick={() => handleDeleteLog(log)}>
                                削除
                              </button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
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
                        <div className="point-badge">{entry.points}P</div>
                      </div>

                      <p className="record-memo">{entry.description || "説明なし"}</p>

                      {canManage ? (
                        <div className="inline-actions">
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
            右上のログインボタンから入ると、ホーム・観察登録・観察ログ・追加ポイントが使えるようになります。
          </p>
        </section>
      )}
    </div>
  );
}

function MapCoordinatePicker({
  latitude,
  longitude,
  onChange
}: {
  latitude: string;
  longitude: string;
  onChange: (coords: { latitude: string; longitude: string }) => void;
}) {
  const defaultCenter = parseCoordinates(latitude, longitude) ?? { latitude: 34.3963, longitude: 132.4596 };
  const [center, setCenter] = useState(defaultCenter);
  const zoom = 11;
  const tile = latLngToTile(center.latitude, center.longitude, zoom);
  const marker = parseCoordinates(latitude, longitude);
  const markerPosition = marker ? projectToTilePixels(marker.latitude, marker.longitude, zoom, tile.x, tile.y) : null;

  useEffect(() => {
    const nextCenter = parseCoordinates(latitude, longitude);
    if (nextCenter) {
      setCenter(nextCenter);
    }
  }, [latitude, longitude]);

  function moveMap(direction: "north" | "south" | "east" | "west") {
    const step = 0.18;
    setCenter((current) => ({
      latitude: clampLatitude(
        direction === "north" ? current.latitude + step : direction === "south" ? current.latitude - step : current.latitude
      ),
      longitude: normalizeLongitude(
        direction === "east" ? current.longitude + step : direction === "west" ? current.longitude - step : current.longitude
      )
    }));
  }

  function handleMapClick(event: ReactMouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 256;
    const y = ((event.clientY - rect.top) / rect.height) * 256;
    const coords = tilePixelsToLatLng(tile.x, tile.y, zoom, x, y);
    onChange({
      latitude: coords.latitude.toFixed(6),
      longitude: coords.longitude.toFixed(6)
    });
  }

  return (
    <div className="coordinate-picker">
      <div className="coordinate-picker-head">
        <div>
          <p className="section-label">Map</p>
          <strong>地図から座標を選ぶ</strong>
        </div>
        <p className="helper-text">任意項目です。地図をタップすると緯度経度が入ります。</p>
      </div>

      <div className="map-controls">
        <button type="button" className="secondary-button" onClick={() => moveMap("north")}>
          北
        </button>
        <button type="button" className="secondary-button" onClick={() => moveMap("west")}>
          西
        </button>
        <button type="button" className="secondary-button" onClick={() => moveMap("east")}>
          東
        </button>
        <button type="button" className="secondary-button" onClick={() => moveMap("south")}>
          南
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => onChange({ latitude: "", longitude: "" })}
        >
          座標をクリア
        </button>
      </div>

      <div className="map-canvas" onClick={handleMapClick} role="button" tabIndex={0}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`}
          alt="地図"
          className="map-tile"
        />
        {markerPosition ? (
          <span
            className="map-marker"
            style={{
              left: `${Math.max(0, Math.min(100, (markerPosition.x / 256) * 100))}%`,
              top: `${Math.max(0, Math.min(100, (markerPosition.y / 256) * 100))}%`
            }}
          />
        ) : null}
      </div>

      <div className="coordinate-inputs">
        <label>
          緯度
          <input
            type="number"
            step="0.000001"
            placeholder="例: 34.396300"
            value={latitude}
            onChange={(event) => onChange({ latitude: event.target.value, longitude })}
          />
        </label>
        <label>
          経度
          <input
            type="number"
            step="0.000001"
            placeholder="例: 132.459600"
            value={longitude}
            onChange={(event) => onChange({ latitude, longitude: event.target.value })}
          />
        </label>
      </div>
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

function projectToTilePixels(latitude: number, longitude: number, zoom: number, tileX: number, tileY: number) {
  const scale = 2 ** zoom;
  const latRad = (latitude * Math.PI) / 180;
  const worldX = ((longitude + 180) / 360) * scale * 256;
  const worldY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale * 256;

  return {
    x: worldX - tileX * 256,
    y: worldY - tileY * 256
  };
}

function tilePixelsToLatLng(tileX: number, tileY: number, zoom: number, pixelX: number, pixelY: number) {
  const scale = 2 ** zoom;
  const worldX = tileX * 256 + pixelX;
  const worldY = tileY * 256 + pixelY;
  const longitude = (worldX / (256 * scale)) * 360 - 180;
  const mercatorY = Math.PI - (2 * Math.PI * worldY) / (256 * scale);
  const latitude = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(mercatorY) - Math.exp(-mercatorY)));

  return { latitude, longitude };
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
