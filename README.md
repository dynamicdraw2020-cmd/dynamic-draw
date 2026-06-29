# Dynamic Draw v1.0.3 — 실제 배포용 홈페이지 v1.0.3

결제 없이 이벤트 추첨을 운영하는 Next.js + Supabase 웹 서비스입니다.

## v1.0.3 기존 배포 오류 수정

이미 GitHub·Vercel·Supabase까지 연결했다면 처음부터 다시 하지 않습니다.

1. `4_기존설치_권한오류_수정.sql`을 Supabase SQL Editor에서 한 번 실행합니다.
2. `/setup-admin`을 새로고침합니다.
3. 관리자 생성 후 로그인합니다.
4. 코드도 최신 진단 기능으로 바꾸려면 이 수정본을 GitHub에 덮어쓰면 Vercel이 자동 재배포합니다.

기존 오류 원인은 SQL Editor로 만든 표에 서버용 `service_role` 권한이 명시적으로 부여되지 않은 것이었습니다. 공개 조회 권한은 있었기 때문에 메인 화면은 보였지만, 서버 Secret key를 사용하는 관리자 생성 확인만 실패했습니다.


## v1.0.3 기존 배포 업데이트

기존 Vercel·Supabase 프로젝트를 삭제하지 않습니다.

1. `4_DB_보정_v1.0.3.sql`을 Supabase SQL Editor에서 한 번 실행합니다.
2. `Dynamic-Draw-GitHub-교체파일-v1.0.3.zip`의 안쪽 파일을 GitHub에 덮어씁니다.
3. Vercel 자동 배포가 `Ready`가 되면 `/api/health`를 확인합니다.

자세한 순서는 `v1.0.3_적용방법_먼저읽기.txt`에 있습니다.

## 가장 먼저 할 일

1. `00_여기부터_더블클릭.html`을 브라우저로 엽니다.
2. 또는 `docs/04_아주쉬운_배포설명서.md`를 읽습니다.
3. DB 설치용 파일은 `supabase/PASTE_THIS_ONCE.sql`입니다.

> SQL 파일은 Supabase 사이트 안에서 찾는 것이 아닙니다. 이 프로젝트 폴더 안의 파일을 메모장으로 열어 복사한 뒤 Supabase SQL Editor에 붙여넣습니다.

## 구현 기능

### 일반 사용자

- 이메일 회원가입 신청과 이메일 확인
- 관리자 승인 대기
- 승인 시 `DD-연도-6자리` 고유 ID 자동 발급
- 로그인·로그아웃·비밀번호 재설정
- 진행 뽑기·상품·확률표 조회
- Supabase Realtime WebSocket 실시간 카드 연출
- 최근 결과와 누적 통계
- 내 보유 상품·개인 결과 확인
- 교환 규칙에 따른 자기 상품 교환

### 관리자

- `/setup-admin` 최초 최고 관리자 1회 생성
- VIEWER / MANAGER / SUPER_ADMIN 권한
- 회원 검색·상태 필터·승인·반려·정지·복구
- 뽑기·상품·재고·상태 관리
- 확률 합계 정확히 100% 검증과 변경 기록
- 참가 회원 선택 후 서버 측 추첨
- 결과 공개와 사유 기반 무효 처리
- 교환 규칙 관리
- 고유 ID로 관리자 현장 교환
- 실시간 통계 차트
- 확률 기록 뽑기·관리자·기간 필터
- 관리자 감사 로그와 SHA-256 해시 체인 검증
- 사이트 이름·메인 문구·통계 공개 설정

## 중요한 설계

- 결과는 브라우저가 아니라 PostgreSQL 트랜잭션에서 먼저 결정됩니다.
- 3~5초 애니메이션은 이미 결정된 결과를 보여 주는 연출입니다.
- 추첨과 교환은 멱등 키와 DB 잠금으로 중복 실행을 방지합니다.
- 보관 상품 적립과 교환 차감·지급은 원자적으로 처리합니다.
- 확률 변경 기록과 관리자 로그는 DB 트리거가 수정·삭제를 막습니다.
- Vercel에서는 지속 WebSocket 서버 대신 Supabase Realtime WebSocket을 사용합니다.
- Supabase Secret key는 서버 Route Handler에서만 사용하며 브라우저 번들에 포함하지 않습니다.

## 필요한 환경변수

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SECRET_KEY
NEXT_PUBLIC_SITE_URL=https://dynamic2020.com
NEXT_PUBLIC_DEMO_MODE=false
ADMIN_SETUP_SECRET=32_CHARACTERS_OR_MORE_PRIVATE_SETUP_SECRET
```

## 로컬 실행

Node.js 20.9 이상이 필요합니다.

```bash
npm install
cp .env.example .env.local
npm run dev
```

`http://localhost:3000`을 엽니다. Supabase 키가 없으면 저장 기능을 막은 안전한 미리보기 모드로 실행됩니다.

## DB 설치

새 Supabase 프로젝트의 SQL Editor에서 `supabase/PASTE_THIS_ONCE.sql`을 처음 한 번 실행합니다.

DB와 Vercel 환경변수를 연결한 뒤 다음 주소에서 첫 관리자를 만듭니다.

```text
https://배포주소/setup-admin
```

`4_기존설치_권한오류_수정.sql`은 기존 설치에서 service_role 권한 오류가 날 때 실행하는 보정 파일입니다.

`supabase/MAKE_FIRST_ADMIN.sql`은 설치 페이지가 작동하지 않을 때만 사용하는 예비 방법입니다.

## 검증 명령

```bash
npm run typecheck
npm run lint
npm run build
```

## 문서

- `00_여기부터_더블클릭.html` — 버튼까지 설명한 설치 안내
- `docs/01_서비스기획서.md`
- `docs/02_일반회원_사용설명서.md`
- `docs/03_관리자_사용설명서.md`
- `docs/04_아주쉬운_배포설명서.md`
- `docs/05_DB_API_보안_기술문서.md`
- `docs/06_운영체크리스트_문제해결.md`


## v1.0.3 pgcrypto 오류 수정

Supabase에서 `function digest(text, unknown) does not exist` 또는 `gen_random_bytes` 오류가 나오면 루트의 `4_PGCRYPTO_오류_수정.sql`을 SQL Editor에서 한 번 실행합니다. 기존 회원·결과·설정 데이터는 삭제하지 않습니다.
