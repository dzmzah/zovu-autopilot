# Запись демо-видео для заявки в TikTok.
#
# Требование ревью: показать весь путь в живом интерфейсе — вход, выбор
# ролика, публикацию и результат. Пишем ЛЕВЫЙ монитор целиком, 1920x1080,
# 25 кадров, без звука: TikTok звук не смотрит, а файл должен влезть в 50 МБ.
#
# Запуск:
#   powershell -ExecutionPolicy Bypass -File nagraj-demo.ps1 -Sekundy 120
#
# Остановить раньше — Ctrl+C в этом окне.

param(
  [int]$Sekundy = 120,
  [string]$Plik = "$PSScriptRoot\out\demo-tiktok.mp4"
)

$katalog = Split-Path $Plik -Parent
if (-not (Test-Path $katalog)) { New-Item -ItemType Directory -Force $katalog | Out-Null }

Write-Output "Пишу $Sekundy с в $Plik"
Write-Output "Начинаю через 3 секунды — переключись на браузер."
Start-Sleep -Seconds 3

# gdigrab снимает рабочий стол целиком; offset_x=0 берёт левый монитор.
# Размер кадра фиксируем, чтобы не зависеть от раскладки мониторов.
& ffmpeg -y -hide_banner -loglevel error `
  -f gdigrab -framerate 25 -offset_x 0 -offset_y 0 -video_size 1920x1080 `
  -t $Sekundy -i desktop `
  -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -movflags +faststart `
  $Plik

if (Test-Path $Plik) {
  $mb = [math]::Round((Get-Item $Plik).Length / 1MB, 1)
  Write-Output "Готово: $Plik — $mb МБ"
  if ($mb -gt 50) { Write-Output "ВНИМАНИЕ: больше 50 МБ, TikTok такой файл не примет" }
} else {
  Write-Output "Файл не создан — запись не пошла"
}
