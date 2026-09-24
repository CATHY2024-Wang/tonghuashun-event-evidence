import { DiscoveryError, discoverCandidates, validateDiscoveryInput } from "@/lib/discovery";

export const runtime = "edge";

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return Response.json({ error: "请提交 JSON 检索条件。", code: "INVALID_INPUT" }, { status: 400 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "仅接受本站发起的检索请求。", code: "INVALID_ORIGIN" }, { status: 400 });
  }
  try {
    const input = validateDiscoveryInput(await request.json());
    const result = await discoverCandidates(input);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DiscoveryError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "JSON 格式错误。", code: "INVALID_INPUT" }, { status: 400 });
    }
    return Response.json({ error: "检索暂时失败，请稍后重试。", code: "DISCOVERY_FAILED" }, { status: 502 });
  }
}
