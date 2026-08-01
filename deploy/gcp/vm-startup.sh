#!/bin/bash
set -euo pipefail

IMAGE_URI="$(curl -sf -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/attributes/extension-blocker-image)"
ENV_B64="$(curl -sf -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/attributes/extension-blocker-env-b64)"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg

if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
    > /etc/apt/sources.list.d/google-cloud-sdk.list
  curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
    | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
  apt-get update
  apt-get install -y google-cloud-cli
fi

REGION="${IMAGE_URI%%-docker.pkg.dev*}"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

mkdir -p /etc/extension-blocker
echo "${ENV_B64}" | base64 -d > /etc/extension-blocker/app.env
chmod 600 /etc/extension-blocker/app.env

docker pull "${IMAGE_URI}"
docker rm -f extension-blocker-app 2>/dev/null || true
docker run -d \
  --name extension-blocker-app \
  --restart unless-stopped \
  --env-file /etc/extension-blocker/app.env \
  -p 127.0.0.1:3000:3000 \
  "${IMAGE_URI}"

EXTERNAL_IP="$(curl -sf -H "Metadata-Flavor: Google" \
  http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip)"
NIP_HOST="$(echo "${EXTERNAL_IP}" | tr '.' '-').nip.io"

mkdir -p /etc/extension-blocker
cat > /etc/extension-blocker/Caddyfile <<EOF
${NIP_HOST} {
    reverse_proxy 127.0.0.1:3000
}
EOF

docker rm -f extension-blocker-caddy 2>/dev/null || true
docker run -d \
  --name extension-blocker-caddy \
  --restart unless-stopped \
  --network host \
  -v /etc/extension-blocker/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v extension-blocker-caddy-data:/data \
  -v extension-blocker-caddy-config:/config \
  caddy:2-alpine

echo "extension-blocker app started with ${IMAGE_URI}"
echo "HTTPS URL: https://${NIP_HOST}"
