import {
  HIROSHIMA_MAP_VIEWBOX,
  HIROSHIMA_MUNICIPALITY_PATHS
} from "@/lib/hiroshima-map-paths";
import type { MemberProfile } from "@/lib/profile";

// 件数の多寡を緑の濃淡へ変換する。0件は淡い中間色、多いほど濃い緑。
function regionFill(count: number, max: number): string {
  if (count <= 0) {
    return "#e7ebe1";
  }

  const ratio = max > 0 ? count / max : 0;
  const t = 0.2 + 0.8 * ratio;
  const light = { r: 200, g: 224, b: 197 };
  const dark = { r: 25, g: 74, b: 44 };
  const mix = (from: number, to: number) => Math.round(from + (to - from) * t);
  return `rgb(${mix(light.r, dark.r)}, ${mix(light.g, dark.g)}, ${mix(light.b, dark.b)})`;
}

function HiroshimaMap({
  counts,
  max
}: {
  counts: Record<string, number>;
  max: number;
}) {
  const { width, height } = HIROSHIMA_MAP_VIEWBOX;

  return (
    <svg
      className="profile-map"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="観察地域の分布地図（広島県・市町村別）"
    >
      {HIROSHIMA_MUNICIPALITY_PATHS.map((municipality) => {
        const count = counts[municipality.name] ?? 0;
        return (
          <path
            key={municipality.name}
            d={municipality.d}
            fill={regionFill(count, max)}
            className="profile-map-region"
          >
            <title>
              {municipality.name}: {count}件
            </title>
          </path>
        );
      })}
    </svg>
  );
}

function MapLegend({ max }: { max: number }) {
  if (max <= 0) {
    return null;
  }

  const stops = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="profile-map-legend">
      <span className="profile-map-legend-label">少ない</span>
      {stops.map((stop) => (
        <span
          key={stop}
          className="profile-map-legend-swatch"
          style={{ background: regionFill(Math.max(1, Math.round(stop * max)), max) }}
        />
      ))}
      <span className="profile-map-legend-label">多い（最大{max}件）</span>
    </div>
  );
}

function CountBars({ rows, emptyLabel }: { rows: { label: string; count: number }[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="helper-text">{emptyLabel}</p>;
  }

  const max = rows.reduce((value, row) => Math.max(value, row.count), 1);

  return (
    <div className="profile-bar-list">
      {rows.map((row, index) => (
        <div key={`${row.label}-${index}`} className="profile-bar-row">
          <span className="profile-bar-rank">{index + 1}</span>
          <span className="profile-bar-label">{row.label}</span>
          <span className="profile-bar-track">
            <span className="profile-bar-fill" style={{ width: `${(row.count / max) * 100}%` }} />
          </span>
          <span className="profile-bar-count">{row.count}件</span>
        </div>
      ))}
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  captain: "隊長",
  admin: "Admin",
  member: "隊員"
};

export function MemberProfileDialog({
  profile,
  onClose,
  onViewLogs
}: {
  profile: MemberProfile;
  onClose: () => void;
  onViewLogs: () => void;
}) {
  const roleLabel = ROLE_LABEL[profile.member.role] ?? "隊員";

  return (
    <div className="alert-overlay" onClick={onClose}>
      <section
        className="alert-panel profile-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="profile-head">
          <div>
            <p className="section-label">Profile</p>
            <h2>{profile.member.displayName}</h2>
            <p className="helper-text">{roleLabel}の観察実績レポート</p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="profile-stat-grid">
          <div className="profile-stat">
            <span className="profile-stat-label">これまでの観察</span>
            <strong className="profile-stat-value">{profile.totalCount}</strong>
            <span className="profile-stat-unit">件</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-label">今月の観察</span>
            <strong className="profile-stat-value">{profile.monthCount}</strong>
            <span className="profile-stat-unit">件</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-label">累積ポイント</span>
            <strong className="profile-stat-value">{profile.lifetimePoints}</strong>
            <span className="profile-stat-unit">P</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-label">今月のポイント</span>
            <strong className="profile-stat-value">{profile.monthPoints}</strong>
            <span className="profile-stat-unit">P</span>
          </div>
        </div>

        <div className="profile-section">
          <div className="profile-section-head">
            <h3>観察地域の分布</h3>
            <p className="helper-text">
              広島県内の市町村を、観察件数が多いほど濃い色で表示します。呉市内の内訳は下のベスト5で確認できます。
            </p>
          </div>
          {profile.municipalityMax === 0 ? (
            <p className="helper-text">地図に表示できる観察記録がまだありません。</p>
          ) : (
            <>
              <HiroshimaMap counts={profile.municipalityCounts} max={profile.municipalityMax} />
              <MapLegend max={profile.municipalityMax} />
            </>
          )}
        </div>

        <div className="profile-columns">
          <div className="profile-section">
            <div className="profile-section-head">
              <h3>観察地域ベスト5</h3>
            </div>
            <CountBars rows={profile.topLocations} emptyLabel="観察記録がまだありません。" />
          </div>

          <div className="profile-section">
            <div className="profile-section-head">
              <h3>分類群（目）ベスト5</h3>
            </div>
            <CountBars rows={profile.topOrders} emptyLabel="観察記録がまだありません。" />
          </div>
        </div>

        <div className="profile-actions">
          <button type="button" className="secondary-button" onClick={onViewLogs}>
            この隊員の観察ログを見る
          </button>
        </div>
      </section>
    </div>
  );
}
