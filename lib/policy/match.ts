export function isExtensionBlocked(filename: string, blockedExtensions: readonly string[]): boolean {
  const lowerFilename = filename.toLowerCase();
  return blockedExtensions.some((ext) => lowerFilename.endsWith(`.${ext}`));
}
