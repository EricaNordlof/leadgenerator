import 'dotenv/config';

const hostport = process.env.WEB_HOSTPORT;
const secret = process.env.CRON_SECRET;
if (!hostport || !secret) {
  console.error('WEB_HOSTPORT eller CRON_SECRET saknas.');
  process.exit(1);
}

const response = await fetch(`http://${hostport}/api/internal/discovery`, {
  method: 'POST',
  headers: { authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(180_000)
});
const text = await response.text();
console.log(text);
if (!response.ok) process.exit(1);
