# DynamicD cleanup / DB check report

## 결론

이 ZIP은 실제 운영 DB 덤프/백업 파일이 아니라 **Next.js 코드 + Supabase SQL 설치/보정 파일 묶음**입니다.
사용자 데이터가 들어있는 `COPY`, `.dump`, `.bak`, `.db`, `.sqlite` 형태의 백업은 발견되지 않았습니다.

따라서 데이터 복구는 이 파일에서 하는 것이 아니라, **살아있는 기존 Supabase 프로젝트 DB에 환경변수 키를 다시 연결**하는 방식이 맞습니다.

## 버전 판단

루트 안내 파일 기준으로 v1.8.2, v1.8.3, v1.8.4 누적 흔적이 있습니다.
`0_v1.8.2_...` 안내에는 v1.8.1 기능이 포함되어 있다고 적혀 있고, `0_v1.8.4_...` 안내도 존재했습니다.
그래서 이 파일은 **v1.8.1 순정본이라기보다 v1.8.4까지 섞인 누적본**으로 보는 게 안전합니다.

## DB 관련 판단

`supabase/PASTE_THIS_ONCE.sql`은 초기 설치용 스키마입니다. 주요 생성 테이블은 다음 계열입니다.

- profiles
- draws
- rewards
- results
- participant_items
- exchange_rules / exchange_logs
- live_events
- admin_logs
- probability_history
- site_settings
- rate_limits

다만 현재 코드에는 아래처럼 더 나중 버전의 테이블/함수도 많이 참조됩니다.
기존 Supabase DB에 이 테이블들이 이미 있으면 문제 없지만, 없다면 해당 최신 기능 화면/API는 빈 값 또는 오류가 날 수 있습니다.

- member_session_status, login_activity_logs
- security_events, security_blocklist, signup_risk_assessments
- virtual_currencies, currency_balances, draw_tickets, ticket_exchange_rates
- notices, events, raffle_events
- promo_codes, promo_redemptions
- random_boxes, attendance_logs, referral_logs
- support_tickets
- step_events, step_event_steps, step_event_progress, step_event_reward_logs
- admin_notes, admin_meetings, admin_permission_sets

즉, **기존 Supabase DB가 남아 있다면 연결해서 살리는 쪽이 맞고**, 이 ZIP의 SQL만으로 새 DB를 완전 재현한다고 보기는 어렵습니다.

## 정리하면서 제거한 것

- DynamicD-part1 / part3 / part4 / part7 / part8 중복 백업 폴더
- login 관련 패치 검증 폴더들
- app 안의 `page (2).tsx`, `route (2).ts` 중복 복사본
- 루트의 불필요한 admin 복사 폴더
- v1.8.4 안내에서 이미 제거 대상으로 표시된 가입코드 기능 파일/폴더
- 루트에 흩어진 중복 SQL/설명 txt/html 파일

## 적용한 작은 호환성 수정

실시간 갱신 컴포넌트 2곳에서 환경변수 확인 조건을 수정했습니다.
기존에는 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`만 봤는데, 이제 구버전 키 이름인 `NEXT_PUBLIC_SUPABASE_ANON_KEY`도 허용합니다.

## Vercel에 넣을 핵심 환경변수

필수:

```env
NEXT_PUBLIC_SUPABASE_URL=기존 Supabase Project URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=기존 publishable/anon key
SUPABASE_SECRET_KEY=기존 secret/service_role key
ADMIN_SETUP_SECRET=32자 이상 아무 긴 비밀문자
NEXT_PUBLIC_SITE_URL=https://배포주소
NEXT_PUBLIC_DEMO_MODE=false
```

구버전 이름을 쓰고 싶으면 아래도 코드에서 인식합니다.

```env
NEXT_PUBLIC_SUPABASE_ANON_KEY=기존 anon key
SUPABASE_SERVICE_ROLE_KEY=기존 service_role key
```

둘 다 넣을 필요는 없지만, 헷갈리면 publishable/secret 쪽 이름으로 넣는 걸 권장합니다.

## 로컬 검증 결과

정리본에서 아래 검증을 실행했습니다.

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm run lint
NEXT_TELEMETRY_DISABLED=1 npm run build
```

결과:

- TypeScript typecheck: PASS
- ESLint: PASS, 경고 20개 있음, 오류 0개
- Next.js production build: PASS

압축 전 `node_modules`와 `.next` 빌드 산출물은 제거했습니다.
