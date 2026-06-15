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

function decodeXmlText(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function rssTagValue(item, tag) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeXmlText(match?.[1] ?? "");
}

function firstRssItem(text) {
  return text.match(/<item\b[\s\S]*?<\/item>/i)?.[0] ?? "";
}

function googleNewsArticleId(value) {
  try {
    const url = new URL(value);
    if (url.hostname !== "news.google.com") return "";
    const match = url.pathname.match(/\/(?:rss\/)?articles\/([^/?#]+)/i) || url.pathname.match(/\/read\/([^/?#]+)/i);
    return decodeURIComponent(match?.[1] ?? "");
  } catch {
    return "";
  }
}

function googleNewsArticlePageUrl(articleId, source) {
  const url = new URL(`https://news.google.com/articles/${encodeURIComponent(articleId)}`);
  url.searchParams.set("hl", source.hl);
  url.searchParams.set("gl", source.gl);
  url.searchParams.set("ceid", source.ceid);
  return url.toString();
}

async function fetchLimitedText(url, maxBytes, options = {}) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    signal: AbortSignal.timeout(options.timeoutMs ?? sourceTimeoutMs),
    headers: {
      accept: options.accept ?? "application/json, application/rss+xml, application/xml, text/xml",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": "PineflowTrendLensSourceCheck/0.1"
    },
    body: options.body
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return readLimitedText(response, maxBytes);
}

function googleNewsDecodeParamsFromHtml(html) {
  const timestamp = decodeXmlText(html.match(/data-n-a-ts="([^"]+)"/i)?.[1] ?? "");
  const signature = decodeXmlText(html.match(/data-n-a-sg="([^"]+)"/i)?.[1] ?? "");
  const articleId = decodeXmlText(html.match(/data-n-a-id="([^"]+)"/i)?.[1] ?? "");
  if (!timestamp || !signature) return null;
  return { articleId, timestamp, signature };
}

function googleNewsDecodeRequestBody(articleId, params, source) {
  const request = [
    "garturlreq",
    [
      [source.hl, source.gl, ["FINANCE_TOP_INDICES"], null, null, 1, 1, source.ceid, null, 180, null, null, null, null, null, 0],
      source.hl,
      source.gl,
      1,
      [2, 3, 4, 8],
      1,
      0,
      "655000234",
      0,
      0,
      null,
      0
    ],
    articleId,
    Number(params.timestamp),
    params.signature
  ];
  return new URLSearchParams({
    "f.req": JSON.stringify([[["Fbv4je", JSON.stringify(request), null, "generic"]]])
  }).toString();
}

function directUrlFromGoogleNewsBatch(text) {
  const parsed = JSON.parse(text.replace(/^\)\]\}'\s*/, "").trim());
  const row = parsed.find((entry) => Array.isArray(entry) && entry[0] === "wrb.fr" && entry[1] === "Fbv4je");
  const payload = row && typeof row[2] === "string" ? JSON.parse(row[2]) : null;
  return Array.isArray(payload) && payload[0] === "garturlres" ? payload[1] : "";
}

async function firstGoogleNewsDirectHost(text, source) {
  const item = firstRssItem(text);
  const link = rssTagValue(item, "link");
  const articleId = googleNewsArticleId(link);
  if (!articleId) return "no direct id";

  const { text: html } = await fetchLimitedText(googleNewsArticlePageUrl(articleId, source), 1536 * 1024, {
    accept: "text/html, application/xhtml+xml, */*"
  });
  const params = googleNewsDecodeParamsFromHtml(html);
  if (!params) return "no decode params";

  const decodeArticleId = params.articleId || articleId;
  const decodeUrl = new URL("https://news.google.com/_/DotsSplashUi/data/batchexecute");
  decodeUrl.searchParams.set("rpcids", "Fbv4je");
  const { text: decoded } = await fetchLimitedText(decodeUrl.toString(), 64 * 1024, {
    method: "POST",
    accept: "*/*",
    body: googleNewsDecodeRequestBody(decodeArticleId, params, source)
  });
  const directUrl = directUrlFromGoogleNewsBatch(decoded);
  return directUrl ? `first direct host ${new URL(directUrl).hostname}` : "no direct url";
}

async function googleNewsParser(text, source) {
  const count = rssItemCount(text);
  const direct = count > 0 ? await firstGoogleNewsDirectHost(text, source) : "empty feed";
  return `${count} rss items, ${direct}`;
}

function isAcademicJobNoticeTitle(title = "") {
  const text = decodeXmlText(title).replace(/\s+/g, " ").trim();
  if (!/겸임/.test(text)) return false;
  if (!/(모집|초빙|채용|공고|임용|위촉)/.test(text)) return false;
  return !/(합격자|발표|결과|서류|면접|직원|조교|근로자|대학원생)/.test(text);
}

function hufsAcademicJobCount(text) {
  return [...text.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)]
    .map((match) => decodeXmlText(match[0]))
    .filter(isAcademicJobNoticeTitle).length;
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
    id: "hufs-recruitment",
    label: "HUFS recruitment board",
    url: "https://www.hufs.ac.kr/hufs/11284/subview.do",
    accept: "text/html, application/xhtml+xml, */*",
    maxBytes: 512 * 1024,
    parser: (text) => `${hufsAcademicJobCount(text)} academic job notices`
  },
  {
    id: "google-news-mandolin",
    label: "Google News mandolin RSS",
    hl: "ko",
    gl: "KR",
    ceid: "KR:ko",
    url: googleNewsUrl('만돌린 OR mandolin OR mandolinist OR "Avi Avital" OR "classical mandolin"', {
      hl: "ko",
      gl: "KR",
      ceid: "KR:ko",
      maxAgeDays: 60
    }),
    maxBytes: 512 * 1024,
    parser: googleNewsParser
  },
  {
    id: "google-news-it-content",
    label: "Google News IT content RSS",
    hl: "ko",
    gl: "KR",
    ceid: "KR:ko",
    url: googleNewsUrl("IT 콘텐츠 OR 기술 트렌드 OR 생성형 AI OR 사이버보안 콘텐츠 OR 개발자 콘텐츠 OR 테크 콘텐츠", {
      hl: "ko",
      gl: "KR",
      ceid: "KR:ko",
      maxAgeDays: 14
    }),
    maxBytes: 512 * 1024,
    parser: googleNewsParser
  },
  {
    id: "google-news-education",
    label: "Google News education trend RSS",
    hl: "ko",
    gl: "KR",
    ceid: "KR:ko",
    url: googleNewsUrl("교육 트렌드 OR 에듀테크 OR AI 교육 OR 디지털 교육 OR 교육부 AI", {
      hl: "ko",
      gl: "KR",
      ceid: "KR:ko",
      maxAgeDays: 14
    }),
    maxBytes: 512 * 1024,
    parser: googleNewsParser
  },
  {
    id: "google-news-academic-jobs",
    label: "Google News academic jobs RSS",
    hl: "ko",
    gl: "KR",
    ceid: "KR:ko",
    url: googleNewsUrl('"겸임교수" "모집" "대학교" ("서울" OR "경기" OR "충북")', {
      hl: "ko",
      gl: "KR",
      ceid: "KR:ko",
      maxAgeDays: 45
    }),
    maxBytes: 512 * 1024,
    parser: googleNewsParser
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
        accept: source.accept ?? "application/json, application/rss+xml, application/xml, text/xml",
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
      detail: await source.parser(text, source)
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
