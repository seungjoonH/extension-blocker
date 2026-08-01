export interface ExtignorePolicyInput {
  fixedExtensions: { name: string; active: boolean }[];
  customExtensions: { name: string }[];
}

// 점(.)으로 시작하는 숨김 파일명은 OS 파일 선택창에서 고르기 어렵고 accept 매칭도 불안정하다.
// 일반 텍스트 파일명으로 고정한다.
export const EXTIGNORE_FILENAME = 'extignore.txt';

// 설계 문서 4절: 활성 고정 확장자(알파벳순) → 커스텀 확장자(알파벳순), 줄바꿈으로 연결.
// 서버 API 없이 클라이언트가 이미 로드된 정책 상태로 파일 내용을 직접 만든다.
export function buildExtignoreContent(policy: ExtignorePolicyInput): string {
  const activeFixed = policy.fixedExtensions
    .filter((extension) => extension.active)
    .map((extension) => extension.name)
    .sort();
  const custom = policy.customExtensions.map((extension) => extension.name).sort();

  return [...activeFixed, ...custom].join('\n');
}
