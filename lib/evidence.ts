import seed from "@/data/seed_sources.json";

export type EventId = "huakun" | "beite" | string;
export type SourceType = "公告" | "新闻" | "研报" | "市场传闻" | "其他";
export type ClaimKind = "事实陈述" | "观点" | "推测" | "传闻";
export type EvidenceRelation = "支持" | "反驳" | "否认" | "更正" | "更新" | "仅提及";

export type ExtractedClaim = {
  text: string;
  quote: string;
  kind: ClaimKind;
  relation: EvidenceRelation;
  /** Required before an imported denial or correction can affect an existing claim. */
  targetClaimId?: string;
  /** New wording proposed by a correction; the original claim is retained. */
  replacementText?: string;
  /** Last calendar date on which this claim may be relied on without review. */
  validUntil?: string | null;
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
  /** Full user-supplied text when available; seed sources fall back to sourceText(). */
  rawText?: string | null;
  revisesSourceId?: string | null;
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
  validUntil?: string | null;
  targetClaimId?: string;
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

export type SourceImportKind = "duplicate" | "new_version" | "new_source";

function normalizeContent(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

/** A changed document at the same URL is a version only when an updated date is supplied. */
export function classifySourceImport(
  existing: Source[],
  candidate: Pick<Source, "url" | "title" | "quote"> & Partial<Pick<Source, "updatedOn" | "rawText">>,
): SourceImportKind {
  const url = normalizeUrl(candidate.url);
  const previousVersions = existing.filter((source) =>
    url.length > 8 && normalizeUrl(source.url) === url
  );
  const fullText = candidate.rawText?.trim() ? normalizeContent(candidate.rawText) : "";
  const sameFullText = (source: Source) =>
    fullText.length > 0 && normalizeContent(source.rawText?.trim() || sourceText(source)) === fullText;

  if (previousVersions.length) {
    // Full text takes precedence over a short quote: a revised excerpt of an
    // unchanged page is not a new source version.
    if (previousVersions.some(sameFullText)) return "duplicate";
    if (!fullText) {
      const quote = normalizeContent(candidate.quote);
      if (quote && previousVersions.some((source) => normalizeContent(source.quote) === quote)) {
        return "duplicate";
      }
    }
    return candidate.updatedOn &&
      previousVersions.every((source) => source.updatedOn !== candidate.updatedOn)
      ? "new_version" : "duplicate";
  }

  const fingerprint = normalizeContent(candidate.title + candidate.quote);
  return existing.some((source) =>
    sameFullText(source) || normalizeContent(source.title + source.quote) === fingerprint
  ) ? "duplicate" : "new_source";
}

export function isDuplicateSource(
  existing: Source[],
  candidate: Pick<Source, "url" | "title" | "quote"> & Partial<Pick<Source, "updatedOn" | "rawText">>,
): boolean {
  return classifySourceImport(existing, candidate) === "duplicate";
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

export type ClaimImpact = {
  claimIndex: number;
  targetClaimId: string;
  relation: EvidenceRelation;
  previousState: string;
  reviewState: string;
  sourceId: string;
  sourceUrl: string;
  quote: string;
  reason: string;
  authoritative: boolean;
};

export type ClaimUpdateResult = {
  claims: ClaimView[];
  impacts: ClaimImpact[];
  notices: Notice[];
};

export function currentChinaDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z"));
}

/**
 * Apply one source to explicitly linked atomic claims. User and simulated sources
 * create review rows and notices, while the verified claim they challenge stays intact.
 * Only independently verified original announcements may change a claim itself.
 */
export function evaluateClaimUpdates(
  previousClaims: ClaimView[], source: Source, asOfDate: string = currentChinaDate(),
): ClaimUpdateResult {
  const claims = previousClaims.map((claim) => ({ ...claim, evidenceIds: [...claim.evidenceIds] }));
  const impacts: ClaimImpact[] = [];
  const notices: Notice[] = [];
  const authoritative = source.verified && !source.simulated &&
    source.sourceType === "公告" && source.originGroup === source.id;
  const today = isCalendarDate(asOfDate) ? asOfDate : asOfDate.slice(0, 10);

  for (const [claimIndex, incoming] of (source.extractedClaims ?? []).entries()) {
    if (!incoming.targetClaimId || !incoming.quote.trim()) continue;
    const target = claims.find((claim) => claim.id === incoming.targetClaimId);
    if (!target) continue;

    const validUntil = incoming.validUntil ?? target.validUntil;
    const expired = !!validUntil && isCalendarDate(validUntil) &&
      isCalendarDate(today) && validUntil < today;
    let reviewState: string;
    let reason: string;
    if (incoming.relation === "反驳" || incoming.relation === "否认") {
      reviewState = authoritative ? "被否认" : "否认待复核";
      reason = `新来源明确否认主张 ${target.id}；仅该主张受影响。`;
    } else if (incoming.relation === "更正") {
      reviewState = authoritative ? "已更正" : "更正待复核";
      reason = `新来源提出主张 ${target.id} 的更正；旧表述保留以便回放。`;
    } else if (expired) {
      reviewState = "到期需复核";
      reason = `主张 ${target.id} 的适用截至日 ${validUntil} 已过；过期不表示原说法为假。`;
    } else {
      // A new update, repost or supporting statement does not supersede a claim.
      continue;
    }

    const alreadyReviewed = claims.some((claim) =>
      claim.targetClaimId === target.id && claim.state.endsWith(reviewState)
    );
    const changed = authoritative
      ? target.state !== reviewState
      : !alreadyReviewed;
    if (!changed) continue;

    const impact: ClaimImpact = {
      claimIndex, targetClaimId: target.id, relation: incoming.relation,
      previousState: target.state, reviewState, sourceId: source.id,
      sourceUrl: source.url, quote: incoming.quote, reason, authoritative,
    };
    impacts.push(impact);

    if (authoritative) {
      target.state = reviewState;
      target.evidenceIds = [...new Set([...target.evidenceIds, source.id])];
      target.note = reason;
      if (incoming.relation === "更正") claims.push({
        id: `${source.id}-C${claimIndex + 1}-corrected`,
        text: incoming.replacementText?.trim() || incoming.text,
        kind: incoming.kind,
        state: "已确认披露",
        evidenceIds: [source.id],
        note: "确认的是更正内容已正式披露，后续履行仍须单独核验。",
        targetClaimId: target.id,
      });
    } else {
      const prefix = source.simulated ? "模拟测试 · " : "用户材料 · ";
      claims.push({
        id: `${source.id}-C${claimIndex + 1}`,
        text: incoming.relation === "更正"
          ? incoming.replacementText?.trim() || incoming.text : incoming.text,
        kind: incoming.kind,
        state: prefix + reviewState,
        evidenceIds: [source.id, ...target.evidenceIds],
        note: `${reason}原已核验主张「${target.state}」未自动改判；材料仍待核验。`,
        targetClaimId: target.id,
      });
    }

    const title = `${source.simulated ? "[模拟] " : ""}主张 ${target.id}：${reviewState}`;
    const statusExplanation = authoritative
      ? `「${target.text}」由「${impact.previousState}」变为「${reviewState}」。`
      : `针对「${target.text}」新增「${reviewState}」提示；原主张仍为「${impact.previousState}」。`;
    notices.push({
      id: `notice-${source.id}-${target.id}-${reviewState}`,
      eventId: source.eventId, sourceId: source.id, title,
      detail: `${statusExplanation}${reason}依据：${source.id}「${incoming.quote}」${source.url ? ` ${source.url}` : "（原文链接未提供）"}。${authoritative ? "" : "用户材料尚未独立核验，官方结论保持原样。"}`,
      createdAt: new Date().toISOString(), read: false,
    });
  }
  return { claims, impacts, notices };
}

export function snapshot(eventId: EventId, sources: Source[], asOfDate: string = currentChinaDate()): EventSnapshot {
  const own = sortedSources(sources, eventId);
  if (own.length === 0) return {
    label: "尚未披露",
    headline: "截至该时点尚无公开材料",
    explanation: "当前回放范围内没有此事件的来源，不能推定事件当时已发生或已公开。",
    sourceId: "",
    claims: [],
  };
  const ids = new Set(own.filter((source) => source.verified).map((source) => source.id));
  if (eventId === "huakun" && !["GS-01", "GS-02", "GS-03", "GS-04", "GS-05", "GS-06"].some((id) => ids.has(id))) {
    return {
      label: "待复核", headline: "仅有用户材料，尚无已核验公告",
      explanation: "现有材料尚未独立核对，不能生成关于收购方案的官方结论。",
      sourceId: own[0].id, claims: withUserClaims([], own, asOfDate),
    };
  }
  if (eventId === "beite" && !ids.has("GS-X1")) {
    return {
      label: "待复核", headline: "仅有用户材料，尚无已核验公告",
      explanation: "现有材料尚未独立核对，不能生成关于股权转让的官方结论。",
      sourceId: own[0].id, claims: withUserClaims([], own, asOfDate),
    };
  }
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
      sourceId: "GS-06", claims: withUserClaims(claims, own, asOfDate),
    };
    if (ids.has("GS-05")) return {
      label: "预计难续 · 待正式决定",
      headline: "当前方案很可能无法继续推进",
      explanation: "4 月 18 日公司披露正协商是否终止，预计 4 月 19 日公告决定。此时尚不能写成交易已经终止。",
      sourceId: "GS-05", claims: withUserClaims(claims, own, asOfDate),
    };
    if (ids.has("GS-04")) return {
      label: "风险上升 · 尚未终止",
      headline: "交易作价未达一致，存在终止风险",
      explanation: "审计和评估仍在推进，交易作价尚未达成一致，后续能否完成不确定。",
      sourceId: "GS-04", claims: withUserClaims(claims, own, asOfDate),
    };
    return {
      label: "拟议中 · 尚未成交",
      headline: "收购方案处于筹划和审批阶段",
      explanation: "公司披露收购预案，但审计评估、审批和实际交割尚未完成。",
      sourceId: ids.has("GS-02") ? "GS-02" : "GS-01",
      claims: withUserClaims(claims, own, asOfDate),
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
    }], own, asOfDate),
  };
  return {
    label: "待复核", headline: "新事件等待更多来源",
    explanation: "当前仅有用户导入材料，系统尚未核对原始出处。",
    sourceId: own[0]?.id ?? "",
    claims: withUserClaims([], own, asOfDate),
  };
}

function withUserClaims(base: ClaimView[], own: Source[], asOfDate: string): ClaimView[] {
  let claims = [...base];
  for (const source of own) {
    if (source.verified) continue;
    const result = evaluateClaimUpdates(claims, source, asOfDate);
    claims = result.claims;
    const handled = new Set(result.impacts.map((impact) => impact.claimIndex));
    for (const [index, claim] of (source.extractedClaims ?? []).entries()) {
      if (handled.has(index)) continue;
      // The review queue already has this target in the same state; retain the
      // new material in the timeline without adding a duplicate claim card.
      if (claim.targetClaimId && claims.some((item) => item.targetClaimId === claim.targetClaimId &&
        ((claim.relation === "反驳" || claim.relation === "否认") && item.state.endsWith("否认待复核") ||
          claim.relation === "更正" && item.state.endsWith("更正待复核") ||
          !!claim.validUntil && item.state.endsWith("到期需复核")))) continue;
      claims.push({
        id: source.id + "-C" + (index + 1),
        text: claim.text,
        kind: claim.kind,
        state: source.simulated ? "模拟 · 不参与真实结论" : "用户材料 · 待复核",
        evidenceIds: [source.id],
        note: claim.targetClaimId
          ? `指向主张 ${claim.targetClaimId}，但尚无可执行的状态迁移；原结论未改。`
          : source.simulated ? "测试材料，不代表真实历史。" : "原文链接与引文尚未独立核验。",
      });
    }
  }
  return claims;
}
