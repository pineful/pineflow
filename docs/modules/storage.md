# 저장소 모듈

> **레거시 PoC 문서.** 이 문서는 Express/**PostgreSQL** PoC 저장소 계약이다.
> 운영 본선 저장소는 DynamoDB single-table이며, 본선 설계는
> `docs/modules/serverless-storage.md`와
> `docs/adr/0003-dynamodb-single-table.md`를 본다.

## 책임

저장소 모듈은 Express API를 통해 출퇴근 세션과 사용자 설정을 PostgreSQL에 저장합니다.

## 설계 사상

Pineflow가 실제 호스팅 서비스로 이동하고 있으므로, 브라우저 저장소가 기록의 원천이 되어서는 안 됩니다. PostgreSQL을 durable source of truth로 두고, 프론트엔드는 API 응답을 화면 상태로 사용합니다.

## 현재 계약

- `work_sessions`는 출근/퇴근 세션을 저장합니다.
- `user_settings`는 owner별 설정을 저장합니다.
- `daily_goal_minutes`는 하루 목표 시간을 분 단위로 저장합니다.
- 부분 unique index로 owner별 활성 세션을 하나만 허용합니다.
- API는 프론트엔드가 쓰기 쉬운 `CommuteState` 형태로 상태를 반환합니다.

## 운영 메모

운영 환경에서는 PostgreSQL 컨테이너의 named volume에 데이터가 저장됩니다. 이 볼륨은 편리한 영속 저장소지만 백업을 대체하지 않습니다. EC2 인스턴스나 EBS 볼륨을 삭제하기 전에는 반드시 `pg_dump` 백업을 남겨야 합니다.

## 향후 문서화할 변경

- 정식 마이그레이션 도구 도입.
- 인증 기반 owner key.
- 암호화된 백업.
- RDS 이전 시 연결/백업 정책.
