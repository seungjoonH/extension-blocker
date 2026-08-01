# 업로드 파일 목록·다운로드·삭제 설계

날짜: 2026-08-01

## 1. 배경과 REQUIREMENTS 개정 이유

기존 요구사항은 인증·소유권이 없어 **서버에 저장된 전체 파일 목록을 공개하지 않고**, 업로드 직후 이번 시도 결과만 화면에 표시했다.

이번 구현에서는 그 결정을 바꾼다.

- 업로드가 DB·스토리지에 실제로 남는지 화면에서 확인할 수 있어야 한다
- `guideline.md`, `extignore` 시나리오 샘플을 받아 가져와 보기 테스트에 쓸 수 있어야 한다
- 인증을 새로 도입하지 않는 대신, **공개 공유 데모**로 범위를 재정의한다. 누구나 목록 조회·다운로드·삭제(보호 파일 제외)가 가능하다

이 판단과 근거는 `REQUIREMENTS.md`, `CONSIDERATIONS.md`에 반영한다.

## 2. 범위

- 업로드 카드 **아래**(같은 오른쪽 열)에 업로드된 파일 목록
- 표시: 원본 파일명, 크기(`#.#MB`), 업로드 시각, 다운로드, 삭제
- 보호 파일은 UI에 “고정” 문구 없이 **삭제만 불가**(버튼 비활성)
- 보호 시드(전부 `is_protected = true`):
  - `guideline.md` — 샘플 사용법 설명
  - `extignore.valid-200.txt` — 형식 OK, 커스텀 200개 이하 성공용
  - `extignore.limit-201.txt` — 형식 OK, 201개라 한도 초과
  - `extignore.invalid-chars.txt` — 중간에 허용되지 않는 문자로 전체 형식 오류

가져오기 동작은 **파일 내용**만 본다. 파일명에 `?`가 있어도 `.txt`이면 가져올 수 있으나, 시드 이름은 시나리오가 드러나는 위 이름을 쓴다.

## 3. 데이터·API

- `uploads.is_protected boolean not null default false`
- service_role에 `select` 부여(기존 insert/delete 유지)
- `GET /api/uploads` — 최신순 목록(`id`, `originalFilename`, `fileSizeBytes`, `createdAt`, `isProtected`)
- `GET /api/uploads/[id]/download` — 스토리지에서 스트리밍, `Content-Disposition`에 원본 파일명
- `DELETE /api/uploads/[id]` — 보호면 `403`, 아니면 스토리지+메타데이터 삭제
- 시드는 고정 UUID로 idempotent하게 보장(목록 조회 시 없으면 생성, 또는 전용 seed 경로)

## 4. UI

- `UploadedFilesList` 컴포넌트를 `FileUploadSection` 아래 배치
- 업로드 성공 후 목록 refetch
- 삭제 확인은 네이티브 `confirm()`(초기화와 동일 톤)
- 빈 목록(시드만 있어도 시드는 항상 표시) 안내

## 5. 비범위

- 인증, 업로더별 소유권
- Storage signed URL
- 페이지네이션(초기에는 전체 목록; 과도하면 이후 제한)
