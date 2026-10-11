#!/bin/sh
set -eu

missing=""
for v in PUBLIC_BASE_URL MASTER_KEY NEXTAUTH_SECRET ADMIN_USERNAME ADMIN_PASSWORD_HASH; do
  eval "val=\${$v:-}"
  [ -n "$val" ] || missing="$missing $v"
done
if [ -n "$missing" ]; then
  echo "Missing required environment variables:$missing" >&2
  echo "See .env.example. Generate secrets with: openssl rand -base64 32" >&2
  exit 1
fi

case "$PUBLIC_BASE_URL" in
  https://*) ;;
  http://*) echo "WARNING: PUBLIC_BASE_URL is http. Session cookies will not be marked Secure." >&2 ;;
  *) echo "PUBLIC_BASE_URL must start with https://" >&2; exit 1 ;;
esac

if [ -z "${INTERNAL_API_TOKEN:-}" ]; then
  echo "INTERNAL_API_TOKEN is not set: the Wizarr integration API is disabled." >&2
elif [ "${#INTERNAL_API_TOKEN}" -lt 32 ]; then
  echo "INTERNAL_API_TOKEN must be at least 32 characters (openssl rand -hex 32)." >&2
  exit 1
fi

export NEXTAUTH_URL="${NEXTAUTH_URL:-$PUBLIC_BASE_URL}"
if [ -n "${EXTRA_CA_FILE:-}" ]; then export NODE_EXTRA_CA_CERTS="$EXTRA_CA_FILE"; fi

exec "$@"
