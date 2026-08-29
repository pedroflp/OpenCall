#!/usr/bin/env bash
# Coletor horário de CPU/RAM/disco/rede da VPS — ver POST /api/admin/metrics/ingest.
# Sem `set -e`: expressões aritméticas $(( )) que avaliam pra 0 retornam status
# 1 no bash, o que derrubaria o script silenciosamente logo na primeira
# execução (delta zerado por falta de amostra anterior). Falhas que importam
# (config ausente, POST falhando) são checadas explicitamente abaixo.
set -uo pipefail

CONFIG_FILE="${OPENCALL_METRICS_CONFIG:-/etc/opencall-metrics/config.env}"
STATE_FILE="/var/lib/opencall-metrics/local.state"

# shellcheck source=/dev/null
source "$CONFIG_FILE"
: "${OPENCALL_INGEST_URL:?OPENCALL_INGEST_URL não configurada em $CONFIG_FILE}"
: "${OPENCALL_METRICS_SECRET:?OPENCALL_METRICS_SECRET não configurada em $CONFIG_FILE}"

mkdir -p "$(dirname "$STATE_FILE")"

# --- CPU: precisa de duas amostras pra virar percentual — guarda os
# contadores cumulativos de /proc/stat e compara com a execução anterior.
read -r _ user nice system idle iowait irq softirq steal _ _ < /proc/stat
total=$((user + nice + system + idle + iowait + irq + softirq + steal))
idle_all=$((idle + iowait))

# --- Rede: soma de todas as interfaces não-loopback (inclui tráfego de
# containers Docker do LiveKit — é o que corresponde ao consumo real).
read -r rx_total tx_total < <(tail -n +3 /proc/net/dev | awk -F: '
  { iface = $1; gsub(/^[ \t]+|[ \t]+$/, "", iface); if (iface == "lo") next
    n = split($2, a, /[ \t]+/)
    rx += a[2]; tx += a[10] }
  END { print rx+0, tx+0 }
')

now_epoch=$(date +%s)

if [ -f "$STATE_FILE" ]; then
  read -r prev_total prev_idle prev_rx prev_tx _ < "$STATE_FILE"
else
  prev_total=$total
  prev_idle=$idle_all
  prev_rx=$rx_total
  prev_tx=$tx_total
fi
echo "$total $idle_all $rx_total $tx_total $now_epoch" > "$STATE_FILE"

total_delta=$((total - prev_total))
idle_delta=$((idle_all - prev_idle))
net_rx_delta=$((rx_total - prev_rx))
net_tx_delta=$((tx_total - prev_tx))
[ "$net_rx_delta" -lt 0 ] && net_rx_delta=0
[ "$net_tx_delta" -lt 0 ] && net_tx_delta=0

# Primeira execução (sem estado anterior): delta é 0/indefinido, manda 0 — a
# leitura seguinte, uma hora depois, já tem uma amostra pra comparar.
if [ "$total_delta" -le 0 ]; then
  cpu_percent="0"
else
  cpu_percent=$(awk -v td="$total_delta" -v id="$idle_delta" 'BEGIN { printf "%.1f", (1 - (id / td)) * 100 }')
fi

# --- RAM ---
mem_total_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
mem_available_kb=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
ram_used_mb=$(( (mem_total_kb - mem_available_kb) / 1024 ))
ram_total_mb=$(( mem_total_kb / 1024 ))

# --- Disco ('/', que é onde o docker-compose do LiveKit grava) ---
read -r disk_used_kb disk_total_kb < <(df -P -k / | awk 'NR==2 {print $3, $2}')
disk_used_gb=$(awk -v k="$disk_used_kb" 'BEGIN { printf "%.2f", k / 1024 / 1024 }')
disk_total_gb=$(awk -v k="$disk_total_kb" 'BEGIN { printf "%.2f", k / 1024 / 1024 }')

captured_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

payload=$(cat <<JSON
{"capturedAt":"$captured_at","cpuPercent":$cpu_percent,"ramUsedMb":$ram_used_mb,"ramTotalMb":$ram_total_mb,"diskUsedGb":$disk_used_gb,"diskTotalGb":$disk_total_gb,"netRxBytes":"$net_rx_delta","netTxBytes":"$net_tx_delta"}
JSON
)

http_status=$(curl -sS -o /tmp/opencall-metrics-ingest.log -w '%{http_code}' \
  -X POST "$OPENCALL_INGEST_URL/api/admin/metrics/ingest" \
  -H "Content-Type: application/json" \
  -H "x-metrics-secret: $OPENCALL_METRICS_SECRET" \
  -d "$payload")

if [ "$http_status" != "204" ]; then
  echo "collect-local: ingest falhou (HTTP $http_status): $(cat /tmp/opencall-metrics-ingest.log)" >&2
  exit 1
fi
