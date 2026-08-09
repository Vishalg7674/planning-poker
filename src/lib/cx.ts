/** Tiny classname joiner — filters falsy parts, joins with a space. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
