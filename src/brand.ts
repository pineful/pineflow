import type { WorkMode } from "./types";

export const productName = "Pineflow";
export const tagline = "나만의 리듬으로 흐르는 하루 기록";

export const modeLabels: Record<WorkMode, string> = {
  focus: "집중 근무",
  remote: "원격 루틴",
  study: "학습/성장",
  project: "개인 프로젝트"
};

export const modeDescriptions: Record<WorkMode, string> = {
  focus: "깊게 끝낼 일",
  remote: "장소와 생활 리듬",
  study: "배우고 쌓을 것",
  project: "내가 만드는 결과물"
};

export const modePlans: Record<WorkMode, string[]> = {
  focus: ["핵심 작업 1개 끝내기", "글쓰기와 정리", "방해 없이 90분 몰입", "오전 집중 블록"],
  remote: ["집에서 루틴 유지", "카페에서 가볍게 시작", "회의 후 정리", "이동 전 짧은 블록"],
  study: ["강의 1개 듣기", "책 30쪽 읽기", "복습 노트 만들기", "실습 문제 풀기"],
  project: ["기능 하나 완성", "아이디어 스케치", "버그 하나 정리", "배포 전 점검"]
};
