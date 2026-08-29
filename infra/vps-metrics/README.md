# Coletor de métricas da VPS (opencall-livekit)

Dois scripts, rodados por cron direto na VPS do LiveKit — não fazem parte do
build do Next.js/Railway. Mandam dados pra `/api/admin/metrics/ingest` e
`/api/admin/metrics/ingest-bandwidth`, exibidos na aba Infra do admin.

- `collect-local.sh` — a cada hora: CPU/RAM/disco/rede lidos de `/proc`.
- `collect-bandwidth.sh` — 1x/dia: bandwidth oficial + specs/custo do plano,
  via Vultr API. Precisa de `jq` (`apt-get install -y jq`).

## Instalação

```bash
sudo mkdir -p /etc/opencall-metrics /var/lib/opencall-metrics /opt/opencall-metrics
sudo cp collect-local.sh collect-bandwidth.sh /opt/opencall-metrics/
sudo chmod +x /opt/opencall-metrics/*.sh

sudo cp config.env.example /etc/opencall-metrics/config.env
sudo chmod 600 /etc/opencall-metrics/config.env
sudo $EDITOR /etc/opencall-metrics/config.env   # preencher os 4 valores reais

sudo crontab -e
```

Adicionar ao crontab do root (é quem tem acesso a `/proc` e ao docker-compose
do LiveKit sem sudo extra):

```cron
0 * * * * /opt/opencall-metrics/collect-local.sh >> /var/log/opencall-metrics.log 2>&1
5 0 * * * /opt/opencall-metrics/collect-bandwidth.sh >> /var/log/opencall-metrics.log 2>&1
```

O offset de 5 min depois da meia-noite é pra Vultr já ter fechado o dia
anterior quando o script roda.

## Pré-requisito na conta Vultr

A API key em `VULTR_API_KEY` precisa ter o IP desta VPS liberado na allowlist
(painel da Vultr → API), senão `collect-bandwidth.sh` toma 401.

## Botão de refresh no admin

O botão "Atualizar" na aba Infra dispara `collect-local.sh` na hora via SSH
(`src/lib/metrics/sshCollect.ts`), em vez de esperar a próxima janela do cron.
Precisa de um usuário SSH na VPS com permissão de rodar esse script e das
seguintes env vars no Railway:

```
VPS_SSH_HOST=<ip ou hostname da VPS>
VPS_SSH_PORT=22
VPS_SSH_USER=<usuário dedicado, não root>
VPS_SSH_PRIVATE_KEY=<chave privada PEM — \n escapado se a UI não aceitar multilinha>
```

Recomendado: criar um usuário restrito na VPS cujo `authorized_keys` force o
comando (`command="/opt/opencall-metrics/collect-local.sh"` antes da chave),
em vez de dar acesso de shell completo. Ex.:

```
command="/opt/opencall-metrics/collect-local.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... opencall-metrics-refresh
```

Isso limita o que a chave consegue executar mesmo se vazar.

## Teste manual

```bash
sudo -u root OPENCALL_METRICS_CONFIG=/etc/opencall-metrics/config.env /opt/opencall-metrics/collect-local.sh
sudo -u root OPENCALL_METRICS_CONFIG=/etc/opencall-metrics/config.env /opt/opencall-metrics/collect-bandwidth.sh
```

Cada um sai com status 0 em sucesso; erros vão pra stderr (e pro
`/var/log/opencall-metrics.log`, se rodado via cron).
