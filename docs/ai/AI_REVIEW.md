# AI Review

프로젝트 전반에서 AI를 어떻게 썼는지, 결과를 어떻게 검증하고 취사선택했는지를 종합한다. 작업별 상세 프롬프트와 회고는 [`PROMPT_LOG.md`](PROMPT_LOG.md)에서 확인할 수 있다.

## 사용한 AI 도구와 스킬

| 도구/스킬 | 역할 |
|-----------|------|
| Claude Code | 주 Agent. 요구사항, 설계, 구현, 검증, 문서 작성 |
| Cursor Agent | 토큰 한도 대비 후속 검증, UI 개선, Cursor 환경 구성 |
| Superpowers (`brainstorming`, `writing-plans`, `subagent-driven-development`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`) | 바로 구현하지 않고 기획, 계획, TDD, 디버깅, 완료 전 검증 절차를 강제 |
| Context7 MCP | Next.js, Supabase 등 라이브러리 API를 추측하지 않고 공식 문서 기준으로 확인 |
| `document-review` | Markdown 문서의 문체, 용어, 구현 상태 정합성 검토 |
| `prompt-log` | 작업 단위 AI 활용 기록 (회고는 사용자가 직접 작성) |
| `commit` skill | 검증 후 Conventional Commits 형식 커밋 |

## AI 결과 처리 패턴

### 그대로 반영한 것

- 기능 구현 전 `AI_WORKFLOW.md`와 skill 체계를 먼저 정의하는 접근
- `REQUIREMENTS.md`를 4단계(필수 요구, 의사결정, 추가 고려, 검증 체크리스트)로 나누는 구조
- 서버 최종 검증, UUID 저장, ClamAV 2단계 필터, Debounce 저장 등 설계 방향
- subagent-driven-development로 26태스크를 작은 단위로 나눠 구현하고 리뷰를 분리하는 방식
- 일괄/extignore 형식 오류 시 전체 실패, 기존 커스텀 중복은 일괄에서만 조용히 제외하는 정책

### 수정해서 반영한 것

| 영역 | AI 초안/제안 | 실제 반영 |
|------|-------------|-----------|
| prompt-log | 회고까지 AI가 대필 | 회고는 사용자 전용, AI는 질문과 판단 대상만 제공 |
| 알림 UX | 저장 결과를 본문 인라인 | 하단 토스트로 분리, 이후 독립 다중 토스트로 개편 |
| 레이아웃 | 5개 영역 세로 나열 | 데스크톱 좌우 2단(정책 / 업로드), CLS 방지 레이아웃 고정 |
| extignore 파일명 | `.extignore` | 브라우저 선택 UX를 위해 `extignore.txt` |
| 가져오기 오류 표시 | 일괄 입력 영역 내부 | 모드와 무관하게 확장자 카드 공통 영역 |
| 업로드 목록 | 비공개 | 데모 검증을 위해 공개 목록, 보호 시드만 삭제 불가 |
| 토스트 중복 | 알림별 독립 표시만 | 요구사항에 맞게 동일 종류/메시지 중복 억제 추가 |
| glob 패턴 | 도입 검토 | 리터럴 확장자 정책과 범위 불일치로 제외 |

### 제외한 것

- AI가 사용자 판단/회고를 대신 작성하는 방식
- 정책 관리와 업로드를 별도 화면으로 분리 (핵심 흐름 단절)
- 드래그앤드롭 업로드 (클릭 선택으로 필수 기능 충족)
- glob/정규식 확장자 (입력 검증과 보안 복잡도 대비 실익 낮음)
- 정책 변경 이력 UI (필수 범위 밖, 후순위로 문서화)
- MIME 타입만으로 업로드 차단 (클라이언트 조작 가능)

## AI가 놓쳤고 사용자가 잡아낸 부분

다음은 AI가 체크리스트를 완료 처리하거나 구현을 마친 뒤에도, 사용자 검증 또는 재요청으로 발견된 대표 사례이다.

1. **검증 체크리스트 감사 (007)**  
   AI가 대부분 항목을 충족했다고 판단했지만, 실제 결함 2건(파일명 길이 초과 시 포커스 미이동, 토스트 중복 누적)이 남아 있었다. 요구사항 문구를 바꾸지 않고 구현을 수정해 해결했다.

2. **가져오기 오류 미표시 (010)**  
   단일 모드에서 `extignore.txt` 형식 오류가 화면에 보이지 않는 문제. 일괄 영역에만 오류를 두었던 구현을 사용자가 재현 보고했고, 공통 인라인 영역으로 옮겼다.

3. **레이아웃 CLS (006)**  
   저장 상태 문구, 오류 문구, 버튼 라벨 변경으로 요소가 밀리는 문제를 사용자가 실제 화면에서 확인했고, 고정 높이/스피너 전환으로 수정했다.

4. **Enter 키 제출 누락**  
   기획 문서에는 Enter 제출이 있었으나 구현이 버튼 클릭만 지원. 검증 단계에서 문서-구현 불일치로 발견해 보완했다.

5. **service_role grant 누락**  
   AI가 제안한 초기 스키마에는 Supabase `service_role` grant가 없었고, 통합 테스트 실행 중 `permission denied`로 발견해 마이그레이션에 추가했다.

6. **prompt-log 회고 대필**  
   AI가 생성한 초기 로그에 사용자 회고가 미리 채워져 있거나, 핵심 프롬프트가 빠져 있었다. skill 정책과 선별 기준을 직접 정의해 수정했다.

## AI 활용에서 효과가 컸던 방식

- **요구사항을 먼저 확정**: 24개 `결정 필요` 항목을 AI와 하나씩 논의해 임의 확정을 막음
- **문서 간 교차 검토**: `document-review`와 반복 대조로 REQUIREMENTS, PLANNING, DESIGN, CONSIDERATIONS 불일치를 구현 전에 줄임
- **TDD + 체크리스트 감사**: AI 생성 코드를 테스트와 160개 가까운 체크리스트로 재검증
- **문제 분해**: 26태스크 plan + subagent로 한 번에 큰 diff를 만들지 않음
- **Context7**: Next.js 16 등 학습 데이터와 다른 API를 문서 기준으로 확인

## 한계와 남은 부분

- AI는 배포 URL, GCP VM 상태 같은 **런타임 인프라 사실**을 저장소만으로는 알 수 없다. README 배포 URL은 배포 완료 후 직접 기입해야 한다.
- AI 활용 기록은 [`PROMPT_LOG.md`](PROMPT_LOG.md) 001~010에 집중되어 있고, **배포 작업은 별도 로그 없이** 진행하기로 했다.
- 정책 변경 이력, 로그 조회 UI는 의도적으로 후순위로 남겨 두었다. 판단 근거는 [`CONSIDERATIONS.md`](../CONSIDERATIONS.md)에서 확인할 수 있다.

## 더 자세한 내용

- [`PROMPT_LOG.md`](PROMPT_LOG.md): 작업별 프롬프트, AI 활용, 사용자 회고
- [`CONSIDERATIONS.md`](../CONSIDERATIONS.md): 과제 고려사항 판단과 근거
- [`REQUIREMENTS.md`](../specs/REQUIREMENTS.md): 요구사항과 검증 체크리스트
