"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { formatDateTime } from "@/lib/format";
import { resizeImageBeforeUpload } from "@/lib/image";
import { parseCaptainMessage } from "@/lib/line-parser";
import type {
  InitialViewerState,
  LoginResult,
  Member,
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

function getDefaultDraft(): DraftObservation {
  return {
    observedAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    location: "",
    species: "",
    points: "",
    scoringMemo: ""
  };
}

export function AppShell({ initialMembers, source, warning, initialViewer }: AppShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [selectedMemberId, setSelectedMemberId] = useState(initialViewer?.member.id ?? initialMembers[0]?.id ?? "");
  const [loginPasscode, setLoginPasscode] = useState("");
  const [currentMember, setCurrentMember] = useState<Member | null>(initialViewer?.member ?? null);
  const [logs, setLogs] = useState<ObservationLog[]>(initialViewer?.logs ?? []);
  const [summaries, setSummaries] = useState<MemberSummary[]>(initialViewer?.summaries ?? []);
  const [draftPhotoMessage, setDraftPhotoMessage] = useState("写真は長辺1600px、JPEG品質0.75を目安に縮小してから保存します。");
  const [draft, setDraft] = useState<DraftObservation>(getDefaultDraft);
  const [linePaste, setLinePaste] = useState("");
  const [parseStatus, setParseStatus] = useState("隊長メッセージを貼ると、日時・場所・種名・ポイントを自動入力できます。");
  const [registerDraft, setRegisterDraft] = useState<RegisterDraft>({ displayName: "", passcode: "" });
  const [statusMessage, setStatusMessage] = useState<string | null>(warning);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const selectedMember = members.find((member) => member.id === selectedMemberId);
  const currentSummary = summaries.find((summary) => summary.memberId === currentMember?.id);
  const canViewRanking = currentMember?.role === "captain" || currentMember?.role === "admin";

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

      setCurrentMember(payload.member);
      setSelectedMemberId(payload.member.id);
      setLogs(payload.logs);
      setSummaries(payload.summaries);
      setLoginPasscode("");
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
      setLoginPasscode("");
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

      setMembers((current) => [...current, payload.member as Member]);
      setSelectedMemberId(payload.member.id);
      setRegisterDraft({ displayName: "", passcode: "" });
      setStatusMessage(`${payload.member.displayName} さんを追加しました。続けてログインできます。`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "隊員登録に失敗しました。");
    } finally {
      setIsRegistering(false);
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

    const nextLogs = [payload.log, ...logs];
    const nextSummaries = canViewRanking
      ? rebuildSummaries(members, nextLogs)
      : currentMember
        ? rebuildSummaries([currentMember], nextLogs)
        : summaries;

    setLogs(nextLogs);
    setSummaries(nextSummaries);
    setDraft(getDefaultDraft());
    setLinePaste("");
    setParseStatus("隊長メッセージを貼ると、日時・場所・種名・ポイントを自動入力できます。");
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
      setDraft(nextDraft);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "観察ログの保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <p className="eyebrow">Shared Edition</p>
        <h1>ムシムシ探検隊ログ</h1>
        <p className="hero-copy">
          ログインした隊員だけが自分のホームと観察ログを見られる共有版です。
        </p>

        <section className="session-panel">
          <div>
            <p className="section-label">Member</p>
            <h2>{currentMember ? `${currentMember.displayName} さんのホーム` : "ログインしてください"}</h2>
          </div>

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
                    {member.displayName} ({member.role === "captain" ? "隊長" : member.role === "admin" ? "管理者" : "隊員"})
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
              <button type="button" className="primary-button" onClick={handleLogin} disabled={isLoggingIn || !selectedMember}>
                {isLoggingIn ? "確認中..." : "ログイン"}
              </button>
              <button type="button" className="ghost-button" onClick={handleLogout} disabled={!currentMember}>
                ログアウト
              </button>
            </div>
          </div>

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

          <p className="helper-text">データソース: {source === "supabase" ? "Supabase" : "フォールバック表示"}</p>
          {statusMessage ? <p className="helper-text">{statusMessage}</p> : null}
        </section>

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
                  ? "管理者"
                  : currentMember
                    ? "隊員"
                    : "未ログイン"
            }
          />
        </div>
      </header>

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
                <p>ランキングは隊長と管理者だけが見える仕様です。</p>
              </div>

              {canViewRanking ? (
                <div className="ranking-list">
                  {summaries.map((summary, index) => (
                    <article key={summary.memberId} className="ranking-item">
                      <span className="ranking-rank">{index + 1}</span>
                      <div>
                        <p className="ranking-name">{summary.displayName}</p>
                        <p className="ranking-meta">
                          {summary.role === "captain" ? "隊長" : summary.role === "admin" ? "管理者" : "隊員"} / {summary.recordCount}件
                        </p>
                      </div>
                      <div className="ranking-points">{summary.totalPoints}P</div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="helper-text">ランキングは隊長または管理者だけが見えます。</p>
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
                      setParseStatus("隊長メッセージを貼ると、日時・場所・種名・ポイントを自動入力できます。");
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
                </div>
              </div>

              <div className="record-list">
                {logs.length === 0 ? <p className="helper-text">まだ観察ログがありません。</p> : null}
                {logs.map((log) => (
                  <LogCard key={log.id} log={log} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function rebuildSummaries(allMembers: Member[], allLogs: ObservationLog[]) {
  return allMembers
    .map((member) => {
      const memberLogs = allLogs.filter((log) => log.memberId === member.id);
      const sortedLogs = [...memberLogs].sort((left, right) => right.observedAt.localeCompare(left.observedAt));

      return {
        memberId: member.id,
        displayName: member.displayName,
        role: member.role,
        totalPoints: memberLogs.reduce((sum, log) => sum + log.points, 0),
        recordCount: memberLogs.length,
        latestObservedAt: sortedLogs[0]?.observedAt ?? null
      };
    })
    .sort((left, right) => {
      if (right.totalPoints !== left.totalPoints) {
        return right.totalPoints - left.totalPoints;
      }

      return right.recordCount - left.recordCount;
    });
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function LogCard({ log }: { log: ObservationLog }) {
  return (
    <article className="record-card">
      <div className="record-top">
        <div>
          <p className="record-meta">{formatDateTime(log.observedAt)}</p>
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
