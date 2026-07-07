# Dynamic D 쿠폰/스탭업 재검토 결과

## 확인 결과

### 쿠폰
- 관리자 쿠폰 생성 API 자체는 존재합니다: `/api/admin/coupons`.
- 쿠폰 목록 조회는 `promo_codes` 테이블을 봅니다.
- 문제 가능성이 큰 부분은 **DB 조회 오류를 화면에서 그냥 빈 목록으로 삼키는 구조**였습니다.
  - 예: `promo_codes` 컬럼 누락, 권한/RLS, 이전 SQL 일부 미적용 등
  - 기존 화면은 오류가 있어도 `쿠폰이 없습니다.`로만 표시될 수 있었습니다.

### 스탭업
- 관리자 스탭업 이벤트/STEP API는 존재합니다: `/api/admin/step-events`.
- 스탭업도 쿠폰과 비슷하게 일부 DB 조회 오류가 빈 목록처럼 보일 수 있었습니다.
- 특히 스탭업 보상 리소스에서 쿠폰을 불러올 때 `promo_codes` 오류가 나면 쿠폰 보상 선택지가 비어 보일 수 있습니다.

## 이번 수정

1. 쿠폰 목록 조회 실패 시 빈 목록으로 숨기지 않고 관리자 화면에 DB 오류 메시지를 표시합니다.
2. 쿠폰 조회에서 특정 컬럼 문제로 실패하면 `select("*")`로 한 번 더 살려봅니다.
3. 스탭업 관리자 조회도 Supabase 응답의 `error`를 무시하지 않고 로그로 남기게 했습니다.
4. 타입 체크와 빌드 통과 확인했습니다.

## 배포 후 확인할 것

1. `/admin/coupons` 접속
2. 오류 메시지가 뜨면 그 문구를 그대로 확인
3. `promo_codes` 테이블에 행이 생기는지 확인
4. 스탭업 보상 선택지에 쿠폰이 뜨는지 확인

## 만약 계속 쿠폰이 안 보이면

Supabase SQL Editor에서 아래를 실행해 주세요.

```sql
select id, code, name, visibility, is_active, deleted_at, starts_at, ends_at, used_count, max_uses, per_user_limit, created_at
from public.promo_codes
order by created_at desc
limit 20;
```

결과가 0행이면 생성 API가 insert를 못 하는 상태입니다.
결과가 있는데 화면만 비면 조회 조건/권한 문제입니다.
