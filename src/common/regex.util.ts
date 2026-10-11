/* eslint-disable prettier/prettier */

/**
 * Escapes user input before it goes into a MongoDB $regex. Without this a
 * search like "a(b" throws, and ".*" matches everything.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive "contains" regex for a trimmed, escaped search term. */
export function containsRegex(input: string): { $regex: string; $options: string } {
  return { $regex: escapeRegex(input.trim()), $options: 'i' };
}
