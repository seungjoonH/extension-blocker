#!/usr/bin/env bash
# Create (or recreate) a GCE VM that runs the container from Artifact Registry.
set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${GCP_REGION:=asia-northeast3}"
: "${GCP_ZONE:=asia-northeast3-a}"
: "${VM_NAME:=extension-blocker-app}"
: "${MACHINE_TYPE:=e2-small}"
: "${ARTIFACT_REPO:=extension-blocker}"
: "${IMAGE_NAME:=app}"
: "${IMAGE_TAG:=latest}"
: "${APP_ENV_FILE:=${HOME}/extension-blocker.prod.env}"

IMAGE_URI="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REPO}/${IMAGE_NAME}:${IMAGE_TAG}"
STARTUP_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/vm-startup.sh"

if [ ! -f "$APP_ENV_FILE" ]; then
  echo "Missing env file: ${APP_ENV_FILE}" >&2
  echo "Create it from deploy/gcp/env.production.example (Supabase secrets, no quotes)." >&2
  exit 1
fi

ENV_B64="$(base64 < "$APP_ENV_FILE" | tr -d '\n')"

if gcloud compute instances describe "$VM_NAME" \
  --project="$GCP_PROJECT_ID" \
  --zone="$GCP_ZONE" >/dev/null 2>&1; then
  echo "VM ${VM_NAME} already exists. Updating startup script and container..."
  gcloud compute instances add-metadata "$VM_NAME" \
    --project="$GCP_PROJECT_ID" \
    --zone="$GCP_ZONE" \
    --metadata="extension-blocker-image=${IMAGE_URI},extension-blocker-env-b64=${ENV_B64}" \
    --metadata-from-file=startup-script="$STARTUP_SCRIPT"
  gcloud compute instances reset "$VM_NAME" \
    --project="$GCP_PROJECT_ID" \
    --zone="$GCP_ZONE" \
    --quiet
else
  echo "Creating VM ${VM_NAME} (${MACHINE_TYPE}) in ${GCP_ZONE}..."
  gcloud compute instances create "$VM_NAME" \
    --project="$GCP_PROJECT_ID" \
    --zone="$GCP_ZONE" \
    --machine-type="$MACHINE_TYPE" \
    --boot-disk-size=20GB \
    --boot-disk-type=pd-balanced \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --tags=extension-blocker-http \
    --scopes=cloud-platform \
    --metadata="extension-blocker-image=${IMAGE_URI},extension-blocker-env-b64=${ENV_B64}" \
    --metadata-from-file=startup-script="$STARTUP_SCRIPT"

  gcloud compute firewall-rules create extension-blocker-allow-http \
    --project="$GCP_PROJECT_ID" \
    --allow=tcp:80,tcp:443,tcp:3000 \
    --target-tags=extension-blocker-http \
    --description="Allow HTTP/S and app port for extension-blocker VM" \
    2>/dev/null || true
fi

EXTERNAL_IP="$(gcloud compute instances describe "$VM_NAME" \
  --project="$GCP_PROJECT_ID" \
  --zone="$GCP_ZONE" \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"

echo
echo "VM external IP: ${EXTERNAL_IP}"
NIP_HOST="$(echo "${EXTERNAL_IP}" | tr '.' '-').nip.io"
echo "After startup (2-5 min), check:"
echo "  curl https://${NIP_HOST}/api/health"
echo
echo "HTTPS is provided by Caddy + nip.io (stable while the external IP is unchanged)."
