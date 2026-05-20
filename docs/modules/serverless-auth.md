# 모듈 설계: Serverless 인증

## 설계 의도

Pineflow는 당분간 개인 사용 서비스이므로 공개 가입을 열지 않는다. 비용과 보안을 동시에 지키기 위해 계정은 관리자만 만들고, 프론트엔드는 Cognito에서 발급받은 JWT로만 API를 호출한다.

## 주요 결정

- Cognito self sign-up 비활성화.
- 관리자 생성 사용자만 허용.
- 첫 로그인 시 임시 비밀번호를 새 비밀번호로 바꾸는 흐름 지원.
- API Gateway JWT authorizer 필수 적용.
- Lambda 내부에서는 클라이언트가 보낸 사용자 ID를 믿지 않고 JWT의 `sub`만 사용.

## 변경 시 주의점

- public signup을 켜려면 비용 제한과 abuse 방어 정책을 먼저 다시 설계해야 한다.
- App Client에 OAuth/Hosted UI를 켤 경우 callback/logout URL을 실제 CloudFront 도메인으로 제한해야 한다.
- JWT 대신 장기 access key 방식으로 되돌리면 GitHub/브라우저/로그 노출 위험이 커진다.
