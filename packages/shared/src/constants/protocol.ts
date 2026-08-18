/**
 * Exact client/server wire contract generation.
 *
 * Increment only for a breaking Socket.IO protocol change. Matching versions
 * communicate using one current schema; there are no legacy payload branches.
 */
export const PROTOCOL_VERSION = 2 as const;
