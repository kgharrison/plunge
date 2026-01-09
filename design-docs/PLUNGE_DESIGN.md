# Plunge - Pool Control App

> A modern replacement for Pentair's ScreenLogic app

## Overview

Plunge is a custom pool control application for Pentair IntelliCenter/ScreenLogic systems. The goal is to create a better user experience than the official Pentair app while maintaining full functionality.

### Why?
- The official ScreenLogic app has poor UX
- Custom app allows tailored experience for your specific setup
- Foundation for home automation integrations

---

## Architecture

### Phase 1: Next.js Web App

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Browser   │────▶│  Next.js App    │────▶│  Pentair Cloud  │────▶│   Pool      │
│  (iPhone)   │     │  (Vercel/local) │     │  (screenlogic   │     │  Controller │
└─────────────┘     │                 │     │   server)       │     └─────────────┘
                    │  - API Routes   │     └─────────────────┘
                    │  - React UI     │
                    └─────────────────┘
```

### Phase 2: Native iOS App (Future)

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│  iOS App    │────▶│  Pentair Cloud  │────▶│   Pool      │
│  (Swift)    │     │                 │     │  Controller │
└─────────────┘     └─────────────────┘     └─────────────┘
       │                                           ▲
       │            (Local WiFi - direct)          │
       └───────────────────────────────────────────┘
```

---

## Tech Stack

### Phase 1 (Web)
| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| UI | React + Tailwind CSS |
| State | React hooks / SWR for data fetching |
| Pool Protocol | node-screenlogic |
| Deployment | Vercel (free tier) or local |

### Phase 2 (Native iOS)
| Layer | Technology |
|-------|------------|
| Language | Swift |
| UI | SwiftUI |
| Pool Protocol | Custom Swift port of node-screenlogic |
| Distribution | TestFlight → App Store (personal use) |

---

## Your Pool Setup

Based on API discovery (Jan 9, 2025):

### System Info
| Component | Details |
|-----------|---------|
| **Controller** | ScreenLogic v5.2 Build 738.0 |
| **Connection** | Remote via Pentair Cloud |
| **System Name** | `Pentair: F8-23-4F` |
| **Pump** | IntelliFlo VS (450-3450 RPM, variable speed) |
| **Heating** | Solar ✅ |
| **Lights** | 2x IntelliBrite (8 colors) |
| **Chlorinator** | None |
| **Chemistry** | None |

### Temperature Ranges
| Body | Min | Max |
|------|-----|-----|
| Pool | 40°F | 104°F |
| Spa | 40°F | 104°F |

### Circuits (8 total)
| ID | Name | Type | Pump Speed | Interface |
|----|------|------|------------|-----------|
| 1 | Spa | Spa mode | 3000 RPM | Spa side |
| 2 | Polaris | Cleaner | 2000 RPM | Feature |
| 3 | Jets | Generic | - | Feature |
| 4 | Lights | IntelliBrite | - | Light |
| 5 | Waterfall Light | IntelliBrite | - | Light |
| 6 | Pool | Pool mode | 1000 RPM | Pool |
| 7 | Waterfall | Generic | - | Feature |
| 8 | High Speed | Generic | 2850 RPM | Feature |

### IntelliBrite Colors
| Color | RGB |
|-------|-----|
| White | rgb(255, 255, 255) |
| Light Green | rgb(160, 255, 160) |
| Green | rgb(0, 255, 80) |
| Cyan | rgb(0, 255, 200) |
| Blue | rgb(100, 140, 255) |
| Lavender | rgb(230, 130, 255) |
| Magenta | rgb(255, 0, 128) |
| Light Magenta | rgb(255, 180, 210) |

### Pump Configuration (IntelliFlo VS)
| Circuit | Speed |
|---------|-------|
| Pool (6) | 1000 RPM |
| Polaris (2) | 2000 RPM |
| High Speed (8) | 2850 RPM |
| Spa (1) | 3000 RPM |
| Special circuits | 2600-2850 RPM |

Priming: 2300 RPM for 1 minute

### Equipment Flags
- ✅ `POOL_SOLARPRESENT` - Solar heating available
- ✅ `POOL_IBRITEPRESENT` - IntelliBrite lights
- ✅ `POOL_IFLOWPRESENT0` - IntelliFlow pump
- ❌ `POOL_CHLORPRESENT` - No salt chlorinator
- ❌ `POOL_ICHEMPRESENT` - No IntelliChem

### Valves
- Valve A (Load Center 1)
- Valve B (Device ID 41)

---

## API Capabilities

### Available Data (Read)
| Endpoint | Data |
|----------|------|
| Equipment State | Air temp, body temps, circuit states, freeze mode |
| Controller Config | Circuits, colors, equipment flags, temp ranges |
| Equipment Config | Pump details, valve config, heater config, remotes |
| Pump Status | Running state, RPM, watts, GPM |
| Schedules | Recurring and run-once schedules |
| Chemistry | pH, ORP, salt, saturation (if equipped) |
| Chlorinator | Pool/spa output %, salt level (if equipped) |
| System Time | Current date/time, DST status |
| Weather | Forecast data |
| History | Temperature data over time (43+ data points) |

### Available Controls (Write)
| Action | Parameters |
|--------|------------|
| Toggle Circuit | `circuitId`, `state` (on/off) |
| Set Pool Temp | `temp` (40-104°F) |
| Set Spa Temp | `temp` (40-104°F) |
| Set Heat Mode | `bodyId`, `mode` (0=Off, 1=Solar, 2=Solar Preferred, 3=Heater) |
| Set Cool Setpoint | `bodyId`, `temp` |
| Light Command | `command` (color/mode) |
| Set Circuit Runtime | `circuitId`, `runtime` (egg timer) |
| Create Schedule | `circuitId`, `startTime`, `stopTime`, `dayMask`, etc. |
| Update Schedule | `scheduleId`, schedule params |
| Delete Schedule | `scheduleId` |
| Set Pump Speed | `pumpId`, `circuitId`, `speed`, `isRPM` |
| Set Chlorinator | `poolOutput`, `spaOutput` (if equipped) |
| Set System Time | `date`, `adjustForDST` |
| Cancel Delay | Cancel pump/valve delays |

### Heat Modes
| Mode | Value | Description |
|------|-------|-------------|
| Off | 0 | No heating |
| Solar | 1 | Solar only |
| Solar Preferred | 2 | Solar first, then heater |
| Heater | 3 | Gas/electric heater |
| Don't Change | 4 | Keep current mode |

---

## Screens & Features

### MVP (Phase 1a)

#### 1. Dashboard (`/`)
- Current temps (air, pool, spa)
- Quick status indicators
- Most-used circuit toggles (Pool, Spa, Lights)
- Last updated timestamp

#### 2. Circuits (`/circuits`)
- All 8 circuits with on/off toggles
- Visual feedback on state changes
- Circuit function icons

#### 3. Temperature Control (`/temp`)
- Pool set point slider
- Spa set point slider
- Heat mode selector (Off, Solar, Heater)

### Post-MVP (Phase 1b)

#### 4. Lights (`/lights`)
- Color picker for IntelliBrite
- Light show modes
- Sync all lights

#### 5. Schedules (`/schedules`)
- View existing schedules
- Create/edit/delete schedules
- Quick enable/disable

#### 6. History (`/history`)
- Temperature history charts
- Runtime logs

### Phase 2 Additions (Native)

- Apple Watch complication
- Siri shortcuts ("Hey Siri, turn on the spa")
- HomeKit integration
- Widgets
- Offline mode (when on local WiFi)

---

## API Design

### Next.js API Routes

```
GET  /api/status          - Full equipment state
GET  /api/config          - Controller configuration

POST /api/circuit/:id     - Toggle circuit { state: boolean }
POST /api/temp/pool       - Set pool temp { temp: number }
POST /api/temp/spa        - Set spa temp { temp: number }
POST /api/heat/:body      - Set heat mode { mode: number }

GET  /api/schedules       - List schedules
POST /api/schedules       - Create schedule
PUT  /api/schedules/:id   - Update schedule
DELETE /api/schedules/:id - Delete schedule
```

### Response Format

```typescript
// GET /api/status
{
  connected: boolean;
  lastUpdated: string;
  air: { temp: number };
  pool: { temp: number; setPoint: number; heatMode: string; heating: boolean };
  spa: { temp: number; setPoint: number; heatMode: string; heating: boolean };
  circuits: Array<{
    id: number;
    name: string;
    state: boolean;
    type: string;
  }>;
}
```

---

## UI/UX Guidelines

### Design Principles
1. **Glanceable** - See status in < 1 second
2. **One-tap actions** - Toggle circuits without drilling down
3. **Responsive** - Instant visual feedback, even before server confirms
4. **Dark mode first** - Pool control often happens at night

### Color Palette
- Background: Deep blue/black (pool vibes)
- Accent: Cyan/teal (water)
- On state: Bright cyan glow
- Off state: Muted gray
- Temperature: Gradient from blue (cold) to orange (hot)

### Typography
- Large, readable temps
- Clear circuit labels
- Minimal text overall

---

## File Structure (Phase 1)

```
plunge/
├── design-docs/
│   └── PLUNGE_DESIGN.md      # This file
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx          # Dashboard
│   │   ├── circuits/
│   │   │   └── page.tsx
│   │   ├── temp/
│   │   │   └── page.tsx
│   │   └── api/
│   │       ├── status/route.ts
│   │       ├── circuit/[id]/route.ts
│   │       └── temp/[body]/route.ts
│   ├── components/
│   │   ├── CircuitToggle.tsx
│   │   ├── TempDisplay.tsx
│   │   ├── TempSlider.tsx
│   │   └── StatusIndicator.tsx
│   └── lib/
│       └── screenlogic.ts    # Pool connection wrapper
├── config.local.js           # Credentials (gitignored)
├── .env.local                 # Next.js env vars (gitignored)
├── package.json
└── tailwind.config.js
```

---

## Development Plan

### Phase 1a: MVP (3-5 days)
- [ ] Scaffold Next.js app with Tailwind
- [ ] Create ScreenLogic connection wrapper
- [ ] Build `/api/status` endpoint
- [ ] Build Dashboard page with live data
- [ ] Add circuit toggles
- [ ] Test on iPhone browser

### Phase 1b: Polish (3-5 days)
- [ ] Temperature control page
- [ ] Light color control
- [ ] Error handling & loading states
- [ ] Pull-to-refresh
- [ ] PWA manifest (add to home screen)

### Phase 1c: Extras (optional)
- [ ] Schedules view/edit
- [ ] History charts
- [ ] Deploy to Vercel

### Phase 2: Native iOS (2-4 weeks)
- [ ] Port ScreenLogic protocol to Swift
- [ ] Recreate UI in SwiftUI
- [ ] Add local WiFi direct connection
- [ ] Apple Watch app
- [ ] HomeKit integration

---

## Reference Code

The following Node.js scripts serve as protocol reference:

| File | Purpose |
|------|---------|
| `discover.js` | Find local/remote pool controllers |
| `pool-status.js` | Fetch and display pool state |
| `pool-control.js` | CLI for controlling circuits/temp |
| `get-config.js` | Fetch controller configuration |
| `api-discovery.js` | Full API capability discovery |

These use `node-screenlogic` and document exactly how the protocol works for future Swift port.

---

## Resources

- [node-screenlogic](https://github.com/parnic/node-screenlogic) - Node.js library (used in Phase 1)
- [node-intellicenter](https://github.com/parnic/node-intellicenter) - Reference for IntelliCenter protocol
- [ScreenLogic Protocol Wiki](https://github.com/parnic/node-screenlogic/wiki) - Protocol documentation

---

## Notes

- Connection is via Pentair's cloud service (`screenlogicserver.pentair.com:500`)
- System name format: `Pentair: XX-XX-XX`
- Password required for remote connections
- All communication is TCP-based (not HTTP)
- Next.js API routes bridge the gap between browser and TCP protocol
