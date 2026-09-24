/** Narrow, title-only discovery from the public CNINFO announcement index. */

export type DiscoveryInput = {
  stockCode: string;
  startDate: string;
  endDate: string;
  keyword: string;
  page: number;
};

export type DiscoveryCandidate = {
  id: string;
  title: string;
  companyName: string;
  stockCode: string;
  disclosedOn: string;
  url: string;
};

export type DiscoveryResult = {
  source: "cninfo-public";
  searchScope: "announcement-title";
  capturedAt: string;
  stockCode: string;
  page: number;
  hasMore: boolean;
  candidates: DiscoveryCandidate[];
  warning: string;
};

export class DiscoveryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 502,
  ) {
    super(message);
    this.name = "DiscoveryError";
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const STOCK_LIST_URL = "https://www.cninfo.com.cn/new/data/szse_stock.json";
const ANNOUNCEMENT_URL = "https://www.cninfo.com.cn/new/hisAnnouncement/query";
const PDF_ORIGIN = "https://static.cninfo.com.cn/";
const MAX_RANGE_MS = 365 * 24 * 60 * 60 * 1000;

function dateMillis(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) return null;
  return parsed;
}

export function validateDiscoveryInput(value: unknown): DiscoveryInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DiscoveryError("INVALID_INPUT", "请填写股票代码与检索日期。", 400);
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.stockCode !== "string" || !/^\d{6}$/.test(raw.stockCode)) {
    throw new DiscoveryError("INVALID_STOCK_CODE", "股票代码须为 6 位 A 股代码。", 400);
  }
  const start = dateMillis(raw.startDate);
  const end = dateMillis(raw.endDate);
  if (start === null || end === null || end < start || end - start > MAX_RANGE_MS) {
    throw new DiscoveryError("INVALID_DATE_RANGE", "请填写有效日期，且起止间隔不超过 365 天。", 400);
  }
  if (raw.keyword !== undefined && typeof raw.keyword !== "string") {
    throw new DiscoveryError("INVALID_KEYWORD", "标题关键词须为不超过 40 字的文本。", 400);
  }
  const keyword = (raw.keyword ?? "") as string;
  if (keyword.length > 40) {
    throw new DiscoveryError("INVALID_KEYWORD", "标题关键词须为不超过 40 字的文本。", 400);
  }
  const page = raw.page === undefined ? 1 : raw.page;
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > 5) {
    throw new DiscoveryError("INVALID_PAGE", "页码须为 1 到 5 的整数。", 400);
  }
  return {
    stockCode: raw.stockCode,
    startDate: raw.startDate as string,
    endDate: raw.endDate as string,
    keyword: keyword.trim(),
    page,
  };
}

function decodeTitle(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&(#(?:x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
      const named: Record<string, string> = {
        amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
      };
      if (entity.startsWith("#")) {
        const hex = entity[1]?.toLowerCase() === "x";
        const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "";
      }
      return named[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function candidateFromRow(row: unknown, stockCode: string, fallbackName: string): DiscoveryCandidate | null {
  if (typeof row !== "object" || row === null) return null;
  const item = row as Record<string, unknown>;
  if (item.secCode !== stockCode || typeof item.announcementId !== "string") return null;
  if (typeof item.announcementTitle !== "string" || typeof item.adjunctUrl !== "string") return null;
  if (!/^finalpage\/\d{4}-\d{2}-\d{2}\/[a-zA-Z0-9_-]+\.pdf$/i.test(item.adjunctUrl)) return null;
  const disclosedAt = item.announcementTime;
  if (typeof disclosedAt !== "number" || !Number.isFinite(disclosedAt)) return null;
  // CNINFO timestamps are epoch milliseconds; disclosure calendar dates use China time.
  const disclosedDate = new Date(disclosedAt + 8 * 60 * 60 * 1000);
  if (Number.isNaN(disclosedDate.getTime())) return null;
  const disclosedOn = disclosedDate.toISOString().slice(0, 10);
  const title = decodeTitle(item.announcementTitle);
  if (!title) return null;
  return {
    id: item.announcementId,
    title,
    companyName: typeof item.secName === "string" && item.secName.trim() ? decodeTitle(item.secName) : fallbackName,
    stockCode,
    disclosedOn,
    url: PDF_ORIGIN + item.adjunctUrl,
  };
}

async function upstreamJson(fetcher: FetchLike, url: string, init: RequestInit): Promise<unknown> {
  try {
    const response = await fetcher(url, init);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch {
    throw new DiscoveryError("CNINFO_UNAVAILABLE", "巨潮公开接口暂时不可用，请稍后重试。", 502);
  }
}

/** A single nine-second budget covers both upstream calls. */
export async function discoverCandidates(
  input: DiscoveryInput,
  fetcher: FetchLike = fetch,
): Promise<DiscoveryResult> {
  // The directory also contains Shanghai and other markets; this narrow route is Shenzhen only.
  if (!/^[03]\d{5}$/.test(input.stockCode)) {
    throw new DiscoveryError("STOCK_NOT_SUPPORTED", "当前仅支持深市 A 股代码。", 400);
  }
  const signal = AbortSignal.timeout(9000);
  const headers = { "User-Agent": "Mozilla/5.0", Referer: "https://www.cninfo.com.cn/" };
  const stockData = await upstreamJson(fetcher, STOCK_LIST_URL, { headers, signal });
  const list = (stockData as { stockList?: unknown } | null)?.stockList;
  if (!Array.isArray(list)) {
    throw new DiscoveryError("CNINFO_BAD_RESPONSE", "巨潮公司目录返回格式异常。", 502);
  }
  const company = list.find((item: unknown) => {
    if (typeof item !== "object" || item === null) return false;
    const record = item as Record<string, unknown>;
    return record.code === input.stockCode && record.category === "A股";
  }) as { orgId?: unknown; zwjc?: unknown } | undefined;
  if (!company || typeof company.orgId !== "string" || !company.orgId) {
    throw new DiscoveryError("STOCK_NOT_SUPPORTED", "当前仅支持巨潮深市公司目录中的 A 股代码。", 400);
  }

  const form = new URLSearchParams({
    pageNum: String(input.page),
    pageSize: "20",
    column: "szse",
    tabName: "fulltext",
    plate: "sz",
    stock: `${input.stockCode},${company.orgId}`,
    searchkey: input.keyword,
    seDate: `${input.startDate}~${input.endDate}`,
    secid: "", category: "", trade: "", sortName: "", sortType: "",
  });
  const announcementData = await upstreamJson(fetcher, ANNOUNCEMENT_URL, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: form,
    signal,
  });
  if (typeof announcementData !== "object" || announcementData === null) {
    throw new DiscoveryError("CNINFO_BAD_RESPONSE", "巨潮公告目录返回格式异常。", 502);
  }
  const data = announcementData as { announcements?: unknown; hasMore?: unknown };
  if (data.announcements !== null && !Array.isArray(data.announcements)) {
    throw new DiscoveryError("CNINFO_BAD_RESPONSE", "巨潮公告目录返回格式异常。", 502);
  }
  const fallbackName = typeof company.zwjc === "string" ? decodeTitle(company.zwjc) : input.stockCode;
  const candidates = (data.announcements ?? [])
    .map((row: unknown) => candidateFromRow(row, input.stockCode, fallbackName))
    .filter((row: DiscoveryCandidate | null): row is DiscoveryCandidate => row !== null)
    .slice(0, 20);
  return {
    source: "cninfo-public",
    searchScope: "announcement-title",
    capturedAt: new Date().toISOString(),
    stockCode: input.stockCode,
    page: input.page,
    hasMore: data.hasMore === true,
    candidates,
    warning: "仅检索公告标题。披露时间仅精确到日期；候选公告未经全文核验，请阅读原文后再判断事件归属与结论。",
  };
}
