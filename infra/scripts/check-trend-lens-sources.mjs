const sourceTimeoutMs = 8000;

function googleNewsUrl(query, { hl, gl, ceid, maxAgeDays }) {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", `${query} when:${maxAgeDays}d`);
  url.searchParams.set("hl", hl);
  url.searchParams.set("gl", gl);
  url.searchParams.set("ceid", ceid);
  return url.toString();
}

function rssItemCount(text) {
  return [...text.matchAll(/<item\b[\s\S]*?<\/item>/gi)].length;
}

const sources = [
  {
    id: "cisa-kev",
    label: "CISA KEV",
    url: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    maxBytes: 2 * 1024 * 1024,
    parser: (text) => {
      const data = JSON.parse(text);
      return `${Array.isArray(data.vulnerabilities) ? data.vulnerabilities.length : 0} vulnerabilities`;
    }
  },
  {
    id: "kisa-security-notice",
    label: "KISA security notice RSS",
    url: "https://www.boho.or.kr/kr/rss.do?bbsId=B0000133",
    maxBytes: 512 * 1024,
    parser: (text) => `${[...text.matchAll(/<item\b[\s\S]*?<\/item>/gi)].length} rss items`
  },
  {
    id: "kisa-vulnerability",
    label: "KISA vulnerability RSS",
    url: "https://www.boho.or.kr/kr/rss.do?bbsId=B0000302",
    maxBytes: 512 * 1024,
    parser: (text) => `${[...text.matchAll(/<item\b[\s\S]*?<\/item>/gi)].length} rss items`
  },
  {
    id: "the-hacker-news",
    label: "The Hacker News RSS",
    url: "https://feeds.feedburner.com/TheHackersNews",
    maxBytes: 512 * 1024,
    parser: (text) => `${rssItemCount(text)} rss items`
  },
  {
    id: "bleeping-computer",
    label: "BleepingComputer RSS",
    url: "https://www.bleepingcomputer.com/feed/",
    maxBytes: 512 * 1024,
    parser: (text) => `${rssItemCount(text)} rss items`
  },
  {
    id: "security-week",
    label: "SecurityWeek RSS",
    url: "https://www.securityweek.com/feed/",
    maxBytes: 512 * 1024,
    parser: (text) => `${rssItemCount(text)} rss items`
  },
  {
    id: "help-net-security",
    label: "Help Net Security RSS",
    url: "https://www.helpnetsecurity.com/feed/",
    maxBytes: 512 * 1024,
    parser: (text) => `${rssItemCount(text)} rss items`
  },
  {
    id: "google-news-mandolin",
    label: "Google News mandolin RSS",
    url: googleNewsUrl('만돌린 OR mandolin OR mandolinist OR "Avi Avital" OR "classical mandolin"', {
      hl: "ko",
      gl: "KR",
      ceid: "KR:ko",
      maxAgeDays: 60
    }),
    maxBytes: 512 * 1024,
    parser: (text) => `${rssItemCount(text)} rss items`
  },
  {
    id: "google-news-it-content",
    label: "Google News IT content RSS",
    url: googleNewsUrl("IT 콘텐츠 OR 기술 트렌드 OR 생성형 AI OR 사이버보안 콘텐츠 OR 개발자 콘텐츠 OR 테크 콘텐츠", {
      hl: "ko",
      gl: "KR",
      ceid: "KR:ko",
      maxAgeDays: 14
    }),
    maxBytes: 512 * 1024,
    parser: (text) => `${rssItemCount(text)} rss items`
  },
  {
    id: "google-news-education",
    label: "Google News education trend RSS",
    url: googleNewsUrl("교육 트렌드 OR 에듀테크 OR AI 교육 OR 디지털 교육 OR 교육부 AI", {
      hl: "ko",
      gl: "KR",
      ceid: "KR:ko",
      maxAgeDays: 14
    }),
    maxBytes: 512 * 1024,
    parser: (text) => `${rssItemCount(text)} rss items`
  }
];

async function readLimitedText(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    const bytes = Buffer.byteLength(text, "utf8");
    if (bytes > maxBytes) throw new Error(`response too large: ${bytes} > ${maxBytes}`);
    return { text, bytes };
  }

  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) throw new Error(`response too large: ${bytes} > ${maxBytes}`);
    chunks.push(Buffer.from(value));
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return { text, bytes };
}

const results = await Promise.allSettled(
  sources.map(async (source) => {
    const response = await fetch(source.url, {
      signal: AbortSignal.timeout(sourceTimeoutMs),
      headers: {
        accept: "application/json, application/rss+xml, application/xml, text/xml",
        "user-agent": "PineflowTrendLensSourceCheck/0.1"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const { text, bytes } = await readLimitedText(response, source.maxBytes);
    return {
      id: source.id,
      label: source.label,
      bytes,
      detail: source.parser(text)
    };
  })
);

let hasFailure = false;
results.forEach((result, index) => {
  const source = sources[index];
  if (result.status === "fulfilled") {
    console.log(`OK ${result.value.id}: ${result.value.bytes} bytes, ${result.value.detail}`);
    return;
  }

  hasFailure = true;
  console.error(`FAIL ${source.id}: ${result.reason?.message ?? result.reason}`);
});

if (hasFailure) {
  process.exitCode = 1;
}
