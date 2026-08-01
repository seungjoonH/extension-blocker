# GCP 배포 (Compute Engine + Docker)

GCE `e2-small` VM 한 대에서 Next.js와 ClamAV(`clamd`)를 **같은 Docker 컨테이너**로 실행한다. Supabase(Postgres + Storage)는 Supabase Cloud를 사용한다

## 사전 준비

| 항목 | 상태 |
|---|---|
| Supabase prod + `supabase db push` | 완료 |
| `.env` (Supabase URL/key) | 로컬 워크트리 |
| GCP 프로젝트 `extension-blocker-1` | 완료 |
| Compute Engine + Artifact Registry API | 활성화 |

## 1. 로컬 Docker로 검증

```bash
cd .cursor/worktrees/gcp-deploy
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
curl -s http://localhost:3000/api/health
curl -s http://localhost:3000/api/policy
docker compose -f docker-compose.prod.yml down
```

`/api/health`가 `{"ready":true}`가 될 때까지 1~3분 걸릴 수 있다(ClamAV DB)

## 2. Artifact Registry에 이미지 push

VM이 이미지를 pull하려면 Compute Engine 기본 service account에 **Artifact Registry Reader** 역할이 필요하다

Console: IAM → `{PROJECT_NUMBER}-compute@developer.gserviceaccount.com` → 역할 추가

```bash
export GCP_PROJECT_ID=extension-blocker-1
export GCP_REGION=asia-northeast3
chmod +x deploy/gcp/build-and-push.sh
./deploy/gcp/build-and-push.sh
```

## 3. prod env 파일 준비

워크트리 `.env`를 복사해 홈 디렉터리에 둔다(경로는 `provision-vm.sh`의 `APP_ENV_FILE`)

```bash
cp .env ~/extension-blocker.prod.env
# deploy/gcp/env.production.example 참고
```

## 4. GCE VM 생성 및 배포

```bash
export GCP_PROJECT_ID=extension-blocker-1
export APP_ENV_FILE=$HOME/extension-blocker.prod.env
chmod +x deploy/gcp/provision-vm.sh
./deploy/gcp/provision-vm.sh
```

스크립트 출력 IP로 확인:

```bash
curl http://<EXTERNAL_IP>/api/health
```

## 5. HTTPS (제출 URL)

### A. nip.io + Caddy (권장, 도메인 없이 고정 HTTPS)

`vm-startup.sh`가 VM 외부 IP로 `34-64-155-12.nip.io` 형식 호스트명을 만들고, Caddy가 자동으로 Let's Encrypt 인증서를 발급한다. IP가 바뀌지 않는 한 호스트명도 유지된다

`provision-vm.sh` 실행 후 startup 로그 또는 아래로 확인:

```bash
curl -s https://34-64-155-12.nip.io/api/health
```

인증서 발급 직후 1~2분 걸릴 수 있다

### B. Cloudflare Quick Tunnel (비권장)

VM에 SSH 접속 후 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) 설치:

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

출력되는 `*.trycloudflare.com` URL은 **재시작마다 바뀔 수 있어** 면접 제출 URL로는 부적합하다

### C. Caddy + 본인 도메인

도메인 DNS A 레코드를 VM IP에 연결한 뒤 Caddyfile 호스트명을 해당 도메인으로 변경

## 환경 변수

| 변수 | 설명 |
|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key (`sb_secret_...`) 또는 legacy `service_role` |
| `SUPABASE_STORAGE_BUCKET` | `uploads` |
| `CLAMAV_HOST` | `127.0.0.1` (컨테이너 내부) |
| `CLAMAV_PORT` | `3310` |
| `CLAMAV_TIMEOUT_MS` | `30000` |
| `SERVER_MAX_REQUEST_BYTES` | `58720256` (~56MB) |

## VM 재배포

이미지를 다시 push한 뒤:

```bash
./deploy/gcp/build-and-push.sh
./deploy/gcp/provision-vm.sh
```

기존 VM이 있으면 metadata 갱신 후 reset한다

## 문제 해결

| 증상 | 확인 |
|---|---|
| `/api/health` → `ready:false` | `docker logs extension-blocker-app` — clamd 기동/freshclam |
| 업로드 502 | Supabase key, 버킷, 마이그레이션 |
| VM에서 pull 실패 | VM service account에 Artifact Registry Reader 권한 |
