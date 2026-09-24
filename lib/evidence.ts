import seed from "@/data/seed_sources.json";

export type EventId = "huakun" | "beite" | string;
export type SourceType = "公告" | "新闻" | "研报" | "市场传闻" | "其他";
export type ClaimKind = "事实陈述" | "观点" | "推测" | "传闻";
export type EvidenceRelation = "支持" | "反驳" | "更正" | "仅提及";

export type ExtractedClaim = {
  text: string;
  quote: string;
  kind: ClaimKind;
  relation: EvidenceRelation;
};

export type Source = {
  id: string;
  eventId: EventId;
  title: string;
  publisher: string;
  sourceType: SourceType;
  url: string;
  disclosedOn: string | null;
  occurredOn: string | null;
  capturedOn: string;
  updatedOn: string | null;
  publishedAt?: string | null;
  publishedAtBasis?: string | null;
  quote: string;
  page: number | null;
  additionalQuotes: Array<{ quote: string; page: number }>;
  summary: string;
  verified: boolean;
  simulated: boolean;
  originGroup: string;
  extractedClaims?: ExtractedClaim[];
};

export type EventInfo = {
  id: EventId;
  company: string;
  ticker: string;
  title: string;
  object: string;
  relation: string;
};

export type ClaimView = {
  id: string;
  text: string;
  kind: ClaimKind;
  state: string;
  evidenceIds: string[];
  note?: string;
};

export type EventSnapshot = {
  label: string;
  headline: string;
  explanation: string;
  sourceId: string;
  claims: ClaimView[];
};

export type Notice = {
  id: string;
  eventId: EventId;
  sourceId: string;
  title: string;
  detail: string;
  createdAt: string;
  read: boolean;
};

export const BASE_EVENTS: EventInfo[] = [
  {
    id: "huakun",
    company: "高新发展",
    ticker: "000628",
    title: "拟收购华鲲振宇 70% 股权",
    object: "华鲲振宇",
    relation: "发行股份及支付现金购买资产",
  },
  {
    id: "beite",
    company: "高新发展",
    ticker: "000628",
    title: "倍特期货股权拟转让",
    object: "倍特期货",
    relation: "控股子公司拟出售参股公司股权",
  },
];

type SeedRecord = (typeof seed.sources)[number];

function seedToSource(item: SeedRecord): Source {
  return {
    id: item.id,
    eventId: item.id === "GS-X1" ? "beite" : "huakun",
    title: item.title,
    publisher: item.publisher,
    sourceType: item.type === "news" ? "新闻" : "公告",
    url: item.url,
    disclosedOn: item.disclosed_on,
    occurredOn: item.occurred_on,
    capturedOn: seed.verified_on,
    updatedOn: item.updated_at,
    publishedAt: "published_at" in item ? item.published_at : null,
    publishedAtBasis: "published_at_basis" in item ? item.published_at_basis : null,
    quote: item.quote,
    page: item.page,
    additionalQuotes: "additional_quotes" in item
      ? (item.additional_quotes as Array<{ quote: string; page: number }>)
      : [],
    summary: item.claim_summary,
    verified: true,
    simulated: false,
    originGroup: "origin_group" in item ? item.origin_group || item.id : item.id,
  };
}

export const SEED_SOURCES: Source[] = seed.sources.map(seedToSource);
export const DEMO_FINAL_SOURCE = SEED_SOURCES.find((source) => source.id === "GS-06")!;

export function sourceText(source: Source): string {
  return [source.quote, ...source.additionalQuotes.map((item) => item.quote)].filter(Boolean).join("\n");
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function isDuplicateSource(existing: Source[], candidate: Pick<Source, "url" | "title" | "quote">): boolean {
  const url = normalizeUrl(candidate.url);
  const fingerprint = (candidate.title + candidate.quote).replace(/\s+/g, "").toLowerCase();
  return existing.some((source) =>
    (url.length > 8 && normalizeUrl(source.url) === url) ||
    (source.title + source.quote).replace(/\s+/g, "").toLowerCase() === fingerprint
  );
}

export function suggestEvent(title: string, text: string): { id: EventId | "new" | "uncertain"; reason: string } {
  const content = title + " " + text;
  const huakun = /华鲲振宇/.test(content);
  const beite = /倍特期货/.test(content);
  if (huakun && beite) return { id: "uncertain", reason: "材料同时提到两个标的，需人工区分具体事项。" };
  if (huakun) return { id: "huakun", reason: "材料明确提及华鲲振宇；仍需确认是否属于同一交易方案。" };
  if (beite) return { id: "beite", reason: "材料明确提及倍特期货；与华鲲振宇收购标的不同。" };
  return { id: "new", reason: "未识别到已有事件的交易标的，建议新建事件。" };
}

export function sortedSources(sources: Source[], eventId: EventId): Source[] {
  return sources.filter((source) => source.eventId === eventId).sort((a, b) =>
    (a.disclosedOn ?? a.capturedOn).localeCompare(b.disclosedOn ?? b.capturedOn) || a.id.localeCompare(b.id)
  );
}

export function sourcesKnownBy(sources: Source[], disclosedCutoff: string): Source[] {
  return sources.filter((source) => !!source.disclosedOn && source.disclosedOn <= disclosedCutoff);
}

export function snapshot(eventId: EventId, sources: Source[]): EventSnapshot {
  const own = sortedSources(sources, eventId);
  const ids = new Set(own.map((source) => source.id));
  if (eventId === "huakun") {
    const claims: ClaimView[] = [
      {
        id: "C1", text: "公司披露拟购买华鲲振宇 70% 股权", kind: "事实陈述",
        state: ids.has("GS-03") ? "已确认披露" : "拟议中",
        evidenceIds: ids.has("GS-03") ? ["GS-03"] : ["GS-01"],
        note: "确认的是拟议方案的披露，不表示交易已完成。",
      },
    ];
    if (ids.has("GS-04")) claims.push({
      id: "C2", text: "交易作价尚未达成一致", kind: "事实陈述", state: "已确认披露",
      evidenceIds: ["GS-04"], note: "这是公司截至 2024-04-09 披露的进展。",
    });
    if (ids.has("GS-05")) claims.push({
      id: "C3", text: "当前方案很可能无法继续推进", kind: "推测",
      state: ids.has("GS-06") ? "已被后续结果取代" : "待正式决定",
      evidenceIds: ["GS-05"], note: "4 月 18 日仍是预计，不能提前写成已终止。",
    });
    if (ids.has("GS-06")) claims.push(
      {
        id: "C4", text: "2023 年重组方案正式终止", kind: "事实陈述",
        state: "已确认", evidenceIds: ["GS-06"],
        note: "终止的是本次交易方案，不代表永久放弃任何后续收购。",
      },
      {
        id: "C5", text: "公司称将推动后续收购，但方案和时间不确定", kind: "事实陈述",
        state: "表态已确认 · 结果未发生", evidenceIds: ["GS-06"],
        note: "只能确认公司作出表态，不能写成新交易已经完成。",
      },
      {
        id: "C6", text: "高投电子集团持有标的公司 55% 股权", kind: "事实陈述",
        state: "已确认披露", evidenceIds: ["GS-06"],
        note: "持股主体是高投电子集团，不是上市公司高新发展。",
      },
    );

    if (ids.has("GS-06")) return {
      label: "已终止 · 后续意向未定",
      headline: "2023 年披露的收购方案已终止",
      explanation: "4 月 18 日董事会、监事会同意终止本次交易，4 月 19 日对外披露。公司另表示将推动相关股权收购，但能否取得控制权、时间和方案均不确定。",
      sourceId: "GS-06", claims: withUserClaims(claims, own),
    };
    if (ids.has("GS-05")) return {
      label: "预计难续 · 待正式决定",
      headline: "当前方案很可能无法继续推进",
      explanation: "4 月 18 日公司披露正协商是否终止，预计 4 月 19 日公告决定。此时尚不能写成交易已经终止。",
      sourceId: "GS-05", claims: withUserClaims(claims, own),
    };
    if (ids.has("GS-04")) return {
      label: "风险上升 · 尚未终止",
      headline: "交易作价未达一致，存在终止风险",
      explanation: "审计和评估仍在推进，交易作价尚未达成一致，后续能否完成不确定。",
      sourceId: "GS-04", claims: withUserClaims(claims, own),
    };
    return {
      label: "拟议中 · 尚未成交",
      headline: "收购方案处于筹划和审批阶段",
      explanation: "公司披露收购预案，但审计评估、审批和实际交割尚未完成。",
      sourceId: ids.has("GS-02") ? "GS-02" : "GS-01",
      claims: withUserClaims(claims, own),
    };
  }
  if (eventId === "beite") return {
    label: "拟议中 · 作价未定",
    headline: "控股子公司拟转让倍特期货股权",
    explanation: "这是一项股权出售事项，交易标的与华鲲振宇收购不同。披露时交易作价尚未确定。",
    sourceId: "GS-X1",
    claims: withUserClaims([{
      id: "B1", text: "倍特投资拟转让倍特期货 33.75% 股权",
      kind: "事实陈述", state: "已确认披露", evidenceIds: ["GS-X1"],
      note: "确认的是拟转让的披露，不能推定交易已经完成。",
    }], own),
  };
  return {
    label: "待复核", headline: "新事件等待更多来源",
    explanation: "当前仅有用户导入材料，系统尚未核对原始出处。",
    sourceId: own[0]?.id ?? "",
    claims: withUserClaims([], own),
  };
}

function withUserClaims(base: ClaimView[], own: Source[]): ClaimView[] {
  const additions: ClaimView[] = [];
  for (const source of own) {
    if (source.verified) continue;
    for (const [index, claim] of (source.extractedClaims ?? []).entries()) {
      additions.push({
        id: source.id + "-C" + (index + 1),
        text: claim.text,
        kind: claim.kind,
        state: source.simulated ? "模拟 · 不参与真实结论" : "用户材料 · 待复核",
        evidenceIds: [source.id],
        note: source.simulated ? "测试材料，不代表真实历史。" : "原文链接与引文尚未独立核验。",
      });
    }
  }
  return [...base, ...additions];
}
