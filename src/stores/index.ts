/**
 * The store's public surface. Import from "@/stores", never from a slice.
 *
 * Everything a feature needs is here; anything not exported is an internal
 * detail of the store and free to change. If a component is reaching past
 * this file, either it needs something that belongs in hooks.ts or it is
 * doing something the store should be doing for it.
 */

export { StoreProvider, useAppStore, useAppStoreApi } from "./store-provider";

export {
  // toast
  useToast,
  useToasts,
  useDismissToast,
  type ToastApi,
  // desk layout
  useScoraOpen,
  useSetScoraOpen,
  useFeedOpen,
  useSetFeedOpen,
  useToggleScora,
  useToggleFeed,
  useDeskTab,
  useSetDeskTab,
  // live markets
  useMarkets,
  useSetMarkets,
  useMergeMarket,
} from "./hooks";

export type { AppState } from "./types";
export type { Toast } from "./slices/toast-slice";
export type { DeskTab } from "./slices/desk-slice";
