import type { TrendLensItem } from "./types";

const trendLensReadStorageKey = "pineflow.trend-lens-read.v1";

export type TrendReadEntry = {
  readAt: string;
  readDate: string;
};

export type TrendReadState = Record<string, TrendReadEntry>;
export type TrendReadStatus = "unread" | "readToday" | "readBefore";

function readDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function trendItemReadKey(item: TrendLensItem) {
  return item.sourceUrl || `${item.category}:${item.id}`;
}

function googleNewsSearchHref(item: TrendLensItem) {
  const href = new URL("https://news.google.com/search");
  href.searchParams.set("q", [item.title, item.sourceName].filter(Boolean).join(" "));

  if (item.region === "korea" || item.language === "ko") {
    href.searchParams.set("hl", "ko");
    href.searchParams.set("gl", "KR");
    href.searchParams.set("ceid", "KR:ko");
  } else {
    href.searchParams.set("hl", "en-US");
    href.searchParams.set("gl", "US");
    href.searchParams.set("ceid", "US:en");
  }

  return href.toString();
}

export function trendArticleHref(item: TrendLensItem) {
  try {
    const href = new URL(item.sourceUrl);
    if (href.hostname === "news.google.com" && !href.pathname.startsWith("/search")) {
      return googleNewsSearchHref(item);
    }
  } catch {
    return item.sourceUrl;
  }

  return item.sourceUrl;
}

export function getStoredTrendReadState(): TrendReadState {
  if (typeof window === "undefined") return {};

  try {
    const parsed = JSON.parse(window.localStorage.getItem(trendLensReadStorageKey) ?? "{}") as TrendReadState;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, entry]) => entry?.readAt && entry?.readDate));
  } catch {
    return {};
  }
}

export function storeTrendReadState(readState: TrendReadState) {
  if (typeof window === "undefined") return;

  const sortedEntries = Object.entries(readState)
    .sort(([, left], [, right]) => new Date(right.readAt).getTime() - new Date(left.readAt).getTime())
    .slice(0, 500);
  window.localStorage.setItem(trendLensReadStorageKey, JSON.stringify(Object.fromEntries(sortedEntries)));
}

export function trendReadStatus(item: TrendLensItem, readState: TrendReadState): TrendReadStatus {
  const entry = readState[trendItemReadKey(item)];
  if (!entry) return "unread";
  return entry.readDate === readDateKey() ? "readToday" : "readBefore";
}

export function orderTrendItemsByReadState(items: TrendLensItem[], readState: TrendReadState) {
  return items
    .map((item, index) => ({ item, index, status: trendReadStatus(item, readState) }))
    .sort((left, right) => {
      const leftPenalty = left.status === "readBefore" ? 1 : 0;
      const rightPenalty = right.status === "readBefore" ? 1 : 0;
      if (leftPenalty !== rightPenalty) return leftPenalty - rightPenalty;
      return left.index - right.index;
    })
    .map(({ item }) => item);
}

export function createTrendReadEntry(date = new Date()): TrendReadEntry {
  return {
    readAt: date.toISOString(),
    readDate: readDateKey(date)
  };
}
