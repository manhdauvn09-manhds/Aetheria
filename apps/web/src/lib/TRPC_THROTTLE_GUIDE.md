# TRPC Client-Side Rate Limiting Guide

## Overview
Prevents spam on non-critical TRPC queries using client-side throttle/debounce.

## Safe to Throttle (Non-Critical Reads)
- `inventory.list` — 400ms throttle
- `leaderboard.*` — 400ms throttle
- `shop.catalog` — 400ms throttle
- `roster.list` — 400ms throttle

## DO NOT Throttle (Gameplay-Critical)
- `combat.move` — Real-time gameplay
- `pvp.queue` — Matchmaking action
- `combat.action` — Turn-based combat moves
- `chat.send` — User action

## Implementation Pattern

### Example 1: Throttle Leaderboard Query

**Before:**
```typescript
const LeaderboardInner = (): JSX.Element => {
  const top = trpc.pvp.lbTop.useQuery({ mode, limit: 50 });
  // ... auto-refetches on mode change (no throttle)
};
```

**After (with throttle):**
```typescript
import { createThrottle, THROTTLE_NON_CRITICAL } from "@/lib/trpc-throttle";

const LeaderboardInner = (): JSX.Element => {
  const [mode, setMode] = useState<Mode>("1v1");
  const throttle = useMemo(() => createThrottle(THROTTLE_NON_CRITICAL), []);
  
  const top = trpc.pvp.lbTop.useQuery({ mode, limit: 50 }, {
    onSuccess: async () => {
      // Only allow refresh every 400ms
      await throttle(() => Promise.resolve());
    }
  });
};
```

### Example 2: Debounce Search

**Before:**
```typescript
const handleSearch = (query: string) => {
  setQuery(query);
  // Triggers query on every keystroke (spam)
};
```

**After (with debounce):**
```typescript
import { createDebounce, DEBOUNCE_SEARCH } from "@/lib/trpc-throttle";

const handleSearch = (() => {
  const debounce = createDebounce(DEBOUNCE_SEARCH);
  return async (query: string) => {
    setQuery(query);
    const results = await debounce(() => 
      trpc.shop.search.query({ q: query })
    );
    setResults(results);
  };
})();
```

## Performance Impact
- **Throttle**: Requests separated by ≥400ms (minimum latency added: 0-400ms)
- **Debounce**: Rapid inputs grouped into single request (minimum latency added: 0-600ms)

## When to Apply
- User clicking refresh button repeatedly? → Apply throttle
- User typing in search box? → Apply debounce
- User rapidly switching tabs? → Apply throttle
- Real-time gameplay action? → DO NOT apply (no throttle)

## Safety Checklist
✓ Only throttle non-critical reads
✓ Never throttle user actions (moves, queue, send)
✓ Test gameplay feels responsive
✓ Monitor error rates (should not increase)
✓ Keep delays ≤600ms (imperceptible to user)
