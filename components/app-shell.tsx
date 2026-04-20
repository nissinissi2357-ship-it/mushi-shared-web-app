"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
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
  TabId
} from "@/lib/types";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "home", label: "ホーム" },
  { id: "record", label: "観察登録" },
  { id: "logs", label: "観察ログ" }
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
  species: string;
  points: string;
  scoringMemo: string;
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

function getDefaultDraft(): DraftObservation {
  return {
    observedAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    location: "",
    species: "",
    points: "",
    scoringMemo: ""
  };
}

function buildRoleDrafts(members: Member[]) {
  return Object.fromEntries(members.map((member) => [member.id, member.role])) as Record<string, MemberRole>;
}

const defaultParseStatus =
  "隊長メッセージを貼ると、日時・場所・種名・ポイントを自動入力できます。";

export function AppShell({ initialMembers, source, warning, initialViewer }: AppShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [selectedMemberId, setSelectedMemberId] = useState(initialViewer?.member.id ?? initialMembers[0]?.id ?? "");
  const [loginPasscode, setLoginPasscode] = useState("");
  const [currentMember, setCurrentMember] = useState<Member | null>(initialViewer?.member ?? null);
  const [logs, setLogs] = useState<ObservationLog[]>(initialViewer?.logs ?? []);
  const [summaries, setSummaries] = useState<MemberSummary[]>(initialViewer?.summaries ?? []);
  const [draftPhotoMessage, setDraftPhotoMessage] = useState(
    "写真は長辺1600px、JPEG品質0.75を目安に縮小してから保存します。"
  );
  const [draft, setDraft] = useState<DraftObservation>(getDefaultDraft);
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
  const [isExporting, setIsExporting] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isAccountSaving, setIsAccountSaving] = useState(false);
  const [isAdminSaving, setIsAdminSaving] = useState(false);
  const [logMemberFilterId, setLogMemberFilterId] = useState<string | null>(null);
  const [isAuthPanelOpen, setIsAuthPanelOpen] = useState(false);

  const selectedMember = members.find((member) => member.id === selectedMemberId);
  const currentSummary = summaries.find((summary) => summary.memberId === currentMember?.id);
  const canViewRanking = currentMember?.role === "captain" || currentMember?.role === "admin";
  const isAdmin = currentMember?.role === "admin";
  const filteredLogs =
    canViewRanking && logMemberFilterId
      ? logs.filter((log) => log.memberId === logMemberFilterId)
      : logs;
  const filteredLogMemberName =
    canViewRanking && logMemberFilterId
      ? members.find((member) => member.id === logMemberFilterId)?.displayName || null
      : null;

  function applyMembers(nextMembers: Member[]) {
    setMembers(nextMembers);
    setAdminRoleDrafts(buildRoleDrafts(nextMembers));
    setSelectedMemberId((current) =>
      nextMembers.some((member) => member.id === current) ? current : (nextMembers[0]?.id ?? "")
    );
    setLogMemberFilterId((current) =>
      current && nextMembers.some((member) => member.id === current) ? current : null
    );
  }

  function applyViewerPayload(payload: LoginResult) {
    setCurrentMember(payload.member);
    setSelectedMemberId(payload.member.id);
    setLogs(payload.logs);
    setSummaries(payload.summaries);
    setAccountDisplayName(payload.member.displayName);
    setAccountPasscode("");

    if (!(payload.member.role === "captain" || payload.member.role === "admin")) {
      setLogMemberFilterId(null);
    }
  }

  async function refreshMembers() {
    const response = await fetch("/api/members", {
      method: "GET",
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
      setDraftPhotoMessage("写真は長辺1600px、JPEG品質0.75を目安に縮小してから保存します。");
      return;
    }

    const resized = await resizeImageBeforeUpload(file);
    const beforeKb = Math.round(file.size / 1024);
    const afterKb = Math.round(resized.size / 1024);
    setDraftPhotoMessage(`${file.name} を圧縮予定です。${beforeKb}KB → ${afterKb}KB`);
  }

  function applyParsedToDraft(rawText: string) {
    const parsed = parseCaptainMessage(rawText);

    setDraft((current) => ({
      observedAt: parsed.observedAt || current.observedAt,
      location: parsed.location || current.location,
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

    if (found.length === 0) {
      setParseStatus("読み取れる項目が見つかりませんでした。本文を少し長めに貼ると精度が上がります。");
    } else {
      setParseStatus(`自動入力しました。${found.join(" / ")}`);
    }

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
      setSummaries([]);
      setLogMemberFilterId(null);
      setLoginPasscode("");
      setAccountDisplayName("");
      setAccountPasscode("");
      setIsAuthPanelOpen(false);
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
      setStatusMessage("名前と合言葉を更新しました。");
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
        throw new Error(payload.error || "Admin アカウント作成に失敗しました。");
      }

      await refreshEverything();
      setAdminCreateDraft({ displayName: "", passcode: "", role: "member" });
      setStatusMessage(`${payload.member.displayName} さんのアカウントを作成しました。`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Admin アカウント作成に失敗しました。");
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

      const payload = (await response.json()) as { member?: Member; error?: string };
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
        throw new Error(payload.error || "合言葉リセットに失敗しました。");
      }

      await refreshEverything();
      setStatusMessage("合言葉を 0000 にリセットしました。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "合言葉リセットに失敗しました。");
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
    setDraft(getDefaultDraft());
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
      setParseStatus("まず隊長メッセージを貼り付けてください。");
      return;
    }

    const parsed = applyParsedToDraft(rawText);
    const nextDraft: DraftObservation = {
      observedAt: parsed.observedAt || draft.observedAt,
      location: parsed.location || draft.location,
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
      setParseStatus(`まだ ${missing.join("・")} が足りません。必要なところだけ手入力してください。`);
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

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-top">
          <div>
            <p className="eyebrow">Shared Edition</p>
            <h1>ムシムシ探検隊ログ</h1>
          </div>

          <div className="auth-buttons">
            {currentMember ? (
              <>
                <button type="button" className="secondary-button" onClick={() => setIsAuthPanelOpen(true)}>
                  {currentMember.displayName}
                </button>
                <button type="button" className="ghost-button" onClick={handleLogout}>
                  ログアウト
                </button>
              </>
            ) : (
              <button type="button" className="primary-button" onClick={() => setIsAuthPanelOpen(true)}>
                ログイン
              </button>
            )}
          </div>
        </div>

        <p className="hero-copy">
          ログインした隊員だけが自分のホームと観察ログを見られる共有版です。
        </p>
        {statusMessage ? <p className="helper-text">{statusMessage}</p> : null}

        <div className="hero-stats">
          <StatCard label="あなたのポイント" value={`${currentSummary?.totalPoints ?? 0}P`} />
          <StatCard label="登録件数" value={`${currentSummary?.recordCount ?? 0}件`} />
          <StatCard label="最新観察" value={formatDateTime(currentSummary?.latestObservedAt ?? null)} />
          <StatCard
            label="権限"
            value={
              currentMember?.role === "captain"
                ? "隊長"
                : currentMember?.role === "admin"
                  ? "Admin"
                  : currentMember
                    ? "隊員"
                    : "未ログイン"
            }
          />
        </div>
      </header>

      {isAuthPanelOpen ? (
        <div className="auth-overlay" onClick={() => setIsAuthPanelOpen(false)}>
          <section className="session-panel auth-panel" onClick={(event) => event.stopPropagation()}>
            <div className="auth-panel-head">
              <div>
                <p className="section-label">Auth</p>
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
                    {isLoggingIn ? "確認中..." : "ログイン"}
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
                    {isRegistering ? "登録中..." : "隊員を登録"}
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
                      {isAccountSaving ? "更新中..." : "名前と合言葉を変更"}
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

              <div className="home-copy">
                <p>ログイン中の隊員の集計だけを表示しています。</p>
                <p>ランキングは隊長と Admin だけが見える仕様です。</p>
              </div>

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
                          {summary.role === "captain" ? "隊長" : summary.role === "admin" ? "Admin" : "隊員"} / {summary.recordCount}件
                        </p>
                      </div>
                      <div className="ranking-points">{summary.totalPoints}P</div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="helper-text">ランキングは隊長または Admin だけが見えます。</p>
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
                        setParseStatus("まず隊長メッセージを貼り付けてください。");
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
                    placeholder="例: 呉市1年ぶり、旧呉市初、呉市🟪、広島県🟪…8P"
                    value={draft.scoringMemo}
                    onChange={(event) => setDraft((current) => ({ ...current, scoringMemo: event.target.value }))}
                  />
                </label>

                <label>
                  写真
                  <input type="file" accept="image/*" onChange={handlePhotoChange} />
                </label>
                <p className="helper-text">{draftPhotoMessage}</p>

                <label>
                  図鑑PDF
                  <input type="file" accept="application/pdf" disabled />
                </label>
                <p className="helper-text">写真とPDFの共有保存は次の段階でつなぎます。</p>

                <div className="form-actions full-width">
                  <button type="submit" className="primary-button" disabled={isSaving}>
                    {isSaving ? "保存中..." : "保存する"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setDraft(getDefaultDraft());
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
                  {filteredLogMemberName ? (
                    <p className="helper-text">{filteredLogMemberName} さんの観察ログを表示中です。</p>
                  ) : null}
                </div>
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
              </div>

              <div className="logs-export-bar">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleExportLogs}
                  disabled={isExporting || filteredLogs.length === 0}
                >
                  {isExporting ? "Excel出力中..." : "Excel出力"}
                </button>
              </div>

              <div className="record-list">
                {filteredLogs.length === 0 ? <p className="helper-text">まだ観察ログがありません。</p> : null}
                {filteredLogs.map((log) => (
                  <LogCard
                    key={log.id}
                    log={log}
                    memberName={
                      canViewRanking
                        ? members.find((member) => member.id === log.memberId)?.displayName || "不明"
                        : null
                    }
                  />
                ))}
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
            右上のログインボタンから入ると、ホーム・観察登録・観察ログが使えるようになります。
          </p>
        </section>
      )}
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

function LogCard({ log, memberName }: { log: ObservationLog; memberName?: string | null }) {
  return (
    <article className="record-card">
      <div className="record-top">
        <div>
          <p className="record-meta">{formatDateTime(log.observedAt)}</p>
          {memberName ? <p className="record-meta">{memberName}</p> : null}
          <h3 className="record-species">{log.species}</h3>
        </div>
        <div className="point-badge">{log.points}P</div>
      </div>

      <p className="record-location">{log.location}</p>
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
    </article>
  );
}
