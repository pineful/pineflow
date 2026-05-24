# ADR 0007: 열린 탭 세션 refresh와 1일 제한

상태: Accepted  
날짜: 2026-05-24

## 배경

Pineflow는 사용자가 페이지를 켜 둔 채 근무하는 사용 방식을 지원해야 한다. 기존 구현은 access token만 `sessionStorage`에 저장했기 때문에 Cognito access token이 만료되면 화면은 남아 있어도 API 요청이 실패하거나 로그인 화면으로 돌아갔다.

사용자는 열린 페이지에서는 최대 하루까지 세션이 유지되기를 원하지만, 브라우저 탭을 닫은 뒤 장기 세션이 남는 것은 원하지 않는다.

## 결정

- Cognito refresh token validity를 1일로 제한한다.
- access token과 refresh token은 모두 `sessionStorage`에만 저장한다.
- refresh token을 `localStorage`, GitHub, 서버 로그, DynamoDB에 저장하지 않는다.
- 프론트엔드는 API 요청 전, 30분 주기, 창 포커스/가시성 복귀 시점에 access token refresh를 시도한다.
- refresh에 실패하면 세션을 정리하고 로그인 화면으로 되돌린다.
- API 요청이 401/403을 받으면 한 번만 강제 refresh 후 재시도한다.

## 결과

열린 탭은 사용자가 근무 중 계속 보는 흐름을 방해하지 않고 하루 이내 세션을 유지할 수 있다. 탭을 닫으면 `sessionStorage` 기반 토큰이 일반적으로 사라지므로 장기 로그인 상태가 남지 않는다.

브라우저의 세션 복원 기능이 `sessionStorage`를 복원하는 경우에도 Cognito refresh token validity가 1일이므로 무제한 세션으로 확장되지 않는다.

## 주의

refresh token rotation은 현재 사용하지 않는다. Cognito app client에서 rotation을 켜면 `REFRESH_TOKEN_AUTH` 흐름을 그대로 사용할 수 없으므로 별도 ADR과 구현 변경이 필요하다.
