#!/usr/bin/env bash
# Coletor diário do bandwidth oficial da Vultr + specs/custo do plano — ver
# POST /api/admin/metrics/ingest-bandwidth. VULTR_API_KEY só existe aqui, na
# VPS: o Next.js/Railway nunca chama a Vultr API diretamente (ver
# ServerPlanInfo no schema), pra não depender do IP de egresso do Railway
# estar na allowlist da conta Vultr.
set -uo pipefail

CONFIG_FILE="${OPENCALL_METRICS_CONFIG:-/etc/opencall-metrics/config.env}"
# shellcheck source=/dev/null
source "$CONFIG_FILE"
: "${OPENCALL_INGEST_URL:?OPENCALL_INGEST_URL não configurada em $CONFIG_FILE}"
: "${OPENCALL_METRICS_SECRET:?OPENCALL_METRICS_SECRET não configurada em $CONFIG_FILE}"
: "${VULTR_API_KEY:?VULTR_API_KEY não configurada em $CONFIG_FILE}"
: "${VULTR_INSTANCE_ID:?VULTR_INSTANCE_ID não configurada em $CONFIG_FILE}"

command -v jq >/dev/null 2>&1 || { echo "collect-bandwidth: jq não instalado (apt-get install -y jq)" >&2; exit 1; }

vultr_get() {
  curl -fsS -H "Authorization: Bearer $VULTR_API_KEY" "https://api.vultr.com/v2/$1"
}

# GET de instância única às vezes toma 401 de "Unauthorized IP address" mesmo
# com a chave certa (visto em teste manual) — cai pro fallback via listagem,
# que não parece ter essa restrição.
instance_json=$(vultr_get "instances/$VULTR_INSTANCE_ID")
if [ -z "$instance_json" ] || ! echo "$instance_json" | jq -e '.instance' >/dev/null 2>&1; then
  instance_json=$(vultr_get "instances" | jq --arg id "$VULTR_INSTANCE_ID" '{instance: (.instances[] | select(.id == $id))}')
fi

plan_id=$(echo "$instance_json" | jq -r '.instance.plan')
region=$(echo "$instance_json" | jq -r '.instance.region')

if [ -z "$plan_id" ] || [ "$plan_id" = "null" ]; then
  echo "collect-bandwidth: não achei plan_id da instância $VULTR_INSTANCE_ID" >&2
  exit 1
fi

plan_json=$(vultr_get "plans?per_page=500" | jq --arg id "$plan_id" '.plans[] | select(.id == $id)')

vcpu_count=$(echo "$plan_json" | jq -r '.vcpu_count')
ram_mb=$(echo "$plan_json" | jq -r '.ram')
disk_gb=$(echo "$plan_json" | jq -r '.disk')
bandwidth_quota_gb=$(echo "$plan_json" | jq -r '.bandwidth')
monthly_cost_usd=$(echo "$plan_json" | jq --arg region "$region" -r '(.location_cost[$region].monthly_cost // .monthly_cost)')

plan_payload=$(jq -n \
  --arg planId "$plan_id" --arg region "$region" \
  --argjson vcpuCount "$vcpu_count" --argjson ramMb "$ram_mb" --argjson diskGb "$disk_gb" \
  --argjson bandwidthQuotaGb "$bandwidth_quota_gb" --argjson monthlyCostUsd "$monthly_cost_usd" \
  '{planId: $planId, region: $region, vcpuCount: $vcpuCount, ramMb: $ramMb, diskGb: $diskGb, bandwidthQuotaGb: $bandwidthQuotaGb, monthlyCostUsd: $monthlyCostUsd}')

bandwidth_json=$(vultr_get "instances/$VULTR_INSTANCE_ID/bandwidth")

status=0
# Manda toda a janela que a Vultr devolver, não só "ontem" — upsert por data é
# idempotente e isso cobre sozinho um cron perdido, sem lógica de backfill.
while read -r entry; do
  date=$(echo "$entry" | jq -r '.key')
  incoming=$(echo "$entry" | jq -r '.value.incoming_bytes')
  outgoing=$(echo "$entry" | jq -r '.value.outgoing_bytes')

  payload=$(jq -n \
    --arg date "$date" --arg incoming "$incoming" --arg outgoing "$outgoing" --argjson plan "$plan_payload" \
    '{date: $date, incomingBytes: $incoming, outgoingBytes: $outgoing, plan: $plan}')

  http_status=$(curl -sS -o /tmp/opencall-metrics-ingest-bw.log -w '%{http_code}' \
    -X POST "$OPENCALL_INGEST_URL/api/admin/metrics/ingest-bandwidth" \
    -H "Content-Type: application/json" \
    -H "x-metrics-secret: $OPENCALL_METRICS_SECRET" \
    -d "$payload")

  if [ "$http_status" != "204" ]; then
    echo "collect-bandwidth: ingest de $date falhou (HTTP $http_status): $(cat /tmp/opencall-metrics-ingest-bw.log)" >&2
    status=1
  fi
done < <(echo "$bandwidth_json" | jq -c '.bandwidth | to_entries[]')

exit $status
