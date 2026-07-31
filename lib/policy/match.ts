/**
 * 파일명이 차단 확장자 목록 중 하나와 일치하면 그 확장자를 반환하고,
 * 일치하는 것이 없으면 null을 반환한다.
 *
 * 반환값을 거부 메시지에 그대로 사용할 수 있도록 boolean 대신 매칭된
 * 확장자 문자열을 반환한다(DESIGN.md §4.3 오류 메시지 예시 참고).
 */
export function findBlockedExtension(filename: string, blockedExtensions: readonly string[]): string | null {
  const lowerFilename = filename.toLowerCase();
  return blockedExtensions.find((ext) => lowerFilename.endsWith(`.${ext}`)) ?? null;
}
