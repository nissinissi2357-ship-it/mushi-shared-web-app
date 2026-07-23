"use client";

import { useMemo, useState } from "react";
import {
  HIROSHIMA_MAP_VIEWBOX,
  HIROSHIMA_MUNICIPALITY_PATHS
} from "@/lib/hiroshima-map-paths";
import { KURE_MAP_PATHS, KURE_MAP_VIEWBOX } from "@/lib/kure-map-paths";
import { buildAreaCounts, buildMapPeriodOptions, type MemberProfile } from "@/lib/profile";
import type { ObservationLog } from "@/lib/types";

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

type MapRegion = {
  name: string;
  d: string;
  transform?: string;
  labelX?: number;
  labelY?: number;
};

function ChoroplethMap({
  paths,
  viewBox,
  counts,
  max,
  ariaLabel,
  showLabels = false
}: {
  paths: MapRegion[];
  viewBox: { width: number; height: number };
  counts: Record<string, number>;
  max: number;
  ariaLabel: string;
  showLabels?: boolean;
}) {
  return (
    <svg
      className="profile-map"
      viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
      role="img"
      aria-label={ariaLabel}
    >
      {paths.map((region) => {
        const count = counts[region.name] ?? 0;
        return (
          <path
            key={region.name}
            d={region.d}
            transform={region.transform}
            fill={regionFill(count, max)}
            className="profile-map-region"
          >
            <title>
              {region.name}: {count}件
            </title>
          </path>
        );
      })}
      {showLabels
        ? paths.map((region) => {
            const count = counts[region.name] ?? 0;
            if (count <= 0 || region.labelX == null || region.labelY == null) {
              return null;
            }
            return (
              <text
                key={`label-${region.name}`}
                x={region.labelX}
                y={region.labelY}
                textAnchor="middle"
                className="profile-map-label"
              >
                <tspan x={region.labelX} dy={0}>
                  {region.name}
                </tspan>
                <tspan x={region.labelX} dy={18} className="profile-map-label-count">
                  {count}件
                </tspan>
              </text>
            );
          })
        : null}
    </svg>
  );
}

// 出典クレジット(全県マップ = 国土数値情報)。
export function HiroshimaMapCaption() {
  return (
    <p className="map-caption">
      「国土数値情報（行政区域データ）」（国土交通省）（
      <a
        href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html"
        target="_blank"
        rel="noopener noreferrer"
      >
        https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html
      </a>
      ）を加工して作成
    </p>
  );
}

// 出典クレジット(呉市マップ = 国勢調査 e-Stat)。
export function KureMapCaption() {
  return (
    <p className="map-caption">
      『国勢調査町丁・字等別境界データセット』「令和2年国勢調査町丁・字等別境界データ」（e-Stat）を加工して作成
    </p>
  );
}

// 全県マップ(市町村単位)＋凡例＋出典。ホーム画面とプロフィールの両方で使う。
export function HiroshimaCountMap({ counts, max }: { counts: Record<string, number>; max: number }) {
  return (
    <>
      <ChoroplethMap
        paths={HIROSHIMA_MUNICIPALITY_PATHS}
        viewBox={HIROSHIMA_MAP_VIEWBOX}
        counts={counts}
        max={max}
        ariaLabel="観察地域の分布地図（広島県・市町村別）"
        showLabels
      />
      <MapLegend max={max} />
      <HiroshimaMapCaption />
    </>
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
  logs,
  onClose,
  onViewLogs
}: {
  profile: MemberProfile;
  logs: ObservationLog[];
  onClose: () => void;
  onViewLogs: () => void;
}) {
  const roleLabel = ROLE_LABEL[profile.member.role] ?? "隊員";

  const memberLogs = useMemo(
    () => logs.filter((log) => log.memberId === profile.member.id),
    [logs, profile.member.id]
  );
  const periodOptions = useMemo(() => buildMapPeriodOptions(memberLogs), [memberLogs]);
  const [mapPeriod, setMapPeriod] = useState(
    () => periodOptions.find((option) => option.value.startsWith("year:"))?.value ?? periodOptions[0]?.value ?? ""
  );
  const activePeriod = periodOptions.some((option) => option.value === mapPeriod)
    ? mapPeriod
    : periodOptions[0]?.value ?? "";
  const areaCounts = useMemo(
    () => buildAreaCounts(logs, { period: activePeriod, memberId: profile.member.id }),
    [logs, activePeriod, profile.member.id]
  );

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
          <div className="profile-section-head map-section-head">
            <div>
              <h3>観察地域の分布（広島県）</h3>
              <p className="helper-text">
                広島県内の市町村を、観察件数が多いほど濃い色で表示します。
              </p>
            </div>
            <label className="map-period-label">
              期間
              <select value={activePeriod} onChange={(event) => setMapPeriod(event.target.value)}>
                {periodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {areaCounts.municipalityMax === 0 ? (
            <p className="helper-text">この期間の観察記録はありません。</p>
          ) : (
            <HiroshimaCountMap counts={areaCounts.municipalityCounts} max={areaCounts.municipalityMax} />
          )}
        </div>

        {KURE_MAP_PATHS.length > 0 ? (
          <div className="profile-section">
            <div className="profile-section-head">
              <h3>呉市内の分布</h3>
              <p className="helper-text">呉市の地域を、観察件数が多いほど濃い色で表示します。</p>
            </div>
            {areaCounts.kureSublocationMax === 0 ? (
              <p className="helper-text">この期間の呉市内の観察記録はありません。</p>
            ) : (
              <>
                <ChoroplethMap
                  paths={KURE_MAP_PATHS}
                  viewBox={KURE_MAP_VIEWBOX}
                  counts={areaCounts.kureSublocationCounts}
                  max={areaCounts.kureSublocationMax}
                  ariaLabel="観察地域の分布地図（呉市内）"
                  showLabels
                />
                <MapLegend max={areaCounts.kureSublocationMax} />
                <KureMapCaption />
              </>
            )}
          </div>
        ) : null}

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
