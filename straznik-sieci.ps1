# Сторож сети: пишет каждую потерю и каждый выброс задержки.
# Замер объектами, не разбором текста: в разных окнах ping печатает
# то по-английски, то по-русски, и разбор строки ломается молча.
$cel = '1.1.1.1'
$log = 'C:\Users\zahar\Desktop\zovu desktop\siec-log.txt'
$prog = 70
$ile = 0; $wybuchy = 0; $straty = 0
"=== start $(Get-Date -Format 'dd.MM HH:mm:ss') cel=$cel prog=$prog ms ===" | Out-File -FilePath $log -Append -Encoding utf8
while ($true) {
  $t = Get-Date -Format 'HH:mm:ss'
  $ms = $null
  try { $ms = (Test-Connection -ComputerName $cel -Count 1 -ErrorAction Stop).ResponseTime } catch { $ms = $null }
  $ile++
  if ($null -eq $ms) { $straty++; "$t  POTERYA PAKETA" | Out-File -FilePath $log -Append -Encoding utf8 }
  elseif ($ms -ge $prog) { $wybuchy++; "$t  vybros $ms ms" | Out-File -FilePath $log -Append -Encoding utf8 }
  if ($ile % 300 -eq 0) {
    "$t  itog za 5 min: vybrosov $wybuchy, poter $straty iz 300" | Out-File -FilePath $log -Append -Encoding utf8
    $wybuchy = 0; $straty = 0
  }
  Start-Sleep -Seconds 1
}