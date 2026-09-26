/**
 * Story name to export name: "With Icon" -> "WithIcon", "1st try" -> "_1stTry".
 * Empty when the name has no ASCII letters or digits.
 */
export function toValidIdentifier(name: string): string {
  const identifier = name
    .replace(/[^a-z0-9]/gi, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
  return /^\d/.test(identifier)
    ? `_${identifier}`
    : identifier
}
