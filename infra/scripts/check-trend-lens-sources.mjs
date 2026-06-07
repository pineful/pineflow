const sourceTimeoutMs = 8000;

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
    id: "wikimedia-pageviews",
    label: "Wikimedia Pageviews",
    url: "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/Mandolin/daily/2026052400/2026060600",
    maxBytes: 512 * 1024,
    parser: (text) => {
      const data = JSON.parse(text);
      return `${Array.isArray(data.items) ? data.items.length : 0} pageview points`;
    }
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
