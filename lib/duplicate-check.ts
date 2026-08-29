import type { ObservationLog } from "@/lib/types";

/**
 * 観察ログの二重登録を見つけるための照合。
 * 隊員・種名・観察場所・ポイント・観察日を突き合わせ、
 * 「同じ」だけでなく「似ている」記録も拾う。
 */

export type DuplicateLevel = "high" | "medium";

export type DuplicateCandidate = {
  log: ObservationLog;
  level: DuplicateLevel;
  score: number;
  /** 画面に出す一致理由。「種名が同じ」など。 */
  reasons: string[];
};

export type DuplicateCheckInput = {
  memberId: string;
  observedAt: string;
  location: string;
  locationDetail?: string | null;
  species: string;
  points: number;
};

export type DuplicateCheckOptions = {
  /** 編集中の記録を自分自身と照合しないための除外。 */
  excludeLogId?: string | null;
  limit?: number;
};

/**
 * 何日離れた記録まで候補にするか。
 * 本番3,622件を調べたところ、同じ隊員が同じ種を再び記録する間隔は
 * 0日から10日までほぼ横ばい（灯火採集で同じ場所を繰り返すため）だった。
 * つまり「数日空いた同じ種」は二重登録ではなく普通の再観察なので、
 * 警告は同日と翌日だけに絞る。
 */
const WINDOW_DAYS = 1;
/** これ以上なら「ほぼ同じ」。 */
const HIGH_SCORE = 82;
/** これ以上なら「似ている」。 */
const MEDIUM_SCORE = 66;
const MAX_CANDIDATES = 5;

function normalizeBase(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s　]/g, "")
    .replace(/[・･,、.]/g, "")
    .toLowerCase();
}

/** カタカナをひらがなに寄せて、表記ゆれを吸収する。 */
function toHiragana(value: string): string {
  return value.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

export function normalizeSpecies(value: string): string {
  return toHiragana(normalizeBase(value));
}

function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (!a.length) {
    return b.length;
  }
  if (!b.length) {
    return a.length;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }

  return previous[b.length];
}

export type SpeciesRelation = "same" | "similar" | "different";

export function compareSpecies(a: string, b: string): SpeciesRelation {
  const left = normalizeSpecies(a);
  const right = normalizeSpecies(b);

  if (!left || !right) {
    return "different";
  }
  if (left === right) {
    return "same";
  }

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;

  // 「ヨコヅナサシガメ」と「ヨコヅナサシガメ幼虫」のような包含。
  if (shorter.length >= 4 && longer.includes(shorter) && longer.length - shorter.length <= 4) {
    return "similar";
  }

  // 打ち間違いや一文字違い。
  if (shorter.length >= 4) {
    const distance = levenshtein(left, right);
    if (distance / longer.length <= 0.25) {
      return "similar";
    }
  }

  return "different";
}

export type LocationRelation = "same" | "near" | "different";

export function compareLocation(a: string, b: string): LocationRelation {
  const left = normalizeBase(a);
  const right = normalizeBase(b);

  if (!left || !right) {
    return "different";
  }
  if (left === right) {
    return "same";
  }
  // 「呉市」と「呉市倉橋」のような、片方が広い書き方の場合。
  if (left.startsWith(right) || right.startsWith(left)) {
    return "near";
  }

  return "different";
}

/** ローカル暦での通日。時刻の差では日付が変わらないようにする。 */
function toDayNumber(value: string): number | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

export function findDuplicateCandidates(
  input: DuplicateCheckInput,
  logs: ObservationLog[],
  options: DuplicateCheckOptions = {}
): DuplicateCandidate[] {
  const species = input.species.trim();
  if (!input.memberId || !species) {
    return [];
  }

  const inputDay = toDayNumber(input.observedAt);
  const excludeLogId = options.excludeLogId ?? null;
  const detail = normalizeBase(input.locationDetail ?? "");
  const candidates: DuplicateCandidate[] = [];

  for (const log of logs) {
    if (log.id === excludeLogId || log.memberId !== input.memberId) {
      continue;
    }

    // 先に日付で絞ってから種名を比べる（種名の照合のほうが重いため）。
    const logDay = toDayNumber(log.observedAt);
    const dayDiff = inputDay !== null && logDay !== null ? Math.abs(inputDay - logDay) : null;
    if (dayDiff === null || dayDiff > WINDOW_DAYS) {
      continue;
    }

    const speciesRelation = compareSpecies(species, log.species);
    if (speciesRelation === "different") {
      continue;
    }

    const reasons: string[] = [];
    let score = 0;

    if (speciesRelation === "same") {
      score += 40;
      reasons.push("種名が同じ");
    } else {
      score += 20;
      reasons.push(`種名が似ている（${log.species}）`);
    }

    if (dayDiff === 0) {
      score += 30;
      reasons.push("観察日が同じ");
    } else if (dayDiff === 1) {
      score += 10;
      reasons.push("観察日が1日違い");
    }

    const locationRelation = compareLocation(input.location, log.location);
    if (locationRelation === "same") {
      score += 18;
      reasons.push("観察地域が同じ");
    } else if (locationRelation === "near") {
      score += 9;
      reasons.push("観察地域が近い");
    }

    if (locationRelation !== "different") {
      const logDetail = normalizeBase(log.locationDetail ?? "");
      if (detail && logDetail) {
        if (detail === logDetail) {
          score += 5;
          reasons.push("詳細な場所も同じ");
        } else {
          score -= 5;
        }
      }
    }

    if (Number.isFinite(input.points) && input.points === log.points) {
      score += 8;
      reasons.push("ポイントが同じ");
    }

    if (score < MEDIUM_SCORE) {
      continue;
    }

    candidates.push({
      log,
      score,
      level: score >= HIGH_SCORE ? "high" : "medium",
      reasons
    });
  }

  candidates.sort((a, b) => b.score - a.score || b.log.observedAt.localeCompare(a.log.observedAt));

  return candidates.slice(0, options.limit ?? MAX_CANDIDATES);
}

/** 候補全体としての強さ。1件でも「ほぼ同じ」があれば high。 */
export function summarizeDuplicateLevel(candidates: DuplicateCandidate[]): DuplicateLevel | null {
  if (candidates.length === 0) {
    return null;
  }

  return candidates.some((candidate) => candidate.level === "high") ? "high" : "medium";
}
