# extension-blocker

파일 확장자 차단 정책을 설정하고 실제 파일 업로드를 검증하는 과제 프로젝트

## 로컬 개발

```bash
npm install
npx supabase start
cp .env.example .env   # Supabase local credentials
npm run dev
```

## 테스트

```bash
npx supabase start
npm test
```

## Supabase prod 마이그레이션

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

## GCP 배포

Compute Engine + Docker + Supabase Cloud. 상세 절차는 [`docs/deploy/GCP.md`](docs/deploy/GCP.md) 참고.

```bash
# 로컬 Docker 검증
docker compose -f docker-compose.prod.yml up --build

# GCP push + VM
export GCP_PROJECT_ID=extension-blocker-1
./deploy/gcp/build-and-push.sh
./deploy/gcp/provision-vm.sh
```

## Table schema

`supabase/migrations/` — `extension_policy`, `upload_settings`, `uploads`, Storage bucket `uploads`.
