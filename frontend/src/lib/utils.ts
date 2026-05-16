import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind CSS class names, resolving conflicts intelligently.
 * Uses clsx for conditional class logic and tailwind-merge to deduplicate.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
