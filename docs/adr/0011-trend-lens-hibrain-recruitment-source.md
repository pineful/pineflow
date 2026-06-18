# ADR 0011: Trend Lens 겸임교수 source에 하이브레인넷 추가

상태: Accepted

날짜: 2026-06-18

## 맥락

Trend Lens의 `겸임교수 공고`(academic-jobs) 분야는 지금까지 한국외국어대학교
공식 채용 게시판(HTML)과 서울·경기·충북 Google News RSS 고정 query를 source로
사용했다. 사용자는 겸임교수 채용공고가 올라오면 빠르게 확인하고 싶어 하며,
국내 연구/교수 채용 정보가 가장 집중되는 곳은 하이브레인넷(`hibrain.net`)이다.

하이브레인넷 국내 사이트(`www.hibrain.net`)는 CloudFront WAF에서 **해외 IP를
geo차단**한다(미국 등 해외에서 접근 시 `403 Forbidden`). 따라서 브라우저 직접
호출이나 해외 리전에서의 fetch로는 목록을 읽을 수 없다. 반면 Pineflow의 Lambda는
`ap-northeast-2`(서울) 리전에서 동작하므로, geo차단이 순수 국가 기반이라면 한국
리전 egress IP로 목록에 접근할 수 있을 것으로 기대한다.

## 결정

- 하이브레인넷을 기존 Trend Lens source allowlist 패턴 그대로 한 source로 추가한다.
  - host `www.hibrain.net`, pathPrefix `/recruitment/recruits`, listing URL은
    코드에 고정한 `?listType=D3NEW`(최근 신규 공고)다. 사용자 입력 URL/검색어는
    허용하지 않는다.
  - 기존 source별 한도(512KB / 2.2초, redirect 1회 이하, redirect 후 allowlist
    재검증)를 그대로 적용한다. 별도 한도 예외를 두지 않는다.
- 수집 범위는 `scope=all` 일일/수동 전체 수집에서만 동작한다. 30분 보안 갱신
  (`scope=security`)에는 포함하지 않는다.
- 신규 공고 목록 HTML에서 `/recruitment/recruits/<id>` 앵커의 제목과 `YY.MM.DD`
  날짜만 추출한다. 기존 `isAcademicJobNoticeTitle` 필터(제목에 `겸임` + 모집성
  키워드, 합격자/직원/조교 등 제외)를 그대로 적용해 겸임교수 공고만 남긴다.
  접수 기간 범위가 있으면 마감일을 요약에 표기하고, 마감이 14일 이내면 우선순위를
  `high`로 올린다.
- Lambda는 공고 상세 페이지나 원문 첨부파일을 추가로 fetch하지 않는다. 목록에서
  얻은 공고 제목, 등록/마감 날짜, `hibrain.net` 공고 URL만 저장한다. 사용자가
  대학/기관 홈페이지나 첨부파일을 확인하려면 저장된 hibrain 공고 URL을 클릭해
  새 탭에서 직접 연다(브라우저 navigation이며 Pineflow fetch가 아니다).
- source 실패는 비치명적으로 처리한다. `403`(geo차단 포함), timeout, 응답 초과,
  파싱 0건은 모두 `sourceStatuses`의 `hibrain-recruitment` 상태로만 낮추고, 기존
  외대/Google News 결과로 겸임교수 보드를 계속 구성한다.

## 비용 판단

추가되는 것은 `scope=all` 수집(하루 1회 자동 + 사용자 수동) 시 hibrain 목록 1회
fetch와 소량 파싱뿐이다. EventBridge/Lambda/DynamoDB 사용량 증가는 미미하며, 기존
비용 가드레일(Lambda concurrency 1, memory 128MB, API Gateway 1 rps, DynamoDB
1RCU/1WCU, Budgets `$1/$3/$5`)을 그대로 유지한다. 새 AWS 리소스는 추가하지 않는다.

## 보안 판단

- SSRF 방어: URL은 allowlist source 정의(`www.hibrain.net` + `/recruitment/recruits`
  pathPrefix)에서만 생성한다. redirect는 1회 이하, redirect 후 allowlist를 다시
  검증한다.
- 공고 상세/첨부파일은 Lambda가 fetch하지 않는다. 저장 payload는 제목/날짜/URL/
  짧은 요약/근거 태그로 제한한다. 원문 전문·첨부 바이너리는 저장하지 않는다.
- CloudFront CSP는 바꾸지 않는다. 브라우저는 계속 Pineflow API만 호출하고, hibrain
  URL은 사용자가 클릭하는 외부 navigation 링크일 뿐이다.
- Lambda 로그에 source body나 공고 본문을 기록하지 않는다.

## 리스크 / 배포 후 검증

- **geo/WAF 통과 여부는 배포 후에만 확인 가능하다.** hibrain CloudFront가 국가가
  아니라 데이터센터/AWS ASN 단위로 차단한다면 서울 리전 Lambda도 `403`을 받을 수
  있다. 이 경우 `hibrain-recruitment` source는 `unavailable`로 표시되고 기능은
  외대/Google News로 graceful degrade 한다. 코드 변경 없이 동작이 깨지지 않는다.
- 파서는 같은 마크업 계열인 `global.hibrain.net` 서버 렌더링 HTML로 검증했다.
  국내 `www.hibrain.net` 목록 마크업이 다르면 파싱 0건이 될 수 있으므로, 배포 후
  `infra/scripts/check-trend-lens-sources.mjs`(한국 네트워크에서 실행)와 실제 Trend
  Lens 수집 결과로 `hibrain-recruitment` 항목 수를 확인한다.
- 신규 공고 목록은 전체 직종을 포함하므로 제목 `겸임` 필터로 좁힌다. 겸임교수
  공고가 신규 목록 1페이지 밖으로 밀리면 누락될 수 있다. 누락이 잦으면 후속 ADR로
  겸임 카테고리 고정 필터 URL을 검토한다.

## 대안

### 브라우저에서 hibrain 직접 호출

CSP를 넓혀야 하고, geo차단 회피도 사용자 위치/네트워크에 의존한다. 기존 source
정책(브라우저는 Pineflow API만 호출)과 어긋나므로 기각한다.

### 별도 서울 리전 스크래퍼 서비스 신설

EC2/별도 Lambda 스택을 새로 두는 방안은 Pineflow의 단일 Serverless 본선·비용
가드레일과 어긋난다. 기존 Trend Lens 수집 경로(이미 서울 리전)에 source 하나를
더하는 것으로 충분하므로 기각한다.

### hibrain 검색어 query URL 사용

겸임 카테고리/검색 param을 쓰면 더 정밀하지만, 정확한 param을 해외에서 검증할 수
없어 잘못된 코드가 0건을 반환할 위험이 있다. v1에서는 신규 목록 + 제목 필터로
시작하고, 검증 후 후속 ADR에서 좁힌다.

## 결과

Trend Lens 겸임교수 보드는 외대 공식 게시판과 함께 하이브레인넷 신규 겸임교수
공고를 같은 보드에서 보여주고, 마감 임박 공고를 우선순위로 끌어올린다. 기존
Serverless 비용/보안 가드레일과 source 정책은 그대로 유지한다.
