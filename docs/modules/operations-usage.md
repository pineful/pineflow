# 운영 사용량 패널 설계

## 목적

운영 사용량 패널은 Pineflow가 AWS Free Tier 기준 안에서 조용히 운영되고 있는지 사용자가 직접 확인할 수 있게 하는 보조 정보 영역이다. 이 영역은 출퇴근 기록 기능보다 우선순위가 낮다.

## 설계 원칙

- 기록 조회, 출근, 퇴근, 기록 수정, 기록 삭제는 운영 사용량 조회 실패와 분리되어야 한다.
- CloudWatch 지표 조회가 실패하더라도 `/api/state` 같은 핵심 API가 실패하면 안 된다.
- CloudWatch SDK는 Lambda 모듈 초기화 시점에 강하게 결합하지 않고, `/api/usage` 요청 시점에 지연 로드한다.
- 사용량 지표가 없거나 조회 권한/런타임 패키지 문제로 실패하면 패널만 `unavailable` 상태로 처리한다.
- 실제 청구액은 Cost Explorer를 붙이지 않는 한 계산하지 않는다. 현재 패널은 CloudWatch 기초 운영량과 Free Tier 기준선 비교 결과만 추정으로 보여준다.
- 같은 날짜의 사용량 스냅샷은 프론트엔드 `localStorage`와 DynamoDB `USAGE#YYYY-MM-DD` item에 캐시한다. 같은 날 다시 열면 비용 확인을 위해 CloudWatch를 반복 호출하지 않는다.
- 화면은 결론과 추이 그래프를 먼저 보여주고, 서비스별 상세 기준은 사용자가 펼칠 때만 보여준다.
- 로그인 후 첫 화면에는 같은 스냅샷을 요약한 비용 신호등을 표시한다. 이 신호등은 하단 패널까지 내려가지 않아도 비용 위험이 안정/주의/확인 필요 중 어디에 가까운지 알려주는 요약 장치이며, 별도의 AWS 조회를 만들지 않는다.

## 현재 표시 지표

- API Gateway 요청 수
- Lambda 호출 수, 오류 수, 실행시간 합계
- DynamoDB read/write capacity 사용량
- CloudFront 요청 수와 전송량
- S3 객체 수와 저장 용량
- Cognito, CloudWatch Logs, AWS Budgets처럼 현재 구성값만으로 판단 가능한 비용 항목의 Free Tier 예상 상태
- API 요청, Lambda 오류, CloudFront 전송량, S3 저장량의 시간 순 추이
- 첫 화면 비용 신호등: Free Tier 기준 안쪽이면 `안심`, 기준에 가까운 항목이 있으면 `주의`, 초과 가능 항목이 있으면 `위험`, 조회 실패는 `확인 불가`

## 변경 시 주의점

- `/api/usage`에 문제가 생겨도 `/api/state`가 영향을 받지 않는지 먼저 확인한다.
- Cost Explorer API를 추가할 경우 Cost Explorer 비용, IAM 권한, 월별 호출 빈도, Free Tier 기준을 ADR로 먼저 기록한다.
- Free Tier 기준선은 AWS 정책 변경 가능성이 있으므로 가격 문서를 확인한 날짜와 근거를 변경 설명에 남긴다.
- 캐시 item은 출퇴근 기록 item과 같은 사용자 partition에 저장하지만 `SESSION#` prefix를 쓰지 않는다. 기록 조회 쿼리에 섞이면 안 된다.
- CloudWatch 지표 조회는 운영자 참고용이다. 사용자의 출퇴근 이력 정합성 판단에는 사용하지 않는다.
