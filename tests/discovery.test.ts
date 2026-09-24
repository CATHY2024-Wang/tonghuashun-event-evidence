import test from "node:test";
import assert from "node:assert/strict";
import {
  DiscoveryError, discoverCandidates, validateDiscoveryInput,
} from "../lib/discovery";

const validInput = {
  stockCode: "002594",
  startDate: "2024-04-01",
  endDate: "2024-04-30",
  keyword: "终止",
  page: 2,
};

test("输入限制：六位代码、真实日期、365 天、40 字和 1–5 页", () => {
  assert.deepEqual(validateDiscoveryInput(validInput), validInput);
  for (const change of [
    { stockCode: "2594" },
    { startDate: "2024-02-30" },
    { endDate: "2025-05-01" },
    { keyword: "关".repeat(41) },
    { page: 6 },
    { page: 1.5 },
  ]) {
    assert.throws(() => validateDiscoveryInput({ ...validInput, ...change }), (error) =>
      error instanceof DiscoveryError && error.status === 400);
  }
  assert.equal(validateDiscoveryInput({ ...validInput, keyword: undefined, page: undefined }).page, 1);
});

test("使用深市真实 orgId，过滤其他公司和不安全链接，清理标题 HTML", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    requests.push({ url: String(url), init });
    if (requests.length === 1) {
      return Response.json({ stockList: [{
        code: "002594", category: "A股", orgId: "gshk0001211", zwjc: "比亚迪",
      }] });
    }
    return Response.json({ hasMore: true, announcements: [
      {
        secCode: "002594", secName: "比亚迪", announcementId: "123",
        announcementTitle: "<em>终止</em>&amp;进展公告",
        announcementTime: Date.UTC(2024, 3, 18, 16),
        adjunctUrl: "finalpage/2024-04-19/123.PDF",
      },
      {
        secCode: "000628", secName: "高新发展", announcementId: "124",
        announcementTitle: "另一公司的公告", announcementTime: Date.UTC(2024, 3, 19),
        adjunctUrl: "finalpage/2024-04-19/124.PDF",
      },
      {
        secCode: "002594", secName: "比亚迪", announcementId: "125",
        announcementTitle: "危险链接", announcementTime: Date.UTC(2024, 3, 19),
        adjunctUrl: "https://example.invalid/125.PDF",
      },
    ] });
  };
  const result = await discoverCandidates(validInput, fetcher);
  assert.equal(result.source, "cninfo-public");
  assert.equal(result.searchScope, "announcement-title");
  assert.equal(result.page, 2);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.candidates, [{
    id: "123", title: "终止&进展公告", companyName: "比亚迪", stockCode: "002594",
    disclosedOn: "2024-04-19", url: "https://static.cninfo.com.cn/finalpage/2024-04-19/123.PDF",
  }]);
  assert.match(result.warning, /公告标题.*全文核验/);
  assert.equal(requests.length, 2);
  const form = new URLSearchParams(String(requests[1].init?.body));
  assert.equal(form.get("stock"), "002594,gshk0001211");
  assert.equal(form.get("pageSize"), "20");
  assert.equal(form.get("pageNum"), "2");
  assert.equal(form.get("searchkey"), "终止");
  assert.equal(requests[0].init?.signal, requests[1].init?.signal);
});

test("沪市或目录外代码返回 400，接口异常返回 502", async () => {
  let calls = 0;
  const unsupported = async () => {
    calls += 1;
    return Response.json({ stockList: [
      { code: "600519", category: "A股", orgId: "gssh0600519" },
      { code: "000628", category: "A股", orgId: "gssz0000628" },
    ] });
  };
  for (const stockCode of ["600519", "830799", "200625"]) {
    await assert.rejects(
      discoverCandidates({ ...validInput, stockCode }, unsupported),
      (error) => error instanceof DiscoveryError && error.status === 400 && error.code === "STOCK_NOT_SUPPORTED",
    );
  }
  assert.equal(calls, 0);
  await assert.rejects(
    discoverCandidates({ ...validInput, stockCode: "000999" }, unsupported),
    (error) => error instanceof DiscoveryError && error.status === 400 && error.code === "STOCK_NOT_SUPPORTED",
  );
  await assert.rejects(
    discoverCandidates(validInput, async () => { throw new Error("offline"); }),
    (error) => error instanceof DiscoveryError && error.status === 502 && error.code === "CNINFO_UNAVAILABLE",
  );
  await assert.rejects(
    discoverCandidates(validInput, async () => Response.json({ wrong: [] })),
    (error) => error instanceof DiscoveryError && error.status === 502 && error.code === "CNINFO_BAD_RESPONSE",
  );
});

test("巨潮空结果可以返回空候选，不编造事件", async () => {
  let count = 0;
  const fetcher = async (): Promise<Response> => {
    count += 1;
    return Response.json(count === 1
      ? { stockList: [{ code: "002594", category: "A股", orgId: "gshk0001211" }] }
      : { totalAnnouncement: 0, hasMore: false, announcements: null });
  };
  const result = await discoverCandidates(validInput, fetcher);
  assert.deepEqual(result.candidates, []);
  assert.equal(result.hasMore, false);
});
