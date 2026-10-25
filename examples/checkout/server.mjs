import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3000);
const fixed = process.env.FIX_BUG === '1';
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>GhostBug demo · Checkout</title>
<style>
:root{color-scheme:dark;font-family:system-ui,sans-serif}body{background:#0e1320;color:#e4eaff;max-width:700px;margin:10vh auto;padding:24px}
main{background:#181f32;border:1px solid #303f61;border-radius:16px;padding:32px}h1{font-size:28px}
button{background:#7e8dff;color:#071029;border:0;border-radius:8px;padding:12px 18px;font-size:16px;font-weight:700;cursor:pointer}
[role=alert]{min-height:28px;margin-top:20px;color:#ffd18a}.muted{opacity:.65}
</style></head><body><main><p class="muted">GhostBug · Deliberately buggy example</p>
<h1>Demo checkout</h1><p>Test order total: €19.00</p>
<button id="pay-button" data-testid="pay-button">Pay now</button><div id="result" role="alert" aria-live="polite"></div>
<p class="muted">API always responds 500. The UI bug is the error-handling message.</p>
</main><script>
document.getElementById('pay-button').addEventListener('click', async () => {
  const result = document.getElementById('result');
  result.textContent = 'Processing...';
  try {
    const response = await fetch('/api/pay', { method: 'POST' });
    if (!response.ok) {
      result.textContent = ${JSON.stringify(fixed ? 'Payment failed. Please retry.' : 'Unexpected error')};
      return;
    }
    result.textContent = 'Payment succeeded';
  } catch { result.textContent = 'Network error'; }
});
</script></body></html>`;

const server = createServer((req, res) => {
  if (req.url === '/api/pay' && req.method === 'POST') {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'payment_failed' }));
    return;
  }
  if ((req.url === '/' || req.url === '/checkout') && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  res.writeHead(404); res.end('Not found');
});
server.listen(port, '127.0.0.1', () => {
  console.log(`GhostBug demo on http://localhost:${port}/checkout (${fixed ? 'FIXED' : 'BUGGY'})`);
});
