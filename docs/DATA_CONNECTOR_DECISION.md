# iFinD MCP 与扶摇接入核查

核查日期：2026-09-24。本文件只记录官方公开资料、无密钥请求和本产品的接入决定；没有使用、读取或复用个人浏览器 Cookie，也没有取得或测试任何同花顺数据密钥。

| 来源 | 官方公开能力与接入方式 | 本次验证和限制 | 对题目三的角色 |
| --- | --- | --- | --- |
| [iFinD MCP](https://mcp.51ifind.com/) | [官方安装引导](https://mcp.51ifind.com/gwstatic/static/ds_web/ifind-mcp-web/skills/SKILL_INSTALL_GUIDE.md)要求账号与个人中心 MCP API Key；官方技能包的新闻公告服务列有 `search_news`、`search_notice` 等工具。MCP 请求使用服务端 `Authorization` 头；实际可用工具与数据权益须在取得密钥后通过 `tools/list` 确认。 | 无密钥请求官方 MCP 端点返回 HTTP 401 `Gateway authentication failed`，故没有实际搜索结果。检索返回的片段也不能替代公告或新闻原文。[会员服务协议](https://mcp.51ifind.com/#/terms/member-service)限制自身内部使用及向第三方转授权、分发或提供相近服务；公开 Web 代查、展示、缓存或再分发须先取得官方书面许可，并确认部署地域。 | 若获正式授权，优先用作公告、新闻等**候选来源发现**；原始链接、披露时间、转载关系仍需核对。 |
| [扶摇金融数据](https://fuyao.aicubes.cn/) | [快速开始](https://fuyao.aicubes.cn/docs/quickstart/)要求在管理后台申请 API Key；REST 使用 `X-api-key`，[MCP 文档](https://fuyao.aicubes.cn/docs/mcp/overview/)列出托管服务。 | 无密钥请求返回 `Missing X-api-key`。[资讯事件库文档](https://fuyao.aicubes.cn/docs/api-reference/news-events/)明确该能力暂未开放外部接入；[官方 Financial-API 仓库](https://github.com/HiThink-Tech/Financial-API/blob/main/README.md#数据能力与边界)说明公开 API/MCP/CLI 不提供新闻、公告、研报原文。公开材料未确认将数据展示给访客的许可条件。 | 获相应权限后可补充行情、财务、估值的**影响验证**；价格变化不能单独证明事件导致涨跌。不能作为本产品的文本证据主源。 |
| [GitHub 同花顺主题](https://github.com/topics/tonghuashun) | 既有官方扶摇项目，也有第三方 iFinD 配置、爬虫和网关。 | 第三方项目如 [financial-services-plugins-cn](https://github.com/NBreeze-Eric/financial-services-plugins-cn/blob/main/docs/IFIND-SETUP.md)仍要求已有 iFinD 订阅和令牌；开源代码不授予数据访问或公开展示权。 | 仅参考接口实现，不把第三方爬取通道作为公开演示的数据来源。 |

## 当前决定

公开产品继续使用已实测的巨潮**深市公告标题候选检索**，再由用户打开官方 PDF、粘贴可核查原句、让 DeepSeek 提取主张并人工确认事件归属。一个完整预置案例用于展示版本、证据冲突与通知；新增候选不会自动生成已确认事实。本产品没有接入 iFinD 或扶摇，也不使用个人 Cookie 或把个人 API Key 共享给所有访客。

## 获授权后的接入顺序

1. 与提供方确认可供公开 Web 产品使用的账号权益、访客展示、缓存和引用范围、调用频率及地域要求；取得相应服务端密钥，并在部署平台 Secret 中配置，绝不放到浏览器或仓库。
2. 优先接 iFinD 公告／新闻候选检索。先验证实际 `tools/list` 与 `tools/call`，再将返回结果映射为标题、发布者、披露时间、来源 URL、抓取时间和原始出处组。缺原文或时间时标未知／待复核；保持巨潮检索与手工导入作为回退。
3. 再按需要接扶摇行情、财务和估值。在事件详情旁展示带证券代码、日期、指标口径和来源的观察值；不得用同涨同跌推断因果，也不能让市场指标自动改写事实状态。
4. 分别测试授权失败、限流、空结果、重复转载、更新时间和原文链接失效；用户的已核验事件与本地导入记录不得因外部接口失败而丢失。
