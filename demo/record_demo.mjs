import { unlink } from 'node:fs/promises';

const URL = 'https://event-evidence-cathy-2026.jscsjeremy.chatgpt.site';
const OUT = 'C:/E-user/tonghuashun03/demo/event_evidence_demo.webm';
const FAST = process.env.FAST === '1';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= 'C:/E-user/tonghuashun03/demo/ms-playwright';
const { chromium } = await import('playwright');

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: 'C:/E-user/tonghuashun03/demo', size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
const startedAt = Date.now();
const elapsed = () => ((Date.now() - startedAt) / 1000).toFixed(1);
const note = (label) => console.log(`${elapsed()}s ${label}`);
const until = async (second) => {
  if (FAST) { await page.waitForTimeout(500); return; }
  const left = second * 1000 - (Date.now() - startedAt);
  if (left > 0) await page.waitForTimeout(left);
};

async function caption(message) {
  await page.evaluate((message) => {
    let box = document.querySelector('#demo-caption');
    if (!box) {
      box = document.createElement('div');
      box.id = 'demo-caption';
      box.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483646;max-width:1060px;width:max-content;min-width:600px;padding:12px 20px;border-radius:10px;background:rgba(10,31,47,.94);color:#fff;font:600 17px/1.55 "Microsoft YaHei",sans-serif;text-align:center;white-space:pre-line;box-shadow:0 8px 28px rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.22);pointer-events:none;';
      document.body.append(box);
    }
    box.textContent = message;
  }, message);
  note('字幕：' + message.replaceAll('\n', ' / '));
}

async function click(locator, label) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    await page.evaluate(({ x, y }) => {
      let dot = document.querySelector('#demo-cursor');
      if (!dot) {
        dot = document.createElement('div');
        dot.id = 'demo-cursor';
        dot.style.cssText = 'position:fixed;z-index:2147483647;width:20px;height:20px;border:3px solid #f1ab55;border-radius:50%;background:rgba(241,171,85,.15);box-shadow:0 0 0 4px rgba(241,171,85,.2);pointer-events:none;transition:left .2s,top .2s;';
        document.body.append(dot);
      }
      dot.style.left = `${x - 10}px`;
      dot.style.top = `${y - 10}px`;
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  }
  await page.waitForTimeout(FAST ? 100 : 450);
  await locator.click();
  note('点击：' + label);
}

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByRole('heading', { name: '拟收购华鲲振宇 70% 股权' }).waitFor({ state: 'visible', timeout: 15000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '拟收购华鲲振宇 70% 股权' }).waitFor({ state: 'visible' });
  note('公开网站载入成功（全新无 Cookie Chrome 上下文）');
  await caption('公开 Web 产品演示 · ' + URL + '\n资料包截至 2024-04-19；页面不声称实时更新。');
  await until(8);

  await caption('同一家公司有两件股权事项：标的不同，不能只按公司名称合并。');
  await click(page.locator('.event-item').filter({ hasText: '倍特期货' }), '倍特期货独立事件');
  await until(17);
  await click(page.locator('.event-item').filter({ hasText: '华鲲振宇' }), '返回华鲲振宇事件');
  await until(22);

  await caption('回放至 4 月 18 日：当时披露“很可能无法继续推进”，尚未对外披露正式终止。');
  await click(page.getByRole('button', { name: '回放至 4 月 18 日' }), '历史回放');
  await page.getByText('很可能无法继续推进', { exact: false }).first().waitFor({ state: 'visible' });
  await until(31);
  await click(page.locator('.timeline-row').filter({ hasText: 'GS-05' }), '4 月 18 日原始公告 GS-05');
  await caption('右侧保留原文、PDF 链接与四种时间；未知发生时间不会用抓取时间补填。');
  await page.locator('.inspector').getByText('四种时间', { exact: true }).scrollIntoViewIfNeeded();
  await until(43);

  await caption('导入新材料：填入逐份核验的 4 月 19 日公告样本，并核对来源与原句。');
  await click(page.getByRole('button', { name: '导入新材料' }), '打开导入抽屉');
  await until(49);
  await click(page.getByRole('button', { name: /填入已核验的 4 月 19 日公告演示样本/ }), '填入真实公告样本');
  await until(58);

  await caption('现在调用 DeepSeek 提取可回查的原子主张；输出仍需人工核对。');
  await click(page.getByRole('button', { name: '提取主张并建议归属' }), '提取主张和事件建议');
  await page.locator('.analysis-head strong').waitFor({ state: 'visible', timeout: 60000 });
  const mode = (await page.locator('.analysis-head strong').textContent())?.trim() || '';
  const claimCount = await page.locator('.analysis-claim').count();
  const suggestedCount = await page.locator('.match-options em').count();
  const suggestedLabel = suggestedCount ? (await page.locator('.match-options label:has(em)').first().textContent())?.trim() || '' : '';
  note(`抽取模式：${mode}；主张数量：${claimCount}；建议归属：${suggestedLabel || '不确定'}`);
  await until(69);
  await caption(mode.includes('DeepSeek')
    ? `DeepSeek 在线抽取 ${claimCount} 条主张；${suggestedLabel ? '用户核对建议事件与引文后确认。' : '归属不确定，由用户核对交易标的并纠正。'}`
    : '在线模型未完成抽取；页面明确显示人工核验索引或人工核对模式。');
  await page.getByText('选择事件归属').scrollIntoViewIfNeeded();
  await click(page.locator('.match-options label').filter({ hasText: '拟收购华鲲振宇 70% 股权' }), '人工确认事件归属');
  if (claimCount === 0) {
    await page.getByPlaceholder('如：公司披露拟转让某项股权').fill('公司披露原重组方案已终止');
    note('手工补充主张（模型或接口不可用）');
  }
  await until(82);
  await click(page.getByRole('button', { name: '确认归属并导入' }), '确认归属并导入');
  await page.getByText('2023 年披露的收购方案已终止', { exact: false }).waitFor({ state: 'visible' });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await until(91);

  await caption('4 月 19 日公开披露后，主结论变为“原方案终止”；旧版本仍可回看。');
  await click(page.locator('.timeline-row').filter({ hasText: 'GS-06' }), '正式终止公告 GS-06');
  await until(101);

  await caption('站内通知写明变化前后及 GS-06 原文依据；后续收购意向仍存在不确定性。');
  await click(page.getByRole('button', { name: /站内通知/ }), '状态变更通知');
  await page.getByText('原重组方案由预计难续变为正式终止').waitFor({ state: 'visible' });
  await until(111);
  await click(page.getByRole('button', { name: /原重组方案由预计难续变为正式终止/ }), '查看通知关联证据');

  await caption('新闻转引公告，不构成第二份独立事实证据；摘要也不能替代公告限制条件。');
  await click(page.locator('.timeline-row').filter({ hasText: 'NEWS-03' }), '新闻转引 NEWS-03');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await until(121);
  await caption('“事实陈述、观点、传闻”与“已确认、待复核”分开；只展示证据关系，不给买卖建议。');
  await click(page.getByRole('tab', { name: /逐条主张/ }), '逐条主张');
  await until(132);
  await caption('演示结束 · 关键结论均可返回原始材料；产品链接与代码仓库见 README。');
  await until(137);

  const video = page.video();
  await context.close();
  await video.saveAs(OUT);
  const rawPath = await video.path();
  if (rawPath !== OUT) await unlink(rawPath).catch(() => {});
  note('视频已保存：' + OUT);
} finally {
  await browser.close();
}






