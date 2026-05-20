import type { WorkMode } from "./types";

export const productName = "Pineflow";
export const tagline = "나만의 리듬으로 남기는 출퇴근";

export const modeLabels: Record<WorkMode, string> = {
  focus: "집중 근무",
  remote: "원격 루틴",
  study: "학습/성장",
  project: "개인 프로젝트",
};

export const namingIdeas = [
  {
    name: "Pineflow",
    reason: "pineful의 발음감과 하루 흐름을 함께 담은 가장 직관적인 서비스명입니다.",
  },
  {
    name: "Pinefull",
    reason: "스스로 채워가는 하루라는 의미가 강해 개인 기록 서비스에 어울립니다.",
  },
  {
    name: "PinePulse",
    reason: "일하는 리듬과 생활의 맥박을 기술적으로 기록한다는 인상이 있습니다.",
  },
];
