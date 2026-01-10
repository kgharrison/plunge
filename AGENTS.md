# Agent Instructions

## Project: Plunge

Pool control app for Pentair ScreenLogic/IntelliCenter systems.

### Quick Commands

```bash
# Check pool status
node pool-status.js

# Control pool (see help)
node pool-control.js help

# Get raw status JSON
node pool-control.js raw

# Toggle a circuit
node pool-control.js circuit 6 on   # Turn on Pool pump
node pool-control.js circuit 1 on   # Turn on Spa
node pool-control.js circuit 4 on   # Turn on Pool Lights
node pool-control.js circuit 5 on   # Turn on Waterfall Light
```

### Credentials

- **CLI tools**: Use `config.local.js` (gitignored)
- **Web app**: Stored in browser localStorage, sent via HTTP headers
- **Fallback**: Environment variables in `.env.local` (POOL_SYSTEM_NAME, POOL_PASSWORD)
- System name format: `Pentair: XX-XX-XX` (app auto-prepends "Pentair: " if user omits it)

### Circuit Reference

| ID | Name | Type | Notes |
|----|------|------|-------|
| 1 | Spa | Pump | Body index 1 |
| 2 | Polaris | Cleaner | - |
| 3 | Jets | Feature | - |
| 4 | Lights | IntelliBrite | Pool lights |
| 5 | Waterfall Light | IntelliBrite | - |
| 6 | Pool | Pump | Body index 0 |
| 7 | Waterfall | Feature | - |
| 8 | High Speed | Pump speed | - |

### Body Reference

| Index | ID | Name | Circuit | Has Solar | Has Gas Heater |
|-------|-----|------|---------|-----------|----------------|
| 0 | 1 | Pool | 6 | ✅ | ✅ (shared) |
| 1 | 2 | Spa | 1 | ❌ | ✅ (shared) |

### Heat Modes

| Value | Name | Available For |
|-------|------|---------------|
| 0 | Off | Pool, Spa |
| 1 | Solar | Pool only |
| 2 | Solar Preferred | Pool only |
| 3 | Heater (Gas) | Pool, Spa |

### IntelliBrite Light Commands

```javascript
// Solid colors
16: White, 13: Blue, 14: Green, 15: Red, 17: Purple

// Shows/Modes
3: Sync, 4: Swim, 5: Party, 6: Romance
7: Caribbean, 8: American, 9: Sunset, 10: Royal
```

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/status` | GET | Pool status (temps, circuits, connection type) |
| `/api/circuit/:id` | POST | Toggle circuit `{ state: boolean }` |
| `/api/temp/:body` | POST | Set temperature `{ temp: number }` (body: pool/spa/0/1) |
| `/api/heat/:body` | POST | Set heat mode `{ mode: number }` |
| `/api/lights` | POST | Send light command `{ command: number }` |
| `/api/connection` | GET | Connection info |
| `/api/connection` | DELETE | Clear connection cache (force reconnect) |

All routes accept credentials via headers: `X-Pool-System-Name`, `X-Pool-Password`

### Key Architecture Decisions

1. **Connection Strategy**: Auto-detect local WiFi first (1s timeout), fall back to Pentair cloud
2. **Optimistic UI**: All toggles update immediately, poll for confirmation, rollback on failure
3. **Credentials**: Client-side storage (localStorage) - this is a personal app, not multi-tenant
4. **No auto-retry**: On connection failure, show error and let user manually retry (Pentair cloud is flaky, auto-retry causes rate limiting)

### Common Issues

- **"Could not find gateway" instantly**: Wrong system name format. Must be `Pentair: XX-XX-XX`
- **Timeouts after many requests**: Pentair cloud rate limiting. Wait a few minutes.
- **Local connection fails**: Not on same WiFi as pool controller, or controller not discoverable

### Development

- Branch: `dev` for development, `main` for stable
- Design docs in `design-docs/`
- Run dev server: `npm run dev`
