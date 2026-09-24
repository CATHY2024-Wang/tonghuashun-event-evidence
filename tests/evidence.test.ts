import test from "node:test";
import assert from "node:assert/strict";
import {
  SEED_SOURCES, classifySourceImport, evaluateClaimUpdates, isDuplicateSource,
  snapshot, sortedSources, sourcesKnownBy, suggestEvent, type ExtractedClaim,
  type Source,
} from "../lib/evidence";

function simulatedUpdate(id: string, claim: ExtractedClaim): Source {
  return {
    ...SEED_SOURCES.find((item) => item.id === "GS-06")!,
    id, title: `【模拟测试】${id}`, publisher: "模拟材料",
    url: `https://example.invalid/${id}`, quote: claim.quote,
    disclosedOn: "2024-05-01", occurredOn: null, capturedOn: "2024-05-01T08:00:00.000Z",
    updatedOn: null, additionalQuotes: [], originGroup: id,
    verified: false, simulated: true, extractedClaims: [claim],
  };
}

test("4 月 18 日历史回放不能提前得知 4 月 19 日终止", () => {
  const known = sourcesKnownBy(SEED_SOURCES, "2024-04-18");
  assert.equal(known.some((source) => source.id === "GS-06"), false);
  assert.equal(known.some((source) => source.id === "NEWS-03"), false);
  assert.match(snapshot("huakun", known).headline, /很可能无法继续推进/);
  assert.doesNotMatch(snapshot("huakun", known).headline, /已终止/);
});

test("官方终止公告只终止旧方案，保留后续意向的不确定性", () => {
  const result = snapshot("huakun", SEED_SOURCES);
  assert.match(result.headline, /已终止/);
  assert.match(result.explanation, /不确定/);
  assert.equal(result.sourceId, "GS-06");
});

test("同公司同日的倍特期货转让保持独立事件", () => {
  const source = SEED_SOURCES.find((item) => item.id === "GS-X1");
  assert.equal(source?.eventId, "beite");
  assert.equal(sortedSources(SEED_SOURCES, "huakun").some((item) => item.id === "GS-X1"), false);
  assert.equal(suggestEvent("高新发展拟转让倍特期货股权", "倍特期货 33.75% 股权").id, "beite");
});

test("回放到倍特期货披露前不生成事件结论或已确认主张", () => {
  const known = sourcesKnownBy(SEED_SOURCES, "2024-04-18");
  const result = snapshot("beite", known);
  assert.equal(result.label, "尚未披露");
  assert.equal(result.sourceId, "");
  assert.deepEqual(result.claims, []);
});

test("转述新闻保留原始公告来源组", () => {
  assert.equal(SEED_SOURCES.find((item) => item.id === "NEWS-01")?.originGroup, "GS-01");
  assert.equal(SEED_SOURCES.find((item) => item.id === "NEWS-02")?.originGroup, "GS-05");
  assert.equal(SEED_SOURCES.find((item) => item.id === "NEWS-03")?.originGroup, "GS-06");
});

test("同一原文链接重复导入被识别", () => {
  const original = SEED_SOURCES.find((item) => item.id === "GS-06")!;
  assert.equal(isDuplicateSource(SEED_SOURCES, {
    url: original.url + "?ref=copy",
    title: "另一条标题",
    quote: "重复转载",
  }), true);
});

test("同 URL 内容和更新时间都变化才作为更正版本，不重复计算原版本", () => {
  const original = SEED_SOURCES.find((item) => item.id === "GS-06")!;
  const revised = {
    url: original.url + "?ref=updated", title: original.title,
    quote: "【模拟修订文字】原公告出现新段落。", updatedOn: "2024-04-20",
  };
  assert.equal(classifySourceImport([original], revised), "new_version");
  assert.equal(isDuplicateSource([original], revised), false);
  assert.equal(isDuplicateSource([original], { ...revised, updatedOn: null }), true);
  assert.equal(isDuplicateSource([original], { ...revised, quote: original.quote }), true);
});

test("模拟否认只标记目标主张待复核，原官方结论和其他主张不变", () => {
  const before = snapshot("huakun", SEED_SOURCES);
  const source = simulatedUpdate("SIM-DENIAL", {
    text: "【模拟】否认 2023 年方案已终止",
    quote: "【模拟测试】本材料否认原方案终止。",
    kind: "事实陈述", relation: "否认", targetClaimId: "C4",
  });
  const result = evaluateClaimUpdates(before.claims, source, "2024-05-01");
  assert.equal(result.impacts.length, 1);
  assert.equal(result.impacts[0].targetClaimId, "C4");
  assert.equal(result.impacts[0].authoritative, false);
  assert.equal(result.claims.find((item) => item.id === "C4")?.state, "已确认");
  assert.equal(result.claims.find((item) => item.id === "C5")?.state, "表态已确认 · 结果未发生");
  assert.equal(result.claims.find((item) => item.id === "SIM-DENIAL-C1")?.state, "模拟测试 · 否认待复核");
  assert.match(result.notices[0].detail, /SIM-DENIAL.*example\.invalid.*官方结论保持原样/);
  assert.match(result.notices[0].detail, /新增「否认待复核」提示；原主张仍为「已确认」/);
  assert.doesNotMatch(result.notices[0].detail, /由「已确认」变为/);
  const after = snapshot("huakun", [...SEED_SOURCES, source], "2024-05-01");
  assert.equal(after.headline, before.headline);
  assert.equal(after.claims.find((item) => item.id === "C4")?.state, "已确认");
  assert.equal(after.claims.find((item) => item.id === "SIM-DENIAL-C1")?.targetClaimId, "C4");
  assert.equal(evaluateClaimUpdates(result.claims, source, "2024-05-01").notices.length, 0);
});

test("用户自称公告也不能绕过核验，把官方主张自动改判为被否认", () => {
  const before = snapshot("huakun", SEED_SOURCES);
  const source = {
    ...simulatedUpdate("USR-CLAIM", {
      text: "用户称原交易并未终止", quote: "用户粘贴：此前终止说法不实。",
      kind: "事实陈述", relation: "否认", targetClaimId: "C4",
    }),
    simulated: false, publisher: "自称上市公司", sourceType: "公告" as const,
  };
  const result = evaluateClaimUpdates(before.claims, source, "2024-05-01");
  assert.equal(result.impacts[0].authoritative, false);
  assert.equal(result.claims.find((item) => item.id === "C4")?.state, "已确认");
  assert.equal(result.claims.find((item) => item.id === "USR-CLAIM-C1")?.state, "用户材料 · 否认待复核");
  assert.match(result.notices[0].detail, /用户材料尚未独立核验/);
  assert.match(result.notices[0].detail, /原主张仍为「已确认」/);
  const userOnly = snapshot("huakun", [source], "2024-05-01");
  assert.equal(userOnly.label, "待复核");
  assert.equal(userOnly.claims.some((item) => item.state === "已确认"), false);
});

test("模拟更正保留原主张，并将替代表述单独标为待复核", () => {
  const before = snapshot("huakun", SEED_SOURCES);
  const source = simulatedUpdate("SIM-CORRECTION", {
    text: "【模拟】标的股权比例另有修订",
    replacementText: "【模拟】高投电子集团持股比例更正为 54%",
    quote: "【模拟测试】将 55% 更正为 54%。",
    kind: "事实陈述", relation: "更正", targetClaimId: "C6",
  });
  const result = evaluateClaimUpdates(before.claims, source, "2024-05-01");
  assert.equal(result.claims.find((item) => item.id === "C6")?.state, "已确认披露");
  assert.equal(result.claims.find((item) => item.id === "SIM-CORRECTION-C1")?.state, "模拟测试 · 更正待复核");
  assert.match(result.claims.find((item) => item.id === "SIM-CORRECTION-C1")?.text ?? "", /54%/);
  assert.match(result.notices[0].title, /\[模拟\].*C6.*更正待复核/);
  assert.equal(snapshot("huakun", [...SEED_SOURCES, source]).headline, before.headline);
});

test("模拟材料的有效期过后只触发目标主张复核，不判为虚假", () => {
  const before = snapshot("huakun", SEED_SOURCES);
  const source = simulatedUpdate("SIM-EXPIRY", {
    text: "【模拟】该业务状态仅适用至 2024 年 4 月 30 日",
    quote: "【模拟测试】本陈述有效至 2024 年 4 月 30 日。",
    kind: "事实陈述", relation: "仅提及", targetClaimId: "C5", validUntil: "2024-04-30",
  });
  assert.equal(evaluateClaimUpdates(before.claims, source, "2024-04-30").impacts.length, 0);
  const result = evaluateClaimUpdates(before.claims, source, "2024-05-01");
  assert.equal(result.impacts.length, 1);
  assert.equal(result.impacts[0].reviewState, "到期需复核");
  assert.equal(result.claims.find((item) => item.id === "C5")?.state, "表态已确认 · 结果未发生");
  assert.equal(result.claims.find((item) => item.id === "SIM-EXPIRY-C1")?.state, "模拟测试 · 到期需复核");
  assert.match(result.notices[0].detail, /过期不表示原说法为假/);
  assert.equal(result.claims.some((item) => item.state === "虚假"), false);
});

test("新进展关系是更新，不能误判成对旧材料的更正", () => {
  const before = snapshot("huakun", SEED_SOURCES);
  const source = simulatedUpdate("SIM-UPDATE", {
    text: "【模拟】交易有后续进展", quote: "【模拟测试】将于下次公告披露进展。",
    kind: "事实陈述", relation: "更新", targetClaimId: "C3",
  });
  const result = evaluateClaimUpdates(before.claims, source, "2024-05-01");
  assert.equal(result.impacts.length, 0);
  assert.equal(result.notices.length, 0);
  assert.equal(result.claims.find((item) => item.id === "C3")?.state, "已被后续结果取代");
  assert.equal(snapshot("huakun", [...SEED_SOURCES, source]).headline, before.headline);
});
