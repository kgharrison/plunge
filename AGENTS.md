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
node pool-control.js circuit 6 on   # Turn on Pool
node pool-control.js circuit 4 on   # Turn on Lights
```

### Credentials

- Stored in `config.local.js` (gitignored, local only)
- Never commit credentials to the repo

### Development

- Branch: `dev` for development, `main` for stable
- Design docs in `design-docs/`
