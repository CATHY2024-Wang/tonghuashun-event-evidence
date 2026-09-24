import test from "node:test";
import assert from "node:assert/strict";
import {
  SEED_SOURCES, isDuplicateSource, snapshot, sortedSources,
  sourcesKnownBy, suggestEvent,
} from "../lib/evidence";

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
