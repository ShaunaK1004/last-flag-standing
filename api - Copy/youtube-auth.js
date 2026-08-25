// One-time OAuth bootstrap for FLAGS WAR ARENA.
// Configure YOUTUBE_OAUTH_CLIENT_ID and YOUTUBE_OAUTH_CLIENT_SECRET in Vercel first.
// The callback displays the refresh token once; copy it into the Vercel
// YOUTUBE_OAUTH_REFRESH_TOKEN environment variable, then remove/ignore this route.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REDIRECT_URI = 'https://last-flag-standing.vercel.app/api/youtube-auth?action=callback';
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

function html(res, status, title, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui;background:#0b0d14;color:#eee;padding:32px;line-height:1.5}code{word-break:break-all;background:#151925;padding:12px;display:block;border-radius:8px}h1{color:#5fe8ff}p{max-width:900px}</style></head><body><h1>${title}</h1>${body}</body></html>`);
}

function cookieValue(req, name) {
  const raw = String(req.headers.cookie || '');
  const part = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : '';
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return html(res, 405, 'Method not allowed', '<p>GET only.</p>');
  const action = String(req.query.action || 'start');
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return html(res, 500, 'OAuth setup incomplete', '<p>Add <b>YOUTUBE_OAUTH_CLIENT_ID</b> and <b>YOUTUBE_OAUTH_CLIENT_SECRET</b> to Vercel first.</p>');
  }

  if (action === 'start') {
    const state = crypto.randomUUID();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state
    });
    res.statusCode = 302;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Set-Cookie', `arena_oauth_state=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    res.setHeader('Location', AUTH_URL + '?' + params.toString());
    return res.end();
  }

  if (action === 'callback') {
    const error = String(req.query.error || '');
    if (error) return html(res, 400, 'YouTube authorization denied', `<p>Google returned: <b>${error}</b>. You can close this tab and try again.</p>`);
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const saved = cookieValue(req, 'arena_oauth_state');
    if (!code || !state || !saved || state !== saved) {
      return html(res, 400, 'OAuth state check failed', '<p>The authorization response could not be verified. Start the OAuth flow again.</p>');
    }

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    });
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body
    });
    const token = await tokenRes.json().catch(() => null);
    if (!tokenRes.ok || !token?.refresh_token) {
      return html(res, tokenRes.status || 502, 'Token exchange failed', `<p>${token?.error_description || token?.error || 'Google did not return a refresh token.'}</p>`);
    }
    res.setHeader('Set-Cookie', 'arena_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return html(res, 200, 'OAuth refresh token received', `<p>Copy this value into the Vercel Production environment variable <b>YOUTUBE_OAUTH_REFRESH_TOKEN</b>.</p><code>${token.refresh_token}</code><p><b>Do not publish this token.</b> After adding it to Vercel, redeploy. OBS will then need only the Vercel page URL.</p>`);
  }

  return html(res, 400, 'Unknown OAuth action', '<p>Use <code>?action=start</code>.</p>');
};
