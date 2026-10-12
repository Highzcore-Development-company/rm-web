import type { StateCreator } from "zustand";

import type { DeskSlice } from "./slices/desk-slice";
import type { MarketsSlice } from "./slices/markets-slice";
import type { ToastSlice } from "./slices/toast-slice";

/**
 * The whole client store, as one type.
 *
 * Slices are separate files but a SINGLE store. That is deliberate: separate
 * stores cannot read each other, so the first time one slice needs a value
 * from another someone reaches for a module-level import and the boundary is
 * gone anyway. One store, composed, keeps the seam honest.
 */
export type AppState = ToastSlice & DeskSlice & MarketsSlice;

/**
 * What every slice file exports.
 *
 * The second parameter is the middleware chain the store is built with — it
 * must match create-app-store.ts exactly or `set` loses its types inside the
 * slices. Change the middleware there, change it here.
 */
export type SliceCreator<T> = StateCreator<
  AppState,
  [["zustand/devtools", never]],
  [],
  T
>;
