# Запись демо-видео для заявки в TikTok.
#
# TikTok смотрит на приложение глазами: заявке нужен ролик, где видно живой
# интерфейс, вход и публикацию. Снимаем ровно окно браузера с пультом и
# ничего больше — прямоугольник задаётся жёстко, поэтому в кадр не попадёт
# ни рабочий стол, ни другие окна.
#
#   powershell -File nagraj-demo.ps1 -Sekundy 150
param(
  [int]$Sekundy = 150,
  [string]$Plik = "demo-tiktok.mp4",
  [int]$Szer = 1280,
  [int]$Wys  = 860
)

$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Okno {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@

# Ищем окно браузера с пультом. Заголовок вкладки меняется по ходу входа
# (пульт -> TikTok -> пульт), поэтому цепляемся один раз, до записи.
$proc = Get-Process chrome -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -match 'pulpit|TikTok|ZOVU' } |
  Select-Object -First 1
if (-not $proc) {
  $proc = Get-Process chrome -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
}
if (-not $proc) { throw "nie znalazlem okna Chrome" }

$h = $proc.MainWindowHandle
[void][Okno]::ShowWindow($h, 9)          # SW_RESTORE — из свёрнутого состояния
[void][Okno]::SetWindowPos($h, [IntPtr]::Zero, 0, 0, $Szer, $Wys, 0x0040)
[void][Okno]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 900

Write-Output "okno: $($proc.MainWindowTitle)"
Write-Output "nagrywam $Sekundy s do $Plik"

# gdigrab с жёстким прямоугольником: пишем только область окна.
# 15 кадров и crf 30 — ролик на две минуты выходит в несколько мегабайт,
# потолок заявки 50.
& ffmpeg -y -hide_banner -loglevel warning `
  -f gdigrab -framerate 15 -offset_x 0 -offset_y 0 -video_size "${Szer}x${Wys}" -i desktop `
  -t $Sekundy -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p `
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" $Plik

Write-Output "gotowe: $Plik"
