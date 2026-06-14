export type WeatherState = {
  status: "loading" | "ready" | "unavailable";
  locationLabel: string;
  temperature?: number;
  apparentTemperature?: number;
  humidity?: number;
  windSpeed?: number;
  precipitationProbability?: number;
  condition?: string;
  hourly?: HourlyWeather[];
  message?: string;
};

export type HourlyWeather = {
  time: string;
  label: string;
  temperature: number;
  precipitationProbability: number;
  condition: string;
};

export type ReverseGeocodeResult = {
  localityName?: string;
  locality?: string;
  city?: string;
  principalSubdivision?: string;
  localityInfo?: {
    administrative?: Array<{
      name?: string;
      description?: string;
      order?: number;
    }>;
  };
};

export const seoulCoordinates = {
  latitude: 37.5665,
  longitude: 126.978,
  label: "서울 중구 기준"
};

export const weatherForecastDays = 5;
export const weatherForecastSlotWidth = 106;

export function weatherCondition(code: number) {
  if (code === 0) return "맑음";
  if ([1, 2, 3].includes(code)) return "구름 조금";
  if ([45, 48].includes(code)) return "안개";
  if ([51, 53, 55, 56, 57].includes(code)) return "이슬비";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "비";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "눈";
  if ([95, 96, 99].includes(code)) return "뇌우";
  return "변화 있음";
}

export function weatherTone(condition: string) {
  if (condition.includes("비") || condition.includes("이슬비") || condition.includes("뇌우")) return "rain";
  if (condition.includes("눈")) return "snow";
  if (condition.includes("구름") || condition.includes("안개")) return "cloud";
  return "sun";
}

function isSameDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function weatherHourLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const hour = `${date.getHours()}`.padStart(2, "0");
  if (isSameDate(date, today)) return `오늘 ${hour}시`;
  if (isSameDate(date, tomorrow)) return `내일 ${hour}시`;
  return `${date.getMonth() + 1}/${date.getDate()} ${hour}시`;
}

export function buildHourlyWeather(hourly: {
  time?: string[];
  temperature_2m?: number[];
  precipitation_probability?: number[];
  weather_code?: number[];
}) {
  const times = hourly.time ?? [];
  const startIndex = Math.max(
    times.findIndex((time) => new Date(time).getTime() >= Date.now() - 60 * 60 * 1000),
    0
  );

  return times
    .map((time, index) => ({ time, index }))
    .slice(startIndex)
    .filter((_, index) => index % 3 === 0)
    .slice(0, weatherForecastDays * 8)
    .map(({ time, index }) => {
      return {
        time,
        label: weatherHourLabel(time),
        temperature: Math.round(hourly.temperature_2m?.[index] ?? 0),
        precipitationProbability: hourly.precipitation_probability?.[index] ?? 0,
        condition: weatherCondition(hourly.weather_code?.[index] ?? -1)
      };
    });
}

function uniqueFilled(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];
}

function hasKoreanText(value?: string) {
  return Boolean(value && /[가-힣]/.test(value));
}

export function locationLabelFromGeocode(data: ReverseGeocodeResult, fallback: string) {
  const localityNames = uniqueFilled([data.localityName, data.locality]).filter(hasKoreanText);
  if (localityNames.length === 0) return fallback;

  const broaderAdministrativeNames = data.localityInfo?.administrative
    ?.filter((item) => item.name && item.order && item.order >= 4 && item.order <= 7 && hasKoreanText(item.name))
    .sort((left, right) => (right.order ?? 0) - (left.order ?? 0))
    .map((item) => item.name);

  const parts = uniqueFilled([
    ...localityNames,
    ...(broaderAdministrativeNames ?? []),
    data.city,
    data.principalSubdivision
  ])
    .filter(hasKoreanText)
    .slice(0, 3);

  return parts.length > 0 ? `${parts.join(" · ")} 기준` : fallback;
}
