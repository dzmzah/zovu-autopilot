# Голосовое уведомление Захару. Русский голос Irina.
# Использование: powershell -ExecutionPolicy Bypass -File say.ps1 -Text "Захар, нужно подтвердить..."
param(
  [Parameter(Mandatory = $true)][string]$Text,
  [string]$Voice = "Microsoft Irina Desktop",
  [int]$Rate = 0,
  [int]$Volume = 100
)

Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $speaker.SelectVoice($Voice)
} catch {
  # если запрошенного голоса нет — берём первый доступный
  $speaker.SelectVoice($speaker.GetInstalledVoices()[0].VoiceInfo.Name)
}
$speaker.Rate = $Rate
$speaker.Volume = $Volume

# короткий сигнал перед речью, чтобы привлечь внимание
[console]::beep(880, 180)
[console]::beep(1175, 220)

$speaker.Speak($Text)
$speaker.Dispose()
