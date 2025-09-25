const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const puppeteer = require('puppeteer');
const cron = require('node-cron');

const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';

const NAME_MAP = {
  USD: "دلار آمریکا",
  EUR: "یورو",
  GBP: "پوند انگلیس",
  CHF: "فرانک سوئیس",
  CAD: "دلار کانادا",
  AUD: "دلار استرالیا",
  SEK: "کرون سوئد",
  NOK: "کرون نروژ",
  RUB: "روبل روسیه",
  THB: "بات تایلند",
  SGD: "دلار سنگاپور",
  HKD: "دلار هنگ‌کنگ",
  AZN: "منات آذربایجان",
  AMD: "درام ارمنستان",
  azadi: "سکه بهار آزادی",
  emami: "سکه امامی",
  gol18: "طلای ۱۸ عیار"
};

const INDEX_HTML = `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>📊 داشبورد نرخ ارز و طلا </title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
  body { direction: rtl; background-color: #121212; color: #e0e0e0; }
  .card { background-color: #1e1e1e; }
  table { background-color: #1e1e1e; }
  th, td { border-color: #333; }
</style>
</head>
<body class="p-6 font-sans">
<h1 class="text-3xl font-bold text-center mb-4">📊 داشبورد نرخ ارز و طلا</h1>
<p id="timestamp" class="text-center mb-6 text-gray-400"></p>

<div class="card p-4 rounded shadow mb-6">
<h2 class="text-xl font-semibold mb-4">📋 جدول نرخ‌ها</h2>
<table class="w-full border border-gray-700 text-sm text-right">
<thead class="bg-gray-800">
<tr>
<th class="px-4 py-2 border">نام</th>
<th class="px-4 py-2 border">قیمت</th>
</tr>
</thead>
<tbody id="priceTable"></tbody>
</table>
</div>

<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
  <div class="card p-4 rounded shadow">
    <h2 class="text-xl font-semibold mb-4">💱 نرخ ارز</h2>
    <canvas id="currencyChart"></canvas>
  </div>
  <div class="card p-4 rounded shadow">
    <h2 class="text-xl font-semibold mb-4">🥇 نرخ طلا</h2>
    <canvas id="goldChart"></canvas>
  </div>
</div>

<div class="text-center text-sm text-gray-500 mt-6">
  ساخته شده توسط <a href="https://github.com/z4r3i" target="_blank" class="text-blue-400 hover:underline">z4r3i</a>
</div>

<script>
const NAME_MAP = ${JSON.stringify(NAME_MAP, null, 2)};
const ws = new WebSocket(\`ws://\${location.host}\`);
let currencyChart, goldChart, previousData = null;

function initCharts() {
  const currencyCtx = document.getElementById("currencyChart").getContext("2d");
  const goldCtx = document.getElementById("goldChart").getContext("2d");

  currencyChart = new Chart(currencyCtx, {
    type: "bar",
    data: { labels: [], datasets: [{ label: "نرخ ارز", data: [], backgroundColor: "rgba(34,197,94,0.7)" }] },
    options: { responsive: true }
  });

  goldChart = new Chart(goldCtx, {
    type: "bar",
    data: { labels: [], datasets: [{ label: "نرخ طلا", data: [], backgroundColor: "rgba(245,158,11,0.7)" }] },
    options: { responsive: true }
  });
}

function updateTable(data) {
  const table = document.getElementById("priceTable");
  table.innerHTML = "";

  function getRow(key, value, type) {
    const name = NAME_MAP[key] || key;
    let change = "";
    let rowColor = "bg-gray-800";

    if (previousData && previousData[type] && previousData[type][key]) {
      const diff = value - previousData[type][key];
      change = ((diff / previousData[type][key]) * 100).toFixed(2);
      if (diff > 0) rowColor = "bg-green-700";
      else if (diff < 0) rowColor = "bg-red-700";
      change = change > 0 ? \`↑ \${change}%\` : (change < 0 ? \`↓ \${change}%\` : "0%");
    }

    return \`<tr class="\${rowColor}"><td class="px-4 py-2 border">\${name}</td><td class="px-4 py-2 border">\${value} تومان \${change}</td></tr>\`;
  }

  for (const [key, value] of Object.entries(data.currencies)) {
    table.innerHTML += getRow(key, value, "currencies");
  }

  for (const [key, value] of Object.entries(data.gold)) {
    table.innerHTML += getRow(key, value, "gold");
  }

  previousData = JSON.parse(JSON.stringify(data));
}

ws.onopen = () => {
  console.log("🌐 WebSocket وصل شد");
  initCharts();
};

ws.onmessage = (msg) => {
  try {
    const data = JSON.parse(msg.data);
    if (!data || !data.currencies || !data.gold) return;
    document.getElementById("timestamp").innerText = "آخرین بروزرسانی: " + new Date(data.timestamp).toLocaleString();

    currencyChart.data.labels = Object.keys(data.currencies).map(k => NAME_MAP[k] || k);
    currencyChart.data.datasets[0].data = Object.values(data.currencies);
    currencyChart.update();

    goldChart.data.labels = Object.keys(data.gold).map(k => NAME_MAP[k] || k);
    goldChart.data.datasets[0].data = Object.values(data.gold);
    goldChart.update();

    updateTable(data);
  } catch (e) {
    console.error("خطا در دریافت داده WebSocket:", e);
  }
};
</script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(INDEX_HTML);
  } else if (req.url === '/data.json') {
    fs.readFile('./data.json', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Data not found' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(data);
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
  console.log('🔗 New WebSocket connection');
  sendLatestData(ws);
});
function sendLatestData(ws) {
  fs.readFile('./data.json', (err, data) => {
    if (!err) ws.send(data.toString());
  });
}
function broadcastUpdate() {
  fs.readFile('./data.json', (err, data) => {
    if (err) return;
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(data.toString());
    });
  });
}

async function fetchData() {
  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto('https://www.bonbast.com/', { waitUntil: 'networkidle2' });

    const data = await page.evaluate(() => {
      const getVal = (id) => {
        const el = document.querySelector('#' + id);
        if (!el) return 0;
        const txt = el.innerText.replace(/,/g, '').trim();
        const num = Number(txt);
        return isNaN(num) ? 0 : num;
      };

      return {
        currencies: {
          USD: getVal('usd1'),
          EUR: getVal('eur1'),
          GBP: getVal('gbp1'),
          CHF: getVal('chf1'),
          CAD: getVal('cad1'),
          AUD: getVal('aud1'),
          SEK: getVal('sek1'),
          NOK: getVal('nok1'),
          RUB: getVal('rub1'),
          THB: getVal('thb1'),
          SGD: getVal('sgd1'),
          HKD: getVal('hkd1'),
          AZN: getVal('azn1'),
          AMD: getVal('amd1'),
        },
        gold: {
          azadi: getVal('azadi1'),
          emami: getVal('emami1'),
          gol18: getVal('gol18'),
        },
        timestamp: new Date().toISOString()
      };
    });

    await browser.close();
    fs.writeFileSync('./data.json', JSON.stringify(data, null, 2), 'utf-8');
    console.log('✅ Data updated at', new Date().toLocaleTimeString());
    broadcastUpdate();
  } catch (err) {
    console.error('❌ Error fetching data:', err);
  }
}

fetchData();
cron.schedule('*/5 * * * *', fetchData);

server.listen(PORT, HOST, () => {
  console.log(`🚀 Server running at http://${HOST}:${PORT}`);
});
