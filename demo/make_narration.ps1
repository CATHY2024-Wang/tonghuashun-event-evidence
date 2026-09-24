Add-Type -AssemblyName System.Speech
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice.SelectVoice('Microsoft Huihui Desktop')
$voice.Rate = 0
$voice.Volume = 100
$segments = @(
  @{ Start = 0; Text = '这是事件证据工作台。示例资料截至二零二四年四月十九日，并不代表实时更新。' },
  @{ Start = 8; Text = '同一家公司可能有不同事件。华鲲振宇收购与倍特期货股权转让，不能合并。' },
  @{ Start = 22; Text = '回放到四月十八日，公司只说现有方案很可能无法继续，不能提前写成正式终止。' },
  @{ Start = 32; Text = '原始公告保留引文、来源链接，以及发生、披露、收录和更新时间。未知时间保持未知。' },
  @{ Start = 44; Text = '接下来导入四月十九日的终止公告样本。在线模型提取了五条可回查主张，用户仍需核对每条引文。' },
  @{ Start = 69; Text = '模型建议归入华鲲振宇事件。用户核对主体、交易标的和原方案后，确认归属。' },
  @{ Start = 91; Text = '主结论更新为原方案终止。公司仍未确定后续收购的时间和方案。' },
  @{ Start = 102; Text = '站内通知写明变化和证据。新闻转引公告，不等于第二份独立原始证据。' },
  @{ Start = 121; Text = '事实陈述和核验状态分开展示。产品不推断股价因果，也不提供买卖建议。' }
)
for ($i = 0; $i -lt $segments.Count; $i++) {
  $path = Join-Path $PSScriptRoot ('voice_{0:d2}.wav' -f $i)
  $voice.SetOutputToWaveFile($path)
  $voice.Speak($segments[$i].Text)
  $voice.SetOutputToDefaultAudioDevice()
  Write-Output ('{0:d2} {1}s {2}' -f $i, $segments[$i].Start, $path)
}
$voice.Dispose()

