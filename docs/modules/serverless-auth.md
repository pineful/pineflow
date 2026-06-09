# 모듈 설계: Serverless 인증

## 설계 의도

Pineflow는 당분간 개인 사용 서비스이므로 공개 가입을 열지 않는다. 비용과 보안을 동시에 지키기 위해 계정은 관리자만 만들고, 프론트엔드는 Cognito에서 발급받은 JWT로만 API를 호출한다.

## 주요 결정

- Cognito self sign-up 비활성화.
- 관리자 생성 사용자만 허용.
- 첫 로그인 시 임시 비밀번호를 새 비밀번호로 바꾸는 흐름 지원.
- API Gateway JWT authorizer 필수 적용.
- Lambda 내부에서는 클라이언트가 보낸 사용자 ID를 믿지 않고 JWT의 `sub`만 사용.
- 로그인 후 화면의 계정 관련 행동은 상단 계정 메뉴에 모은다.
- 현재는 로그인 이메일 표시와 로그아웃을 제공하고, 이후 내 정보/암호 변경 같은 기능이 붙을 수 있는 확장 지점을 같은 메뉴 안에 둔다.
- 브라우저에 오래 열린 탭은 access token만 믿지 않고 refresh token으로 세션을 갱신한다.
- access token과 refresh token은 모두 `sessionStorage`에만 저장한다. `localStorage`에는 refresh token을 저장하지 않는다.
- 로그인 화면에 다시 표시하기 위한 email도 `sessionStorage`에만 저장한다. 과거 `localStorage`의 `pineflow.email` 값은 읽기 시 제거해 탭을 닫은 뒤 계정 식별자가 남지 않게 한다.
- Cognito refresh token validity는 1일로 제한한다. 페이지가 열려 있는 동안만 하루 이내 세션 유지가 가능하고, 탭을 닫으면 일반적인 장기 세션은 남지 않아야 한다.
- 프론트엔드는 API 요청 전, 30분 주기, 창 포커스/가시성 복귀 시점에 token refresh를 시도한다. refresh에 실패하면 세션을 정리하고 로그인 화면으로 되돌려 `request failed`만 남는 상태를 만들지 않는다.
- Chrome 암호 관리자/Windows Hello 자동 입력이 React state에 늦게 반영될 수 있으므로 로그인 submit 시점에는 `FormData`로 실제 form 값을 다시 읽는다. 입력 name과 autocomplete 속성은 제거하지 않는다.

## 변경 시 주의점

- public signup을 켜려면 비용 제한과 abuse 방어 정책을 먼저 다시 설계해야 한다.
- App Client에 OAuth/Hosted UI를 켤 경우 callback/logout URL을 실제 CloudFront 도메인으로 제한해야 한다.
- JWT 대신 장기 access key 방식으로 되돌리면 GitHub/브라우저/로그 노출 위험이 커진다.
- 계정 메뉴에 새 기능을 추가할 때는 Cognito 기능, API 권한, CloudFront CSP 변경 여부를 함께 확인한다.
