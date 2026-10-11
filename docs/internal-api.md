# Internal API (service to service)

Used by the Wizarr fork to read access groups and report new members. Not meant for browsers.

- Base path: `/api/internal/v1`
- Auth: `Authorization: Bearer <INTERNAL_API_TOKEN>` (at least 32 characters, same value on both sides)
- Network: call it over the private Docker network (`http://jellydash-multi:4000`). Do not publish it through the reverse proxy.
- Errors: JSON `{ "message": "..." }` with 401 (bad token), 404 (unknown id), 503 (token not configured).

## GET /servers

```json
[{ "id": "9f2c...", "name": "Lake", "jf_server_id": "a1b2..." }]
```

`jf_server_id` is the Jellyfin `ServerId` (`/System/Info/Public` -> `Id`). Wizarr matches its own server entries against this value, so the URL each app uses can differ.

## GET /groups?jf_server_id=... | ?server_id=...

```json
[{ "id": "c3d4...", "server_id": "9f2c...", "name": "Family", "max_rating": 13, "library_count": 4, "updated_at": "..." }]
```

## GET /groups/{id}

Returns the exact policy fields to write. Apply them with one read-merge-write against the user's policy.

```json
{
  "group": { "id": "c3d4...", "name": "Family", "server_id": "9f2c...", "updated_at": "...", "library_ids": ["..."] },
  "server": { "id": "9f2c...", "name": "Lake", "jf_server_id": "a1b2..." },
  "policy_patch": {
    "IsDisabled": false,
    "EnableAllFolders": false,
    "EnabledFolders": ["..."],
    "MaxParentalRating": 13,
    "BlockedTags": ["mature"],
    "AllowedTags": [],
    "EnableContentDownloading": false,
    "EnableLiveTvAccess": false,
    "MaxActiveSessions": 2,
    "SyncPlayAccess": "None"
  }
}
```

Rules for the caller:

1. Only write the keys above. Never set `IsAdministrator` to true or `EnableAllFolders` to true.
2. `MaxParentalRating: null` means no cap and must be written as null.
3. After the write, read the policy back and confirm `EnabledFolders`, `MaxParentalRating`, `BlockedTags`, `AllowedTags`, `IsDisabled` and `EnableAllFolders` match. If they do not, delete the new user and report failure for that server.

## POST /memberships

Best effort, after the account exists. Safe to repeat (upsert on server + Jellyfin user id).

```json
{ "group_id": "c3d4...", "jf_user_id": "<32 hex>", "username": "name" }
```

Response: `201 {"ok": true}`.
