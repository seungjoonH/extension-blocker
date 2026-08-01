#!/usr/bin/env bash
# Build the app image and push to Artifact Registry.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID (e.g. extension-blocker-1)}"
: "${GCP_REGION:=asia-northeast3}"
: "${ARTIFACT_REPO:=extension-blocker}"
: "${IMAGE_NAME:=app}"
: "${IMAGE_TAG:=latest}"

IMAGE_URI="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REPO}/${IMAGE_NAME}:${IMAGE_TAG}"

echo "==> Ensuring Artifact Registry repository exists..."
if ! gcloud artifacts repositories describe "$ARTIFACT_REPO" \
  --project="$GCP_PROJECT_ID" \
  --location="$GCP_REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$ARTIFACT_REPO" \
    --project="$GCP_PROJECT_ID" \
    --location="$GCP_REGION" \
    --repository-format=docker \
    --description="File extension blocker application images"
fi

echo "==> Configuring Docker auth for Artifact Registry..."
gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet

echo "==> Building ${IMAGE_URI}"
docker build --platform linux/amd64 -t "$IMAGE_URI" .

echo "==> Pushing ${IMAGE_URI}"
docker push "$IMAGE_URI"

echo
echo "Done. Image URI:"
echo "  ${IMAGE_URI}"
