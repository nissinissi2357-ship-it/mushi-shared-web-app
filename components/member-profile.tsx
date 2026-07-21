import { KURE_REGION_ORDER, type MemberProfile } from "@/lib/profile";

// 呉エリア簡略地図における各地域の中心座標（viewBox 360 x 300 上のスキーマ配置）。
// 西→東・沿岸→内陸・南の島しょ部という実際の位置関係を模式化したもので、
// 測量的に正確な海岸線ではない点に注意。
const REGION_POSITIONS: Record<string, { x: number; y: number }> = {
  呉市天応吉浦: { x: 42, y: 96 },
  呉市郷原: { x: 122, y: 44 },
  呉市焼山: { x: 122, y: 96 },
  呉市灰ヶ峰: { x: 110, y: 140 },
  呉市旧呉市: { x: 78, y: 176 },
  呉市広阿賀: { x: 182, y: 150 },
  呉市野呂山: { x: 216, y: 90 },
  呉市仁方: { x: 212, y: 180 },
  呉市川尻: { x: 264, y: 148 },
  呉市安浦: { x: 316, y: 118 },
  呉市音戸: { x: 80, y: 232 },
  呉市倉橋: { x: 96, y: 276 },
  呉市下蒲刈: { x: 184, y: 238 },
  呉市上蒲刈: { x: 238, y: 250 },
  呉市豊島: { x: 292, y: 256 },
  呉市大崎下島: { x: 330, y: 284 }
};

const TILE_WIDTH = 52;
const TILE_HEIGHT = 28;

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

function regionTextColor(count: number, max: number): string {
  const ratio = max > 0 ? count / max : 0;
  return count > 0 && ratio > 0.55 ? "#ffffff" : "#26331f";
}

function KureAreaMap({
  counts,
  max
}: {
  counts: Record<string, number>;
  max: number;
}) {
  const width = 360;
  const height = 300;

  return (
    <svg
      className="profile-map"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="観察地域の分布地図（呉エリア）"
    >
      <rect x={0} y={0} width={width} height={height} rx={16} className="profile-map-sea" />
      <line x1={12} y1={204} x2={width - 12} y2={204} className="profile-map-divider" />
      <text x={16} y={22} className="profile-map-caption">
        本土
      </text>
      <text x={16} y={224} className="profile-map-caption">
        島しょ部
      </text>

      {KURE_REGION_ORDER.map((name) => {
        const pos = REGION_POSITIONS[name];
        if (!pos) {
          return null;
        }

        const count = counts[name] ?? 0;
        const label = name.replace(/^呉市/, "");
        const textColor = regionTextColor(count, max);

        return (
          <g key={name}>
            <rect
              x={pos.x - TILE_WIDTH / 2}
              y={pos.y - TILE_HEIGHT / 2}
              width={TILE_WIDTH}
              height={TILE_HEIGHT}
              rx={7}
              fill={regionFill(count, max)}
              className="profile-map-tile"
            />
            <text x={pos.x} y={pos.y - 1} textAnchor="middle" fontSize={10} fill={textColor}>
              {label}
            </text>
            <text
              x={pos.x}
              y={pos.y + 11}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill={textColor}
            >
              {count}
            </text>
          </g>
        );
      })}
    </svg>
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
            <p className="helper-text">呉エリアの地域を、観察件数が多いほど濃い色で表示します。</p>
          </div>
          {profile.kureTotal === 0 ? (
            <p className="helper-text">呉エリアの観察記録がまだありません。</p>
          ) : (
            <KureAreaMap counts={profile.kureRegionCounts} max={profile.kureRegionMax} />
          )}
          {profile.nonKureCounts.length > 0 ? (
            <p className="profile-nonkure">
              呉市外の観察:{" "}
              {profile.nonKureCounts.map((row) => `${row.label} ${row.count}件`).join(" / ")}
            </p>
          ) : null}
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
