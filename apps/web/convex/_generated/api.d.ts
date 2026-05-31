/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analysis from "../analysis.js";
import type * as auth_helpers from "../auth_helpers.js";
import type * as bookmarks from "../bookmarks.js";
import type * as embeddings from "../embeddings.js";
import type * as follows from "../follows.js";
import type * as preferences from "../preferences.js";
import type * as provider_credentials from "../provider_credentials.js";
import type * as takeaways from "../takeaways.js";
import type * as tracks from "../tracks.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analysis: typeof analysis;
  auth_helpers: typeof auth_helpers;
  bookmarks: typeof bookmarks;
  embeddings: typeof embeddings;
  follows: typeof follows;
  preferences: typeof preferences;
  provider_credentials: typeof provider_credentials;
  takeaways: typeof takeaways;
  tracks: typeof tracks;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
