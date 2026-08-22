// FLAGS WAR ARENA — Vercel server-side YouTube bridge.
// The browser/OBS never receives Google credentials.
//
// Recommended Production variables:
//   YOUTUBE_API_KEY
//   YOUTUBE_OAUTH_CLIENT_ID
//   YOUTUBE_OAUTH_CLIENT_SECRET
//   YOUTUBE_OAUTH_REFRESH_TOKEN
//
// Fallback (API-key-only) discovery variables:
//   YOUTUBE_CHANNEL_ID OR YOUTUBE_CHANNEL_HANDLE
//   YOUTUBE_LIVE_VIDEO_ID (optional fixed broadcast)

const API = 'https://www.googleapis.com/youtube/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ALLOWED_ORIGIN = 'https://last-flag-standing.vercel.app';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Origin');
  const origin = String(res.req?.headers?.origin || '');
  if (origin === ALLOWED_ORIGIN || !origin) res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.end(JSON.stringify(body));
}

function youtubeError(body, fallback) {
  const err = body && body.error;
  const e = err && err.errors && err.errors[0];
  return {
    reason: e && e.reason || '',
    message: err && err.message || fallback || 'YouTube API request failed.'
  };
}

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

async function getOAuthAccessToken() {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt - 60000) return cachedAccessToken;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body
  });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json?.access_token) {
    const message = json?.error_description || json?.error || 'Could not refresh the YouTube OAuth token.';
    throw Object.assign(new Error(message), { reason: json?.error || 'oauthRefreshFailed', status: r.status });
  }
  cachedAccessToken = json.access_token;
  cachedAccessTokenExpiresAt = Date.now() + Number(json.expires_in || 3600) * 1000;
  return cachedAccessToken;
}

async function yt(path, params, accessToken) {
  const u = new URL(API + path);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  });
  const headers = { accept: 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  else u.searchParams.set('key', process.env.YOUTUBE_API_KEY || '');
  const r = await fetch(u, { headers });
  const body = await r.json().catch(() => null);
  return { r, body };
}

async function discoverChannelId() {
  if (process.env.YOUTUBE_CHANNEL_ID) return process.env.YOUTUBE_CHANNEL_ID.trim();
  if (process.env.YOUTUBE_CHANNEL_HANDLE) {
    const handle = process.env.YOUTUBE_CHANNEL_HANDLE.trim().replace(/^@/, '');
    const { r, body } = await yt('/channels', { part: 'id', forHandle: handle }, null);
    if (!r.ok) {
      const e = youtubeError(body);
      throw Object.assign(new Error(e.message), { reason: e.reason, status: r.status });
    }
    return body?.items?.[0]?.id || '';
  }
  return '';
}

async function resolveVideo(accessToken) {
  const fixed = String(process.env.YOUTUBE_LIVE_VIDEO_ID || '').trim();
  if (fixed) {
    const { r, body } = await yt('/videos', { part: 'liveStreamingDetails,snippet', id: fixed }, accessToken);
    if (!r.ok) {
      const e = youtubeError(body);
      throw Object.assign(new Error(e.message), { reason: e.reason, status: r.status });
    }
    const item = body?.items?.[0];
    if (!item) return null;
    return {
      videoId: fixed,
      title: item.snippet?.title || fixed,
      channelId: item.snippet?.channelId || '',
      chatId: item.liveStreamingDetails?.activeLiveChatId || null
    };
  }

  // Preferred path: OAuth lets the server ask YouTube directly for the
  // authenticated channel's active broadcasts. This avoids search.list quota
  // and automatically follows a new live video every day.
  if (accessToken) {
    // Some YouTube API deployments reject combining `mine` with a status
    // filter even though both parameters are documented. Retrieve the
    // authenticated user's broadcasts with `mine=true`, then select the
    // broadcast whose lifecycle status is actually `live` locally. This also
    // lets us gracefully handle scheduled/offline broadcasts.
    const { r, body } = await yt('/liveBroadcasts', {
      part: 'id,snippet,status', mine: 'true', maxResults: 50, broadcastType: 'all'
    }, accessToken);
    if (!r.ok) {
      const e = youtubeError(body);
      throw Object.assign(new Error(e.message), { reason: e.reason, status: r.status });
    }
    const items = Array.isArray(body?.items) ? body.items : [];
    const item = items.find((candidate) => candidate?.status?.lifeCycleStatus === 'live') || null;
    if (!item) return null;
    return {
      videoId: item.id,
      title: item.snippet?.title || item.id,
      channelId: item.snippet?.channelId || '',
      chatId: item.snippet?.liveChatId || null
    };
  }

  // API-key-only fallback. This is intentionally not the preferred path because
  // search.list has its own daily quota bucket. Use OAuth for unattended streams.
  const channelId = await discoverChannelId();
  if (!channelId) return { setupRequired: true };
  const { r, body } = await yt('/search', {
    part: 'snippet', channelId, eventType: 'live', type: 'video', order: 'date', maxResults: 1
  }, null);
  if (!r.ok) {
    const e = youtubeError(body);
    throw Object.assign(new Error(e.message), { reason: e.reason, status: r.status });
  }
  const item = body?.items?.[0];
  if (!item?.id?.videoId) return null;
  const videoId = item.id.videoId;
  const v = await yt('/videos', { part: 'liveStreamingDetails,snippet', id: videoId }, null);
  if (!v.r.ok) {
    const e = youtubeError(v.body);
    throw Object.assign(new Error(e.message), { reason: e.reason, status: v.r.status });
  }
  const video = v.body?.items?.[0];
  if (!video) return null;
  return {
    videoId,
    title: video.snippet?.title || item.snippet?.title || videoId,
    channelId: video.snippet?.channelId || channelId,
    chatId: video.liveStreamingDetails?.activeLiveChatId || null
  };
}

async function handleInit(res) {
  if (!process.env.YOUTUBE_API_KEY && !(process.env.YOUTUBE_OAUTH_CLIENT_ID && process.env.YOUTUBE_OAUTH_CLIENT_SECRET && process.env.YOUTUBE_OAUTH_REFRESH_TOKEN)) {
    return send(res, 500, { ok: false, setupRequired: true, message: 'Add YOUTUBE_API_KEY and the YouTube OAuth variables to Vercel.' });
  }
  try {
    const accessToken = await getOAuthAccessToken();
    const live = await resolveVideo(accessToken);
    if (live?.setupRequired) {
      return send(res, 500, {
        ok: false,
        setupRequired: true,
        message: 'For automatic daily stream detection, add YOUTUBE_OAUTH_CLIENT_ID, YOUTUBE_OAUTH_CLIENT_SECRET and YOUTUBE_OAUTH_REFRESH_TOKEN. API-key-only fallback needs YOUTUBE_CHANNEL_ID.'
      });
    }
    if (!live) return send(res, 200, { ok: true, chatId: null, message: 'No active YouTube Live broadcast found.' });
    if (!live.chatId) return send(res, 200, { ok: true, chatId: null, videoId: live.videoId, title: live.title, message: 'The active broadcast was found, but its live chat is not active yet.' });
    return send(res, 200, { ok: true, videoId: live.videoId, title: live.title, chatId: live.chatId });
  } catch (e) {
    return send(res, e.status || 502, { ok: false, reason: e.reason || '', message: e.message || 'YouTube discovery failed.' });
  }
}

async function handlePoll(req, res) {
  const chatId = String(req.query.chatId || '').trim();
  if (!chatId) return send(res, 400, { ok: false, message: 'chatId is required.' });
  const maxResults = Math.min(2000, Math.max(50, Number(req.query.maxResults) || 500));
  const params = { part: 'snippet,authorDetails', liveChatId: chatId, maxResults };
  if (req.query.pageToken) params.pageToken = String(req.query.pageToken);
  try {
    const accessToken = await getOAuthAccessToken();
    if (!accessToken && !process.env.YOUTUBE_API_KEY) return send(res, 500, { ok: false, message: 'No YouTube credential is configured on Vercel.' });
    const { r, body } = await yt('/liveChat/messages', params, accessToken);
    if (!r.ok) {
      const e = youtubeError(body);
      return send(res, r.status, { ok: false, reason: e.reason, message: e.message });
    }
    return send(res, 200, {
      ok: true,
      nextPageToken: body.nextPageToken || null,
      pollingIntervalMillis: body.pollingIntervalMillis || 10000,
      items: body.items || []
    });
  } catch (e) {
    return send(res, e.status || 502, { ok: false, reason: e.reason || '', message: e.message || 'YouTube chat request failed.' });
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return send(res, 405, { ok: false, message: 'GET only.' });
    const action = String(req.query.action || 'init');
    if (action === 'init') return handleInit(res);
    if (action === 'poll') return handlePoll(req, res);
    return send(res, 400, { ok: false, message: 'Unknown action.' });
  } catch (e) {
    return send(res, 500, { ok: false, message: e.message || 'Unexpected server error.' });
  }
};
