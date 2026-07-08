# 准备方案B的 vosk 中文离线模型。
# 模型文件较大(~42MB)、不入库（见 .gitignore 的 public/models/）。
# clone 仓库后运行本脚本即可生成 public/models/vosk-model-small-cn-0.22.tar.gz。
#
# 为什么要打包成 tar.gz：vosk-browser 只接受 gzip 压缩的 tar 包，且包内需保留
# 一层顶层目录（vosk-model-small-cn-0.22/）。alphacephei 官方下载是 .zip，
# 直接喂给 vosk-browser 会报 "Unrecognized archive format"，故需转换。

$ErrorActionPreference = 'Stop'
$modelDir = Join-Path $PSScriptRoot '..\public\models'
$zip      = Join-Path $modelDir 'vosk-model-small-cn-0.22.zip'
$extract  = Join-Path $modelDir 'vosk-model-small-cn-0.22'
$targz    = Join-Path $modelDir 'vosk-model-small-cn-0.22.tar.gz'
$url      = 'https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip'

New-Item -ItemType Directory -Force -Path $modelDir | Out-Null

if (Test-Path $targz) {
  Write-Host "已存在 $targz，无需重复准备。"
  exit 0
}

if (Test-Path $zip) {
  Write-Host "已有 zip，跳过下载，直接解压打包。"
} else {
  Write-Host "下载模型（~42MB，来自国外源 alphacephei.com，国内可能很慢/失败）..."
  curl.exe -L --fail $url -o $zip
  if ($LASTEXITCODE -ne 0) {
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    Write-Host ''
    Write-Host '下载失败 —— 国内访问 alphacephei.com 常不稳。二选一：' -ForegroundColor Yellow
    Write-Host '  A) 最省事：从已有模型的电脑，把 public/models/vosk-model-small-cn-0.22.tar.gz'
    Write-Host '     直接拷到本机同目录（42MB，U盘/微信/局域网都行），根本不用跑本脚本。'
    Write-Host "  B) 手动下载 $url ，把 zip 放进 public/models/ 后重跑本脚本"
    Write-Host '     （脚本会自动跳过下载、继续解压打包）。'
    exit 1
  }
}

Write-Host "解压..."
Expand-Archive -Path $zip -DestinationPath $modelDir -Force

Write-Host "打包成 tar.gz（保留顶层目录，vosk-browser 要求）..."
tar -czf $targz -C $modelDir vosk-model-small-cn-0.22

Write-Host "清理中间文件..."
Remove-Item $zip -Force
Remove-Item $extract -Recurse -Force

Write-Host "完成：$targz"
