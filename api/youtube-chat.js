// FLAGS WAR ARENA — shared YouTube Live Chat bridge.
//
// IMPORTANT architecture:
//   Browser clients -> /api/youtube-chat?action=sync -> Upstash Redis
//                                      |
//                                      +-- ONE leader polls YouTube
//
// Only one YouTube liveChatMessages.list request is made per YouTube polling
// interval, and broadcast discovery is performed only at stream start/end, regardless of how many desktop/mobile/OBS browser instances are
// open. All clients read the same Redis event buffer.
//
// Required existing variables:
//   YOUTUBE_API_KEY (optional when OAuth is configured)
//   YOUTUBE_OAUTH_CLIENT_ID
//   YOUTUBE_OAUTH_CLIENT_SECRET
//   YOUTUBE_OAUTH_REFRESH_TOKEN
//
// Required new Vercel/Upstash variables:
//   KV_REST_API_URL
//   KV_REST_API_TOKEN

const API = 'https://www.googleapis.com/youtube/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ALLOWED_ORIGIN = 'https://last-flag-standing.vercel.app';

const K = {
  state: 'fwa:yt:state:v3',
  events: 'fwa:yt:events:v3',
  seq: 'fwa:yt:seq:v3',
  lock: 'fwa:yt:poll-lock:v3'
};

const DEFAULT_POLL_MS = 10000; // server-side YouTube poll floor
const LEADER_LOCK_MS = 15000;
const STATE_TTL_SEC = 3600;
const EVENT_MAX = 2500;

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

function redisReady() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function redis(command, ...args) {
  if (!redisReady()) throw Object.assign(new Error('Upstash Redis is not configured. Add KV_REST_API_URL and KV_REST_API_TOKEN.'), { reason: 'redisNotConfigured', status: 500 });
  const url = String(process.env.KV_REST_API_URL).replace(/\/$/, '');
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([command, ...args])
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(body?.error || 'Upstash request failed.'), { status: r.status, reason: 'redisError' });
  return body?.result;
}

async function redisSetJson(key, value, ttlSec) {
  const args = [key, JSON.stringify(value)];
  if (ttlSec) args.push('EX', String(ttlSec));
  await redis('SET', ...args);
}

async function redisGetJson(key) {
  const v = await redis('GET', key);
  if (!v) return null;
  try { return JSON.parse(v); } catch (_) { return null; }
}

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;
async function getOAuthAccessToken() {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt - 60000) return cachedAccessToken;
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' });
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json?.access_token) {
    throw Object.assign(new Error(json?.error_description || json?.error || 'Could not refresh YouTube OAuth token.'), { reason: json?.error || 'oauthRefreshFailed', status: r.status });
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

async function resolveVideo(accessToken) {
  const fixed = String(process.env.YOUTUBE_LIVE_VIDEO_ID || '').trim();
  if (fixed) {
    const { r, body } = await yt('/videos', { part: 'liveStreamingDetails,snippet', id: fixed }, accessToken);
    if (!r.ok) { const e = youtubeError(body); throw Object.assign(new Error(e.message), { reason: e.reason, status: r.status }); }
    const item = body?.items?.[0];
    if (!item) return null;
    return { videoId: fixed, title: item.snippet?.title || fixed, channelId: item.snippet?.channelId || '', chatId: item.liveStreamingDetails?.activeLiveChatId || null };
  }
  if (accessToken) {
    const { r, body } = await yt('/liveBroadcasts', { part: 'id,snippet,status', mine: 'true', maxResults: 50, broadcastType: 'all' }, accessToken);
    if (!r.ok) { const e = youtubeError(body); throw Object.assign(new Error(e.message), { reason: e.reason, status: r.status }); }
    const item = (Array.isArray(body?.items) ? body.items : []).find(x => x?.status?.lifeCycleStatus === 'live') || null;
    if (!item) return null;
    return { videoId: item.id, title: item.snippet?.title || item.id, channelId: item.snippet?.channelId || '', chatId: item.snippet?.liveChatId || null };
  }
  return null;
}

async function getState() { return await redisGetJson(K.state); }

async function acquireLock() {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const result = await redis('SET', K.lock, token, 'NX', 'PX', String(LEADER_LOCK_MS));
  return result === 'OK' ? token : null;
}

async function releaseLock(token) {
  // Do not DEL someone else's lock if a function overran its lease.
  const current = await redis('GET', K.lock);
  if (current === token) await redis('DEL', K.lock);
}

async function resetForBroadcast(live) {
  const state = {
    videoId: live.videoId,
    title: live.title,
    chatId: live.chatId,
    pageToken: null,
    nextPollAt: Date.now(),
    seq: Number(await redis('GET', K.seq) || 0),
    updatedAt: Date.now(),
    lastError: null,
    offline: false
  };
  await redisSetJson(K.state, state, STATE_TTL_SEC);
  // A new broadcast gets a fresh event list so a new browser never sees old
  // messages from yesterday's stream.
  await redis('DEL', K.events);
  await redis('DEL', K.seq);
  state.seq = 0;
  await redisSetJson(K.state, state, STATE_TTL_SEC);
  return state;
}

async function appendEvents(items, state) {
  let seq = Number(state.seq || 0);
  for (const it of items || []) {
    if (!it?.id) continue;
    seq = Number(await redis('INCR', K.seq));
    const sn = it.snippet || {};
    const author = it.authorDetails || {};
    const event = {
      seq,
      id: it.id,
      username: author.displayName || author.channelId || 'viewer',
      text: sn.displayMessage || (sn.textMessageDetails && sn.textMessageDetails.messageText) || '',
      publishedAt: sn.publishedAt || new Date().toISOString()
    };
    // LPUSH means newest event is at index 0.
    await redis('LPUSH', K.events, JSON.stringify(event));
  }
  // Keep enough history for reconnecting mobile/desktop clients without letting
  // Redis grow forever.
  await redis('LTRIM', K.events, '0', String(EVENT_MAX - 1));
  state.seq = seq;
  return state;
}

async function pollYouTube(state) {
  const accessToken = await getOAuthAccessToken();
  if (!accessToken && !process.env.YOUTUBE_API_KEY) throw Object.assign(new Error('No YouTube credential is configured.'), { reason: 'youtubeCredentialMissing', status: 500 });
  if (!state.chatId) return { state, items: [] };

  const params = { part: 'snippet,authorDetails', liveChatId: state.chatId, maxResults: 2000 };
  if (state.pageToken) params.pageToken = state.pageToken;
  const { r, body } = await yt('/liveChat/messages', params, accessToken);
  if (!r.ok) {
    const e = youtubeError(body);
    throw Object.assign(new Error(e.message), { reason: e.reason, status: r.status });
  }
  const items = Array.isArray(body?.items) ? body.items : [];
  state.pageToken = body?.nextPageToken || state.pageToken;
  const apiHint = Number(body?.pollingIntervalMillis) || DEFAULT_POLL_MS;
  // Never poll faster than YouTube asks us to. Also enforce 10s minimum so the
  // default 10,000-unit daily project can sustain a 5-hour stream when list
  // reads cost 5 units: 5h / 10s = 1,800 reads = 9,000 units.
  const waitMs = Math.max(DEFAULT_POLL_MS, apiHint);
  state.nextPollAt = Date.now() + waitMs;
  state.updatedAt = Date.now();
  state.lastError = null;
  return { state, items, waitMs };
}

async function sync(req, res) {
  const clientCursorRaw = req.query.cursor;
  const bootstrap = clientCursorRaw === undefined || clientCursorRaw === '';
  let baseSeq = Number(clientCursorRaw || 0);
  const lock = await acquireLock();
  try {
    let state = await getState();
    const now = Date.now();
    // For a first connection, remember the event sequence BEFORE this sync
    // performs a YouTube poll. That way messages fetched by this very first
    // poll are delivered to the new client instead of being treated as history.
    if (bootstrap) baseSeq = Number(state?.seq || await redis('GET', K.seq) || 0);
    // Broadcast discovery is intentionally event-driven. A cached state is
    // authoritative between discovery events; do NOT re-run
    // LiveBroadcasts.list merely because the state is older than 30 seconds.
    // This prevents the old broadcast-list quota leak.
    if (!state || state.offline || !state.chatId) {
      if (lock) {
        // Re-read after acquiring the lock because another invocation may have
        // initialized the shared state immediately before this one.
        state = await getState();
        if (!state || state.offline || !state.chatId) {
          const live = await resolveVideo(await getOAuthAccessToken());
          if (live?.chatId) {
            // Avoid resetting the event stream if the discovered broadcast is
            // already the same one stored by another invocation.
            if (!state || state.videoId !== live.videoId || state.chatId !== live.chatId) {
              state = await resetForBroadcast(live);
            } else {
              state.offline = false;
              state.updatedAt = Date.now();
              await redisSetJson(K.state, state, STATE_TTL_SEC);
            }
          } else {
            state = state || {
              videoId: null, title: null, chatId: null, pageToken: null,
              nextPollAt: now + 15000,
              seq: Number(await redis('GET', K.seq) || 0),
              updatedAt: now, offline: true
            };
            state.offline = true;
            state.updatedAt = now;
            state.nextPollAt = now + 15000;
            await redisSetJson(K.state, state, STATE_TTL_SEC);
          }
        }
      } else if (!state) {
        return send(res, 200, { ok: true, status: 'starting', items: [], nextCursor: 0, message: 'Waiting for shared chat leader.' });
      }
    }

    if (state && lock && state.chatId && now >= Number(state.nextPollAt || 0)) {
      try {
        const result = await pollYouTube(state);
        state = result.state;
        state = await appendEvents(result.items, state);
        await redisSetJson(K.state, state, STATE_TTL_SEC);
      } catch (e) {
        state.lastError = { reason: e.reason || '', message: e.message || 'YouTube poll failed.', at: Date.now() };

        // Only an explicit end/not-found signal triggers a new broadcast
        // discovery. Ordinary transient errors NEVER cause broadcast-list
        // discovery, which prevents repeated LiveBroadcasts.list calls.
        const ended = e.reason === 'liveChatEnded' ||
                      e.reason === 'liveChatNotFound' ||
                      e.reason === 'videoNotFound';
        if (ended) {
          state.offline = true;
          state.chatId = null;
          state.pageToken = null;
        }

        // Back off on quota/rate-limit errors rather than hammering YouTube.
        const backoff = e.reason === 'quotaExceeded' ? 60000 :
                        (e.reason === 'rateLimitExceeded' ? 30000 : 15000);
        state.nextPollAt = Date.now() + backoff;
        state.updatedAt = Date.now();
        await redisSetJson(K.state, state, STATE_TTL_SEC);
      }
    }

    state = await getState() || state;
    const currentSeq = Number(state?.seq || await redis('GET', K.seq) || 0);

    // Newest-first list; return chronological order for deterministic gameplay.
    const raw = await redis('LRANGE', K.events, '0', String(EVENT_MAX - 1));
    const parsed = (Array.isArray(raw) ? raw : []).map(x => { try { return JSON.parse(x); } catch (_) { return null; } }).filter(Boolean);
    const items = parsed.filter(x => Number(x.seq) > baseSeq).sort((a,b) => Number(a.seq) - Number(b.seq));

    return send(res, 200, {
      ok: true,
      videoId: state?.videoId || null,
      title: state?.title || null,
      chatId: state?.chatId || null,
      items,
      nextCursor: currentSeq,
      nextPollAt: Number(state?.nextPollAt || 0),
      serverNow: Date.now(),
      leader: !!lock,
      lastError: state?.lastError || null,
      pollingIntervalMillis: Math.max(DEFAULT_POLL_MS, Number(state?.nextPollAt || 0) - Date.now())
    });
  } finally {
    if (lock) await releaseLock(lock).catch(() => {});
  }
}

async function legacyInit(res) {
  try {
    let state = await getState();

    // Reuse the shared state whenever possible. This endpoint is kept only
    // for compatibility with older browser code; it must never cause each
    // browser tab/device to call LiveBroadcasts.list.
    if (state && state.chatId && !state.offline) {
      return send(res, 200, {
        ok: true,
        videoId: state.videoId || null,
        title: state.title || null,
        chatId: state.chatId || null,
        shared: true
      });
    }

    const lock = await acquireLock();
    try {
      state = await getState();
      if (state && state.chatId && !state.offline) {
        return send(res, 200, {
          ok: true,
          videoId: state.videoId || null,
          title: state.title || null,
          chatId: state.chatId || null,
          shared: true
        });
      }

      if (!lock) {
        return send(res, 200, {
          ok: true,
          status: 'starting',
          videoId: null,
          title: null,
          chatId: null,
          shared: true,
          message: 'Waiting for shared chat leader.'
        });
      }

      const live = await resolveVideo(await getOAuthAccessToken());
      if (!live?.chatId) {
        return send(res, 200, { ok: true, chatId: null, message: 'No active YouTube Live broadcast found.' });
      }
      state = await resetForBroadcast(live);
      return send(res, 200, {
        ok: true,
        videoId: state.videoId,
        title: state.title,
        chatId: state.chatId,
        shared: true
      });
    } finally {
      if (lock) await releaseLock(lock).catch(() => {});
    }
  } catch (e) {
    return send(res, e.status || 502, { ok: false, reason: e.reason || '', message: e.message || 'YouTube discovery failed.' });
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return send(res, 405, { ok: false, message: 'GET only.' });
    if (!redisReady() && String(req.query.action || '') === 'sync') {
      return send(res, 500, { ok: false, reason: 'redisNotConfigured', message: 'Add KV_REST_API_URL and KV_REST_API_TOKEN in Vercel before using shared realtime chat.' });
    }
    const action = String(req.query.action || 'sync');
    if (action === 'sync') return sync(req, res);
    if (action === 'init') return legacyInit(res);
    return send(res, 400, { ok: false, message: 'Unknown action.' });
  } catch (e) {
    return send(res, e.status || 500, { ok: false, reason: e.reason || '', message: e.message || 'Unexpected error.' });
  }
};
