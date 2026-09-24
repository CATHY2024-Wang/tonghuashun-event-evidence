$ErrorActionPreference = 'Stop'
$ffmpeg = Join-Path $PSScriptRoot 'pydeps\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe'
$video = Join-Path $PSScriptRoot 'event_evidence_demo.webm'
$output = Join-Path $PSScriptRoot 'event_evidence_demo.mp4'
$starts = @(0, 10, 22, 32, 44, 69, 91, 102, 121)
$inputs = @('-i', $video)
$filters = @()
$mixInputs = ''
for ($i = 0; $i -lt $starts.Count; $i++) {
  $file = Join-Path $PSScriptRoot ('voice_{0:d2}.wav' -f $i)
  $inputs += @('-i', $file)
  $delay = $starts[$i] * 1000
  $filters += ('[{0}:a]adelay={1}:all=1[a{2}]' -f ($i + 1), $delay, $i)
  $mixInputs += ('[a{0}]' -f $i)
}
$filters += ($mixInputs + 'amix=inputs=9:duration=longest:normalize=0,apad[aout]')
$filterComplex = $filters -join ';'
& $ffmpeg -hide_banner -loglevel warning -y @inputs -filter_complex $filterComplex -map '0:v:0' -map '[aout]' -c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart -shortest $output
if ($LASTEXITCODE -ne 0) { throw "FFmpeg failed with exit code $LASTEXITCODE" }
Get-Item -LiteralPath $output | Select-Object FullName,Length
