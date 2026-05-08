/**
 * Story name to export name: "With Icon" -> "WithIcon"
 */
export function toValidIdentifier(name: string): string {
  return name
    .replace(/[^a-z0-9]/gi, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}
