# Client state — Zustand

```
src/stores/
  index.ts              the ONLY thing features import
  hooks.ts              one hook per value; the public API
  store-provider.tsx    per-request store instance + the selector hook
  create-app-store.ts   composes the slices into one store
  types.ts              AppState, SliceCreator
  slices/
    toast-slice.ts
    desk-slice.ts
    markets-slice.ts
```

## What belongs here, and what does not

This store is for **client state that outlives one component**. Almost nothing
qualifies, and that is the point.

| State | Where it goes |
|---|---|
| Investor rows, trades, settings, anything from a table | Server Component, fetched per request |
| Mutations | Server Action + `revalidatePath` / `router.refresh()` |
| A form's fields, a dropdown's open flag | `useState`, in that component |
| A value two distant components share | **here** |
| A live feed one place subscribes to and several read | **here** |

Putting server data in the store gives you two sources of truth for the same
rows and a cache to invalidate by hand. The server already does that job. The
three slices here are the cases that genuinely do not fit anywhere else:
toasts are raised from anywhere and drawn in one place; the desk's layout is a
preference that should survive navigation; market rows arrive on a socket.

## The rule that matters

**Never create the store at module scope.**

A `"use client"` component is still rendered on the server for the initial
HTML, and a module-level store is created once per server process — shared by
every request it handles. One investor's data could render into another
investor's page. That is why `createAppStore()` is called inside
`StoreProvider` and held in a ref, and why `zustand/vanilla`'s `createStore`
is used rather than the React `create`.

`StoreProvider` is mounted once, in `src/app/layout.tsx`.

## Using it

```tsx
import { useToast, useDeskTab, useSetDeskTab } from "@/stores";

const { success, error } = useToast();
const tab = useDeskTab();
const setTab = useSetDeskTab();
```

Import from `@/stores` — never from `@/stores/slices/...`. Everything outside
this folder depends on the hook names, not on Zustand, so the implementation
stays replaceable.

### Selectors

Each hook selects one value, which is what keeps re-renders tight: a chart
reading `useMarkets()` does not re-render because a toast appeared.

If you write a selector by hand, select the narrowest thing you need:

```tsx
const tab = useAppStore((s) => s.deskTab);       // re-renders on tab changes
const all = useAppStore((s) => s);               // re-renders on EVERYTHING
const bad = useAppStore((s) => ({ a: s.a }));    // re-renders always — new object
```

The last one is the common mistake: a fresh object or array never equals the
previous one, so the component re-renders on every store change. Select fields
separately, or use `useShallow` from `zustand/react/shallow`.

## Adding a slice

1. `slices/<name>-slice.ts` — export the `XSlice` type and `createXSlice`,
   typed `SliceCreator<XSlice>`.
2. Add it to `AppState` in `types.ts`.
3. Spread it in `create-app-store.ts`.
4. Add hooks to `hooks.ts` and export them from `index.ts`.

Name every action — the third argument to `set`, e.g. `"desk/tab"`. It is what
shows up in Redux DevTools, and an unnamed action there is an anonymous state
change you will be reverse-engineering later.

Slices are separate files but **one store**. Separate stores cannot read each
other, so the first time one needs a value from another somebody imports
across the boundary and it is gone anyway.

## Deliberately not here

**Scora's conversation.** Scora is a v0.1 shell — its input is disabled on
purpose, because an input that swallows questions in silence is worse than one
that admits it is not connected. There is no message state to hold yet.
Scora's conversation is the reason this store exists, so it should be the next
slice; building it before there is a model behind it would be inventing state
for a feature that cannot use it.

**Persistence.** `zustand/persist` reads `localStorage` after hydration, so the
first client render disagrees with the server's HTML — either React warns about
a mismatch or the panel visibly snaps shut a frame later. The fix is
`skipHydration` plus a rehydrate effect, which trades the warning for the
flash. Not worth it to remember a collapsed rail; reconsider if the desk grows
state that is expensive to re-choose.
