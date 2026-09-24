"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight, Bell, BookOpenText, CalendarClock, ChevronRight, CircleHelp,
  FileText, History, Layers3, Link2, LoaderCircle, Plus, RotateCcw, Search,
  ShieldCheck, TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import {
  BASE_EVENTS, DEMO_FINAL_SOURCE, SEED_SOURCES, classifySourceImport, currentChinaDate,
  evaluateClaimUpdates, normalizeUrl, snapshot,
  sortedSources, sourceText, sourcesKnownBy, suggestEvent,
  type EventId, type EventInfo, type EvidenceRelation, type ExtractedClaim, type Notice, type Source,
  type SourceType,
} from "@/lib/evidence";

type Analysis = {
  entities: string[];
  action: string;
  object: string;
  suggestedEvent: EventId | "new" | "uncertain";
  matchReason: string;
  claims: ExtractedClaim[];
  mode: "deepseek" | "curated" | "manual";
  warnings?: string[];
};

type FormState = {
  title: string;
  publisher: string;
  url: string;
  sourceType: SourceType;
  disclosedOn: string;
  occurredOn: string;
  updatedOn: string;
  text: string;
  originGroup: string;
  simulated: boolean;
};

const emptyForm: FormState = {
  title: "", publisher: "", url: "", sourceType: "公告",
  disclosedOn: "", occurredOn: "", updatedOn: "", text: "", originGroup: "",
  simulated: false,
};

const storageKey = "event-evidence-workbench-v1";

function dateLabel(value: string | null, isCapture = false): string {
  if (!value) return "未披露";
  if (!value.includes("T")) return value + " · 仅日期";
  if (!isCapture) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value)) + " 中国时间";
}

function shortDate(value: string | null): string {
  return value?.replaceAll("-", ".") ?? "日期未知";
}

function sampledAnalysis(): Analysis {
  return {
    entities: ["高新发展", "华鲲振宇"],
    action: "终止本次重组方案",
    object: "华鲲振宇 70% 股权",
    suggestedEvent: "huakun",
    matchReason: "公司、交易标的及原方案均与现有华鲲振宇事件一致；不是同日的倍特期货股权转让。",
    claims: [
      {
        text: "公司同意终止本次发行股份及支付现金购买资产交易",
        quote: DEMO_FINAL_SOURCE.quote, kind: "事实陈述", relation: "更新",
      },
      {
        text: "未来取得标的公司控制权的时间和方案仍不确定",
        quote: DEMO_FINAL_SOURCE.additionalQuotes[2].quote, kind: "事实陈述", relation: "支持",
      },
    ],
    mode: "curated",
    warnings: ["此结果来自已核验的演示材料索引；线上模型未参与本次抽取。"],
  };
}

export default function Workbench() {
  const [userSources, setUserSources] = useState<Source[]>([]);
  const [customEvents, setCustomEvents] = useState<EventInfo[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [replay, setReplay] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<EventId>("huakun");
  const [selectedSourceId, setSelectedSourceId] = useState("GS-06");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("timeline");
  const [importOpen, setImportOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [choice, setChoice] = useState<EventId | "new">("huakun");
  const [manualClaim, setManualClaim] = useState("");
  const [reviewRelation, setReviewRelation] = useState<EvidenceRelation>("仅提及");
  const [reviewTarget, setReviewTarget] = useState("");
  const [reviewValidUntil, setReviewValidUntil] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "{}") as {
          sources?: Source[]; events?: EventInfo[]; notices?: Notice[];
        };
        if (Array.isArray(saved.sources)) setUserSources(saved.sources);
        if (Array.isArray(saved.events)) setCustomEvents(saved.events);
        if (Array.isArray(saved.notices)) setNotices(saved.notices);
      } catch {
        // Corrupt local state never hides the verified seed materials.
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(storageKey, JSON.stringify({
      sources: userSources, events: customEvents, notices,
    }));
  }, [hydrated, userSources, customEvents, notices]);

  useEffect(() => {
    if (!hydrated) return;
    const checkExpiry = () => {
      const today = currentChinaDate();
      const dueNotices = userSources.flatMap((source) => {
        if (!(source.extractedClaims ?? []).some((claim) => claim.validUntil && claim.validUntil < today)) return [];
        const otherSources = [...SEED_SOURCES, ...userSources.filter((item) => item.id !== source.id)];
        const before = snapshot(source.eventId, otherSources, today);
        return evaluateClaimUpdates(before.claims, source, today).notices
          .filter((notice) => notice.title.includes("到期需复核"));
      });
      if (dueNotices.length) setNotices((previous) => {
        const known = new Set(previous.map((notice) => notice.id));
        const additions = dueNotices.filter((notice) => !known.has(notice.id));
        return additions.length ? [...additions, ...previous] : previous;
      });
    };
    const initial = window.setTimeout(checkExpiry, 0);
    const timer = window.setInterval(checkExpiry, 60 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === "visible") checkExpiry(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hydrated, userSources]);

  const allSources = useMemo(() => {
    const combined = [...SEED_SOURCES, ...userSources];
    return replay ? sourcesKnownBy(SEED_SOURCES, "2024-04-18") : combined;
  }, [userSources, replay]);
  const allEvents = useMemo(() => [...BASE_EVENTS, ...customEvents].filter((item) =>
    !replay || allSources.some((source) => source.eventId === item.id)
  ), [customEvents, replay, allSources]);
  const event = allEvents.find((item) => item.id === selectedEventId) ?? BASE_EVENTS[0];
  const eventSources = useMemo(() => sortedSources(allSources, event.id), [allSources, event.id]);
  const current = useMemo(() => snapshot(event.id, allSources), [event.id, allSources]);
  const selectedSource = allSources.find((source) => source.id === selectedSourceId && source.eventId === event.id)
    ?? eventSources[eventSources.length - 1];
  const filteredEvents = allEvents.filter((item) =>
    (item.company + item.ticker + item.title).toLowerCase().includes(search.trim().toLowerCase())
  );
  const unreadCount = notices.filter((notice) => !notice.read).length;
  const isDemoForm = !form.simulated
    && form.url.toLowerCase() === DEMO_FINAL_SOURCE.url.toLowerCase()
    && form.title.trim() === DEMO_FINAL_SOURCE.title
    && form.text.trim() === sourceText(DEMO_FINAL_SOURCE).trim();
  const targetClaims = choice === "new" ? [] : snapshot(choice, allSources).claims;

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [field]: value }));
    setAnalysis(null);
    setFormError("");
  }

  function startReplay() {
    setReplay(true);
    setSelectedEventId("huakun");
    setSelectedSourceId("GS-05");
    setTab("timeline");
    toast.info("已回放至 2024-04-18 的公开信息");
  }

  function restoreCurrent() {
    setReplay(false);
    setSelectedSourceId("GS-06");
    toast.info("已返回完整资料视图");
  }

  function fillDemo() {
    if (!replay) startReplay();
    setForm({
      title: DEMO_FINAL_SOURCE.title,
      publisher: DEMO_FINAL_SOURCE.publisher,
      url: DEMO_FINAL_SOURCE.url,
      sourceType: "公告",
      disclosedOn: DEMO_FINAL_SOURCE.disclosedOn ?? "",
      occurredOn: DEMO_FINAL_SOURCE.occurredOn ?? "",
      updatedOn: "",
      text: sourceText(DEMO_FINAL_SOURCE),
      originGroup: "GS-06",
      simulated: false,
    });
    setAnalysis(null);
    setChoice("huakun");
    setFormError("");
  }

  async function analyze() {
    if (form.title.trim().length < 2 || form.text.trim().length < 20) {
      setFormError("请先填写标题和至少 20 字的原文片段。");
      return;
    }
    setAnalyzing(true);
    setFormError("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, text: form.text, sourceType: form.sourceType }),
      });
      const result = await response.json() as Analysis & { error?: string };
      if (!response.ok) throw new Error(result.error || "在线抽取不可用");
      const value: Analysis = {
        ...result,
        mode: "deepseek",
        claims: Array.isArray(result.claims) ? result.claims : [],
      };
      setAnalysis(value);
      setReviewRelation(value.claims[0]?.relation ?? "仅提及");
      setReviewTarget("");
      setReviewValidUntil("");
      setChoice(value.suggestedEvent === "huakun" || value.suggestedEvent === "beite"
        ? value.suggestedEvent : "new");
      toast.success("模型已提取可回查的主张，请核对后提交");
    } catch (error) {
      if (isDemoForm && form.text.includes(DEMO_FINAL_SOURCE.quote)) {
        const fallback = sampledAnalysis();
        setAnalysis(fallback);
        setReviewRelation(fallback.claims[0]?.relation ?? "仅提及");
        setReviewTarget("");
        setReviewValidUntil("");
        setChoice("huakun");
        toast.info("模型不可用，已切换为人工核验的演示样本");
      } else {
        const suggested = suggestEvent(form.title, form.text);
        setAnalysis({
          entities: [], action: "", object: "", suggestedEvent: suggested.id,
          matchReason: suggested.reason, claims: [], mode: "manual",
          warnings: [error instanceof Error ? error.message : "在线抽取不可用", "可手工填写一条主张，再确认导入。"],
        });
        setReviewRelation("仅提及");
        setReviewTarget("");
        setReviewValidUntil("");
        setChoice(suggested.id === "huakun" || suggested.id === "beite" ? suggested.id : "new");
        toast.warning("已进入人工核对模式");
      }
    } finally {
      setAnalyzing(false);
    }
  }

  function confirmImport() {
    if (!analysis) {
      setFormError("请先分析材料，查看事件归属与主张。");
      return;
    }
    if (choice === "huakun" && isDemoForm && replay) {
      setReplay(false);
      setSelectedEventId("huakun");
      setSelectedSourceId("GS-06");
      setTab("timeline");
      setNotices((previous) => previous.some((item) => item.sourceId === "GS-06") ? previous : [{
        id: "notice-demo-" + Date.now(), eventId: "huakun", sourceId: "GS-06",
        title: "原重组方案由预计难续变为正式终止",
        detail: "4 月 18 日董事会作出终止决议，4 月 19 日公告披露。后续收购意向的方案和时间仍不确定；见 GS-06 第 1、4、5 页。",
        createdAt: new Date().toISOString(), read: false,
      }, ...previous]);
      setImportOpen(false);
      setForm(emptyForm);
      setAnalysis(null);
      toast.success("已结束历史回放，应用 4 月 19 日已核验公告");
      return;
    }
    const importKind = classifySourceImport([...SEED_SOURCES, ...userSources], {
      url: form.url.trim(), title: form.title.trim(), quote: form.text.trim(),
      rawText: form.text.trim(), updatedOn: form.updatedOn || null,
    });
    if (importKind === "duplicate") {
      setFormError("这份材料已在当前资料中，重复导入不会生成新版本或通知。");
      return;
    }
    if (!analysis.claims.length && manualClaim.trim().length < 5) {
      setFormError("请至少手工填写一条可核查主张。");
      return;
    }
    if (["反驳", "否认", "更正", "更新"].includes(reviewRelation) && !reviewTarget) {
      setFormError("请指出首条主张对应的已有主张，才能记录冲突或版本变化。");
      return;
    }
    if (reviewValidUntil && !reviewTarget) {
      setFormError("请指出有效截止日对应的已有主张。");
      return;
    }
    const eventId = choice === "new" ? "custom-" + Date.now() : choice;
    const id = "USR-" + Date.now();
    const previousVersion = importKind === "new_version"
      ? [...SEED_SOURCES, ...userSources].filter((source) =>
        normalizeUrl(source.url) === normalizeUrl(form.url.trim())).at(-1)
      : undefined;
    const reviewFields = {
      relation: reviewRelation,
      targetClaimId: reviewTarget || undefined,
      validUntil: reviewValidUntil || undefined,
    };
    const extractedClaims: ExtractedClaim[] = analysis.claims.length
      ? analysis.claims.map((claim, index) => index === 0 ? { ...claim, ...reviewFields } : claim)
      : [{ text: manualClaim.trim(), quote: form.text.trim().slice(0, 160),
        kind: form.sourceType === "研报" ? "观点" : form.sourceType === "市场传闻" ? "传闻" : "事实陈述",
        ...reviewFields }];
    const next: Source = {
      id, eventId, title: form.title.trim(), publisher: form.publisher.trim() || "未注明",
      sourceType: form.sourceType, url: form.url.trim(), disclosedOn: form.disclosedOn || null,
      occurredOn: form.occurredOn || null, capturedOn: new Date().toISOString(),
      updatedOn: form.updatedOn || null, quote: extractedClaims[0]?.quote || form.text.slice(0, 160),
      rawText: form.text.trim(),
      page: null, additionalQuotes: [], summary: form.simulated ? "模拟测试材料，不代表真实历史。"
        : previousVersion ? `用户导入 ${previousVersion.id} 的原文修订版本，等待原文核验。`
          : "用户导入材料，等待原文核验。",
      verified: false, simulated: form.simulated, originGroup: form.originGroup.trim() || id,
      revisesSourceId: previousVersion?.id ?? null,
      extractedClaims,
    };
    const before = snapshot(eventId, [...SEED_SOURCES, ...userSources]);
    const review = evaluateClaimUpdates(before.claims, next);
    setUserSources((previous) => [...previous, next]);
    if (review.notices.length) setNotices((previous) => {
      const existingIds = new Set(previous.map((notice) => notice.id));
      return [...review.notices.filter((notice) => !existingIds.has(notice.id)), ...previous];
    });
    setReplay(false);
    if (choice === "new") setCustomEvents((previous) => [...previous, {
      id: eventId, company: analysis.entities[0] || form.publisher.trim() || "待识别公司",
      ticker: "", title: form.title.trim(), object: analysis.object || "待核对标的",
      relation: "用户新建事件 · 待复核",
    }]);
    setSelectedEventId(eventId);
    setSelectedSourceId(id);
    setTab("timeline");
    setImportOpen(false);
    setForm(emptyForm);
    setAnalysis(null);
    setManualClaim("");
    toast.success(review.impacts.length
      ? "材料已导入；相关主张已标待复核并生成通知"
      : "材料已导入；原文尚未独立核验");
  }

  function selectEvent(id: EventId) {
    setSelectedEventId(id);
    const own = sortedSources(allSources, id);
    setSelectedSourceId(own[own.length - 1]?.id || "");
    setTab("timeline");
  }

  return (
    <div className="app-shell">
      <Toaster position="top-center" richColors />
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Layers3 size={19} strokeWidth={2.2} /></span><div><strong>事件证据</strong><small>工作台</small></div></div>
        <div className="topbar-right">
          <span className="source-note">巨潮原始公告 · 本地演示记录</span>
          <Sheet open={noticeOpen} onOpenChange={setNoticeOpen}>
            <SheetTrigger asChild><button className="header-icon notice-trigger" aria-label={"站内通知，未读 " + unreadCount + " 条"}><Bell size={18} />{unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}</button></SheetTrigger>
            <SheetContent className="notice-sheet"><SheetHeader><SheetTitle>状态变更通知</SheetTitle><SheetDescription>只有关键结论变化才产生通知；普通转载不会重复提醒。</SheetDescription></SheetHeader>
              {notices.length === 0 ? <div className="empty-list">暂无状态变更。可进入历史回放并导入终止公告，查看通知如何生成。</div> :
                <div className="notice-list">{notices.map((notice) => <button key={notice.id} className={"notice-card " + (!notice.read ? "unread" : "")} onClick={() => { setNotices((previous) => previous.map((item) => item.id === notice.id ? { ...item, read: true } : item)); selectEvent(notice.eventId); setSelectedSourceId(notice.sourceId); setNoticeOpen(false); }}>
                  <strong>{notice.title}</strong><span>{notice.detail}</span><small>{dateLabel(notice.createdAt, true)}</small>
                </button>)}</div>}
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <div className="workspace">
        <aside className="event-rail">
          <div className="rail-heading"><span>关注事件</span><span className="rail-count">{String(allEvents.length).padStart(2, "0")}</span></div>
          <label className="rail-search"><Search size={16} /><input aria-label="搜索事件" placeholder="搜索公司或事件" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          {filteredEvents.length === 0 && <p className="rail-empty">没有匹配的事件</p>}
          {filteredEvents.map((item) => {
            const status = snapshot(item.id, allSources);
            return <button className={"event-item " + (selectedEventId === item.id ? "selected" : "")} key={item.id} type="button" onClick={() => selectEvent(item.id)} aria-current={selectedEventId === item.id ? "page" : undefined}>
              <span className="event-item-top"><b>{item.company}</b><small>{item.ticker || "新建"}</small></span>
              <span className="event-item-title">{item.title}</span>
              <span className="event-item-foot"><span className="status-pip" />{status.label}</span>
            </button>;
          })}
          <div className="rail-tip"><ShieldCheck size={18} /><span>真实案例的关键结论附原始公告；用户导入材料单独标记为待复核。</span></div>
        </aside>

        <main className="main-pane">
          <div className="breadcrumb">关注事件 <ChevronRight size={14} /> {event.company}</div>
          {!replay && <div className="freshness-banner"><TriangleAlert size={15}/><span>资料包最后披露日为 2024-04-19；未核验其后的最新进展。以下结论仅针对已收录材料。</span></div>}
          <div className="page-heading"><div><div className="heading-eyebrow">事件档案 <span>{event.id === "huakun" ? "EVENT FILE / 001" : event.id === "beite" ? "EVENT FILE / 002" : "USER EVENT"}</span></div><h1>{event.title}</h1><p>{event.company}{event.ticker ? " · " + event.ticker : ""} · {event.relation}</p></div>
            <Sheet open={importOpen} onOpenChange={setImportOpen}>
              <SheetTrigger asChild><Button className="import-button"><Plus size={17} /> 导入新材料</Button></SheetTrigger>
              <SheetContent className="import-sheet" side="right">
                <SheetHeader><SheetTitle>导入新材料</SheetTitle><SheetDescription>输入原文片段与来源；模型仅提取候选主张，最终归属由你确认。</SheetDescription></SheetHeader>
                <div className="import-form">
                  <button className="sample-loader" type="button" onClick={fillDemo}><FileText size={17} /> 填入已核验的 4 月 19 日公告演示样本</button>
                  <div className="form-grid"><label>标题<Input value={form.title} onChange={(event) => setField("title", event.target.value)} placeholder="公告或报道标题" /></label><label>发布者<Input value={form.publisher} onChange={(event) => setField("publisher", event.target.value)} placeholder="公司、媒体或研究机构" /></label></div>
                  <label>原文链接<Input value={form.url} onChange={(event) => setField("url", event.target.value)} placeholder="https://..." type="url" /></label>
                  <fieldset className="source-type-field"><legend>材料类型</legend><RadioGroup value={form.sourceType} onValueChange={(value) => setField("sourceType", value as SourceType)} className="source-type-options">{(["公告", "新闻", "研报", "市场传闻", "其他"] as SourceType[]).map((type) => <label key={type}><RadioGroupItem value={type} />{type}</label>)}</RadioGroup></fieldset>
                  <div className="form-grid"><label>披露日期<Input value={form.disclosedOn} onChange={(event) => setField("disclosedOn", event.target.value)} type="date" /></label><label>发生日期（未知可空）<Input value={form.occurredOn} onChange={(event) => setField("occurredOn", event.target.value)} type="date" /></label></div>
                  <label>原文片段<Textarea value={form.text} onChange={(event) => setField("text", event.target.value)} placeholder="粘贴与事件相关的原句。系统不把网页链接当作已核实全文。" rows={6} /></label>
                  <details className="form-extra"><summary>更多来源信息</summary><div className="form-grid"><label>原文更新时间<Input value={form.updatedOn} onChange={(event) => setField("updatedOn", event.target.value)} type="date" /></label><label>所转引的原始材料 ID<Input value={form.originGroup} onChange={(event) => setField("originGroup", event.target.value)} placeholder="如 GS-05；无则留空" /></label></div></details>
                  <label className="simulation-toggle"><input type="checkbox" checked={form.simulated} onChange={(event) => setField("simulated", event.target.checked)} />这是模拟测试材料，须在页面显著标记</label>
                  <Button onClick={analyze} disabled={analyzing} className="analyze-button">{analyzing ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}{analyzing ? "正在核对原文..." : "提取主张并建议归属"}</Button>
                  {analysis && <div className="analysis-panel">
                    <div className="analysis-head"><strong>{analysis.mode === "deepseek" ? "DeepSeek 在线抽取" : analysis.mode === "curated" ? "已核验演示索引" : "人工核对模式"}</strong><span>{analysis.claims.length} 条主张</span></div>
                    <p className="match-reason">{analysis.matchReason}</p>
                    <div className="match-options"><span>选择事件归属</span><RadioGroup value={choice} onValueChange={(value) => { setChoice(value as EventId | "new"); setReviewTarget(""); }}>{[...allEvents.map((item) => ({ id: item.id, label: item.title })), { id: "new", label: "新建事件" }].map((option) => <label key={option.id}><RadioGroupItem value={option.id} />{option.label}{analysis.suggestedEvent === option.id && <em>建议</em>}</label>)}</RadioGroup></div>
                    {analysis.claims.map((claim, index) => <div className="analysis-claim" key={index}><div><b>{claim.kind}</b><span>{claim.relation}</span></div><p>{claim.text}</p><blockquote>“{claim.quote}”</blockquote></div>)}
                    {analysis.claims.length === 0 && <label className="manual-claim">手工填写一条可核查主张<Input value={manualClaim} onChange={(event) => setManualClaim(event.target.value)} placeholder="如：公司披露拟转让某项股权" /></label>}
                    <div className="review-controls"><strong>首条主张的人工复核</strong><label>与已有主张的关系<select value={reviewRelation} onChange={(event) => setReviewRelation(event.target.value as EvidenceRelation)}>{["仅提及", "支持", "更新", "反驳", "否认", "更正"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>对应哪条已有主张<select value={reviewTarget} onChange={(event) => setReviewTarget(event.target.value)}><option value="">未指定</option>{targetClaims.map((claim) => <option key={claim.id} value={claim.id}>{claim.id} · {claim.text}</option>)}</select></label><label>有效截止日（可空）<Input type="date" value={reviewValidUntil} onChange={(event) => setReviewValidUntil(event.target.value)} /></label><small>否认、更正和到期先生成待复核提示；用户材料不能直接改写已核验公告结论。</small></div>
                    {analysis.warnings?.map((warning) => <p className="analysis-warning" key={warning}><TriangleAlert size={14} />{warning}</p>)}
                    <p className="review-note">用户导入材料默认待复核；只有资料包中逐份核验过的原始公告可改变演示案例的已确认状态。</p>
                    <Button onClick={confirmImport} className="confirm-button">确认归属并导入</Button>
                  </div>}
                  {formError && <p className="form-error" role="alert">{formError}</p>}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {replay && event.id === "huakun" && <div className="replay-banner"><History size={17} /><span>历史回放：仅使用截至 2024-04-18 已披露且人工核验的材料。后续结论不会提前出现。</span><button onClick={restoreCurrent}>返回完整资料</button></div>}
          <section className="finding-card" aria-label="当前结论"><div className="finding-head"><span>当前可确认的结论</span><span className="finding-state">{current.label}</span></div><h2>{current.headline}</h2><p>{current.explanation}</p>{selectedSource && <button className="finding-link" onClick={() => { setSelectedSourceId(current.sourceId); setTab("timeline"); }}>查看支撑材料 {current.sourceId} <ArrowUpRight size={15}/></button>}</section>
          {event.id === "huakun" && <div className="replay-control">{replay ? <span>回放依据：截至 2024.04.18 的公开披露</span> : <span>完整资料：截至 2024.04.19 的已核验公告</span>}<Button variant="outline" size="sm" onClick={replay ? restoreCurrent : startReplay}>{replay ? <RotateCcw size={15} /> : <History size={15} />}{replay ? "返回完整资料" : "回放至 4 月 18 日"}</Button></div>}

          <Tabs value={tab} onValueChange={setTab} className="detail-tabs">
            <TabsList variant="line"><TabsTrigger value="timeline">证据时间线 <span>{eventSources.length}</span></TabsTrigger><TabsTrigger value="claims">逐条主张 <span>{current.claims.length}</span></TabsTrigger></TabsList>
            <TabsContent value="timeline"><div className="section-caption"><CalendarClock size={16} /><span>按披露日期排序；发生时间可能更早，抓取时间不用于倒推当时已知信息。</span></div><div className="timeline">
              {eventSources.map((source) => <button className={"timeline-row " + (selectedSource?.id === source.id ? "active" : "")} key={source.id} onClick={() => setSelectedSourceId(source.id)}>
                <span className="timeline-track"><span className="timeline-node" /></span><time>{shortDate(source.disclosedOn)}</time><span className="timeline-content"><strong>{source.title}</strong><small>{source.id} · {source.publisher} · {source.sourceType}{!source.verified ? " · 用户导入待复核" : ""}{source.revisesSourceId ? " · 原文修订版" : ""}</small></span><ChevronRight size={16} className="row-arrow" />
              </button>)}
              {eventSources.length === 0 && <p className="empty-list">尚无材料。可以导入一份来源并建立事件。</p>}
            </div></TabsContent>
            <TabsContent value="claims"><div className="section-caption"><BookOpenText size={16} /><span>“事实陈述”是文本表达方式，不等于该事情已经发生。</span></div><div className="claims-list">{current.claims.map((claim) => <button key={claim.id} className="claim-card" onClick={() => { setSelectedSourceId(claim.evidenceIds[0]); setTab("timeline"); }}><span className="claim-meta"><b>{claim.kind}</b><em>{claim.state}</em></span><strong>{claim.text}</strong><small>{claim.note}</small><span className="claim-evidence">依据 {claim.evidenceIds.join("、")} <ChevronRight size={14}/></span></button>)}</div></TabsContent>
          </Tabs>
        </main>

        <aside className="inspector"><div className="inspector-heading"><BookOpenText size={18}/><span>原文证据</span></div>{selectedSource ? <>
          <div className="inspector-block"><div className="source-badges"><span>{selectedSource.sourceType}</span><span>{selectedSource.verified ? "原文已核验" : "用户导入 · 待复核"}</span>{selectedSource.simulated && <span>模拟测试</span>}{selectedSource.revisesSourceId && <span>原文修订版</span>}</div><h3>{selectedSource.title}</h3><p>{selectedSource.publisher}</p>{selectedSource.url && <a className="source-open" href={selectedSource.url} target="_blank" rel="noopener noreferrer">打开原始材料 <ArrowUpRight size={15}/></a>}{selectedSource.revisesSourceId && <button type="button" className="source-open" onClick={() => setSelectedSourceId(selectedSource.revisesSourceId!)}>查看上一版本 {selectedSource.revisesSourceId} <History size={15}/></button>}</div>
          <div className="inspector-block"><small>对应引文 {selectedSource.page ? "· PDF 第 " + selectedSource.page + " 页" : ""}</small><blockquote className="evidence-quote">“{selectedSource.quote}”</blockquote>{selectedSource.additionalQuotes.slice(0, 3).map((item, index) => <blockquote key={index} className="evidence-quote extra">“{item.quote}”<span>第 {item.page} 页</span></blockquote>)}<p>{selectedSource.summary}</p></div>
          <div className="inspector-block"><small>四种时间</small><dl className="four-times"><div><dt>事件发生</dt><dd>{dateLabel(selectedSource.occurredOn)}</dd></div><div><dt>对外披露</dt><dd>{selectedSource.publishedAt ? dateLabel(selectedSource.publishedAt, true) : dateLabel(selectedSource.disclosedOn)}</dd></div><div><dt>系统收录</dt><dd>{dateLabel(selectedSource.capturedOn, true)}</dd></div><div><dt>原文更新</dt><dd>{dateLabel(selectedSource.updatedOn)}</dd></div></dl>{selectedSource.publishedAtBasis && <p className="time-basis">网页时刻口径：{selectedSource.publishedAtBasis}</p>}<p className="time-explainer"><CircleHelp size={14}/>未知时间不以披露或抓取时间代填。</p></div>
          <div className="inspector-block"><small>证据独立性</small><p>{selectedSource.originGroup !== selectedSource.id ? "这份材料转引 " + selectedSource.originGroup + "，不计作新的独立原始证据。" : "原始来源或未标注转引关系。"}</p></div>
        </> : <div className="empty-list">选择一份材料查看原句与四种时间。</div>}
          <div className="inspector-footer"><Link2 size={15}/>只展示证据关系，不推断事件造成的股价变化或给出买卖建议。</div>
        </aside>
      </div>
    </div>
  );
}
