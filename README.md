# Jellydash (multi-server)

A web dashboard for managing one or more Jellyfin servers from a single instance, with **access groups** that Wizarr can apply when an invited user activates their account.

This is a fork of [developed-by-will/jellydash](https://github.com/developed-by-will/jellydash) (MIT). Original work: Will. Changes here: multi-server support, per-server access groups, encrypted API-key storage, local admin login, an internal API for Wizarr, and removal of music, social-post and home-reorder features.

## What it does

- **Servers**: register any number of Jellyfin servers by external https URL and a dedicated API key. Switch with the selector in the header.
- **Access groups** (per server): libraries, maximum parental rating, blocked and allowed tags, downloads, Live TV, max sessions.
- **Users**: searchable table, per-user rating cap, enable/disable, remove, can-download.
- **Create user**: creates the user with one merged policy write from the chosen group, sets the password, applies subtitle and home layout defaults to that user only. If any step fails, the new user is deleted.
- **Libraries**: sync from Jellyfin, assign libraries to groups.
- **Manage Ratings**: the list of ratings offered in pickers.
- **Wizarr integration**: a Wizarr fork reads groups from this app so each invite can place the new user in a group on each server. See [docs/internal-api.md](docs/internal-api.md).

Rate Content and Watchlist Settings (polling) are being ported to multi-server and arrive in a later release.

## Install

You need Docker and a reverse proxy that terminates TLS (Synology DSM reverse proxy, Caddy, Traefik, nginx).

1. Copy `.env.example` to `.env` and fill it in. Generate secrets with `openssl rand -base64 32`.
2. Create the admin password hash:

   ```
   docker run --rm -it ghcr.io/whatthenwhat/jellydash-multi node scripts/hash-password.mjs
   ```

   Put the printed value in `ADMIN_PASSWORD_HASH`. In a compose `.env` file, write each `$` as `$$`.
3. Start it:

   ```
   docker compose up -d
   ```

   The container listens on port 4000 and is bound to `127.0.0.1` in the sample compose file. Point your reverse proxy at it and set `PUBLIC_BASE_URL` to the proxy's https address.
4. Sign in, open **Servers**, add each Jellyfin server (external https URL and a dedicated API key), then **Libraries > Sync**, then create access groups.

Data lives in `/data` (SQLite). Back up that folder and keep `MASTER_KEY`: it decrypts the stored API keys.

## Security notes

- Jellyfin API keys are encrypted at rest with AES-256-GCM using `MASTER_KEY`. Use one dedicated key per app per server so a key can be revoked on its own.
- TLS verification is always on. For a private CA, mount the CA file and set `EXTRA_CA_FILE`.
- Server URLs must be https unless `ALLOW_INSECURE_HTTP=true`.
- Login is a single local admin account (scrypt hash). Five failed attempts per username lock that username for 15 minutes. Restrict the admin address at your reverse proxy (LAN only is recommended).
- State-changing requests are checked against `PUBLIC_BASE_URL` (CSRF).
- Do not publish `/api/internal/` through the proxy.
- The app never grants administrator rights or all-library access through access groups.

## Development

```
npm ci
npm run dev        # http://localhost:4000
npm test           # core logic, uses Node's built-in test runner and a fake Jellyfin
```

Requires Node 22.13 or newer (`node:sqlite`).

## License

MIT. See [LICENSE](LICENSE).
