import 'dotenv/config';

const hostport = process.env.WEB_HOSTPORT;
const secret = process.env.CRON_SECRET;
if (!hostport || !secret) {
  console.error('WEB_HOSTPORT eller CRON_SECRET saknas. Kontrollera cron-jobbets miljögrupp och Blueprint-rootDir.');
  process.exit(1);
}

const url = `http://${hostport}/api/internal/discovery`;
console.log(`Startar daglig leadinsamling via ${hostport}...`);

try {
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(420_000)
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }

  if (!response.ok) {
    console.error(`Leadinsamlingen svarade ${response.status}: ${data?.error || text}`);
    process.exit(1);
  }

  if (data?.busy) {
    console.log('En annan leadinsamling körs redan. Cron-jobbet avslutas utan fel.');
    process.exit(0);
  }

  console.log(JSON.stringify(data, null, 2));
} catch (error) {
  console.error(`Kunde inte köra leadinsamlingen: ${error.message}`);
  process.exit(1);
}
