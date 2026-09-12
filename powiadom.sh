#!/usr/bin/env bash
# Сигнал человеку, когда автопилот сломался.
#
# Зачем отдельный файл. Краснота на вкладке Actions сигналом НЕ является:
# 10-12.09.2026 сборка рилсов падала трое суток, сторож краснел трижды в
# день, и никто этого не увидел — писем GitHub про этот репозиторий не
# приходит вообще (проверено: за 30 дней ни одного на почту ZOVU). Лента
# встала, и заметили только тогда, когда Захар сам открыл Actions.
#
# Молчит, если секрета нет: без токена шаг не должен ронять прогон — иначе
# поломка уведомлений превратится в поломку сборки.
#
#   powiadom.sh "заголовок" "подробность"
set -u
if [ -z "${TELEGRAM_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT:-}" ]; then
  echo "[powiadom] Telegram не настроен (нет TELEGRAM_TOKEN/TELEGRAM_CHAT) — молчу"
  exit 0
fi
TYTUL="${1:-ZOVU autopilot}"
TRESC="${2:-}"
LINK="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"
TEKST=$(printf '%s\n%s\n\n%s' "$TYTUL" "$TRESC" "$LINK")
KOD=$(curl -s -o /tmp/powiadom.out -w '%{http_code}' \
  --data-urlencode "chat_id=${TELEGRAM_CHAT}" \
  --data-urlencode "text=${TEKST}" \
  --data-urlencode "disable_web_page_preview=true" \
  "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" || echo 000)
if [ "$KOD" = "200" ]; then
  echo "[powiadom] отправлено в Telegram"
else
  # Не роняем прогон: причина падения важнее, чем неудача уведомления.
  echo "[powiadom] Telegram ответил $KOD: $(head -c 300 /tmp/powiadom.out 2>/dev/null)"
fi
exit 0
