export interface ExtignorePolicyInput {
  fixedExtensions: { name: string; active: boolean }[];
  customExtensions: { name: string }[];
}

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
