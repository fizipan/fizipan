// Writes an animated SVG of monthly GitHub contributions. Usage: node contributions.mjs <login> <out.svg>
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [login, out] = process.argv.slice(2);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function graphql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "User-Agent": login },
    body: JSON.stringify({ query, variables }),
  });
  const { data, errors } = await res.json();
  if (errors) throw new Error(JSON.stringify(errors));
  return data.user;
}

const { createdAt, contributionsCollection: lastYear } = await graphql(
  `query ($login: String!) {
    user(login: $login) {
      createdAt
      contributionsCollection {
        contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
      }
    }
  }`,
  { login },
);

let allTime = 0;
for (let year = new Date(createdAt).getUTCFullYear(); year <= new Date().getUTCFullYear(); year++) {
  const { contributionsCollection: c } = await graphql(
    `query ($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) { contributionCalendar { totalContributions } }
      }
    }`,
    { login, from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` },
  );
  allTime += c.contributionCalendar.totalContributions;
}

const days = lastYear.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
const activeDays = days.filter((d) => d.contributionCount > 0).length;
const byMonth = new Map();
for (const { date, contributionCount } of days) {
  const key = date.slice(0, 7);
  byMonth.set(key, (byMonth.get(key) ?? 0) + contributionCount);
}
const months = [...byMonth].sort(([a], [b]) => a.localeCompare(b)).slice(-12);

const fmt = (n) => n.toLocaleString("en-US");
const stats = [
  [lastYear.contributionCalendar.totalContributions, "last 12 months"],
  [allTime, "all time"],
  [activeDays, "active days"],
];

const W = 900, H = 320, LEFT = 32, CHART_W = W - LEFT * 2, BASE = 280, CHART_H = 120;
const max = Math.max(1, ...months.map(([, n]) => n));
const step = CHART_W / months.length, barW = step - 14;

const statsSvg = stats
  .map(([n, label], i) => {
    const x = LEFT + i * 240;
    return `<g class="fade" style="animation-delay:${i * 120}ms">
    <text class="num" x="${x}" y="86">${fmt(n)}</text>
    <text class="label" x="${x}" y="108">${label}</text>
  </g>`;
  })
  .join("\n  ");

const bars = months
  .map(([key, n], i) => {
    const h = Math.max(2, Math.round((n / max) * CHART_H));
    const x = (LEFT + i * step + 7).toFixed(1), cx = (LEFT + i * step + step / 2).toFixed(1);
    const delay = 200 + i * 70;
    return `<rect class="bar" x="${x}" y="${BASE - h}" width="${barW.toFixed(1)}" height="${h}" rx="4" fill="url(#bar)" style="animation-delay:${delay}ms"/>
  <text class="value fade" x="${cx}" y="${BASE - h - 7}" style="animation-delay:${delay + 450}ms">${n ? fmt(n) : ""}</text>
  <text class="month" x="${cx}" y="${BASE + 20}">${MONTHS[Number(key.slice(5)) - 1]}</text>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t">
  <title id="t">${fmt(stats[0][0])} GitHub contributions in the last 12 months, ${fmt(allTime)} all time, per month as a bar chart</title>
  <defs>
    <linearGradient id="bar" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#8B5CF6"/>
      <stop offset="1" stop-color="#22D3EE"/>
    </linearGradient>
  </defs>
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
    .title { font-size: 15px; font-weight: 600; fill: #22D3EE; }
    .num { font-size: 30px; font-weight: 700; fill: #FFFFFF; }
    .label { font-size: 13px; fill: #A3ADBD; }
    .value { font-size: 11px; fill: #D7DEEA; text-anchor: middle; }
    .month { font-size: 12px; fill: #7D8799; text-anchor: middle; }
    .fade { opacity: 0; animation: fade .4s ease-out forwards; }
    .bar { transform-box: fill-box; transform-origin: bottom; transform: scaleY(0); animation: grow .7s cubic-bezier(.22,1,.36,1) forwards; }
    @keyframes fade { to { opacity: 1; } }
    @keyframes grow { to { transform: scaleY(1); } }
    @media (prefers-reduced-motion: reduce) {
      .fade, .bar { animation: none; opacity: 1; transform: none; }
    }
  </style>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="#0B0F1A" stroke="#2A3350"/>
  <text class="title" x="${LEFT}" y="38">Contributions</text>
  ${statsSvg}
  ${bars}
</svg>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, svg);
console.log(`${out}: ${stats.map(([n, l]) => `${n} ${l}`).join(", ")}`);
