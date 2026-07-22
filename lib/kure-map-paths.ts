// 呉市内の詳細地図。ユーザー作成の SVG(16地域)から生成して差し替える。
// name は観察記録の地域名(呉市を除いた短い名前)と一致させること:
// 旧呉市 / 天応吉浦 / 焼山 / 灰ヶ峰 / 広阿賀 / 仁方 / 野呂山 / 川尻 /
// 安浦 / 郷原 / 音戸 / 倉橋 / 下蒲刈 / 上蒲刈 / 豊島 / 大崎下島
// SVG が用意できるまでは空配列(呉市内マップのセクションは非表示になる)。
export const KURE_MAP_VIEWBOX = { width: 0, height: 0 } as const;
export type KureRegionPath = { name: string; d: string };
export const KURE_MAP_PATHS: KureRegionPath[] = [];
