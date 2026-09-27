const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

function loadEnvironmentFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separator = trimmed.indexOf('=');
    if (separator < 1) return;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  });
}

loadEnvironmentFile();

const app = express();

// Render and similar hosts terminate TLS at a reverse proxy, so Express must
// trust X-Forwarded-* headers to build https:// share links and secure cookies.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS_PATH = path.join(DATA_DIR, 'users.json');
const EVENTS_PATH = path.join(DATA_DIR, 'events.json');
const NOTIFICATIONS_PATH = path.join(DATA_DIR, 'notifications.json');
const sessions = new Map();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use((req, res, next) => {
  const protectedPages = ['/organizer.html', '/join.html', '/admin.html'];
  if (protectedPages.includes(req.path) && !getUserBySession(req)) {
    return res.redirect('/login');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

function ensureFile(filePath, defaultData) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
}

function readJson(filePath, fallback) {
  ensureFile(filePath, fallback);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Storage backend
// ----------------
// Without DATABASE_URL the app keeps using local JSON files (fine for local
// development). With DATABASE_URL (Postgres/Neon/Supabase) the same data is
// mirrored to the database, because hosts such as Render's free plan wipe the
// local filesystem whenever the service redeploys, restarts or spins down.
// Reads stay synchronous from an in-memory copy; writes are queued so they can
// never land out of order.
const dbPool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: /sslmode=(disable|allow|prefer)/i.test(process.env.DATABASE_URL)
        ? undefined
        : { rejectUnauthorized: false }
    })
  : null;

const dbCache = {
  users: { users: [] },
  events: { events: [] },
  notifications: { notifications: [] }
};

let dbWriteQueue = Promise.resolve();

function persistToDb(collection) {
  if (!dbPool) return;
  const payload = JSON.stringify(dbCache[collection]);
  dbWriteQueue = dbWriteQueue
    .then(() =>
      dbPool.query(
        'INSERT INTO app_state (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
        [collection, payload]
      )
    )
    .catch((error) => {
      console.error(`Failed to persist "${collection}":`, error.message);
    });
}

async function initStorage() {
  if (!dbPool) {
    console.log('Storage backend: local JSON files');
    return;
  }
  await dbPool.query(
    'CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY, data JSONB NOT NULL)'
  );
  const result = await dbPool.query('SELECT id, data FROM app_state');
  result.rows.forEach((row) => {
    if (Object.prototype.hasOwnProperty.call(dbCache, row.id)) {
      dbCache[row.id] = row.data;
    }
  });
  console.log(
    `Storage backend: Postgres (${result.rows.length} collection(s) loaded)`
  );
}

dbPool?.on('error', (error) => {
  console.error('Postgres pool error:', error.message);
});

function loadUsers() {
  if (dbPool) return dbCache.users.users || [];
  return readJson(USERS_PATH, { users: [] }).users || [];
}

function saveUsers(users) {
  if (dbPool) {
    dbCache.users = { users };
    persistToDb('users');
    return;
  }
  writeJson(USERS_PATH, { users });
}

function loadEvents() {
  if (dbPool) return dbCache.events.events || [];
  return readJson(EVENTS_PATH, { events: [] }).events || [];
}

function saveEvents(events) {
  if (dbPool) {
    dbCache.events = { events };
    persistToDb('events');
    return;
  }
  writeJson(EVENTS_PATH, { events });
}

function loadNotifications() {
  if (dbPool) return dbCache.notifications.notifications || [];
  return readJson(NOTIFICATIONS_PATH, { notifications: [] }).notifications || [];
}

function saveNotifications(notifications) {
  if (dbPool) {
    dbCache.notifications = { notifications };
    persistToDb('notifications');
    return;
  }
  writeJson(NOTIFICATIONS_PATH, { notifications });
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((part) => {
    const [key, ...rest] = part.trim().split('=');
    if (key) {
      cookies[key] = decodeURIComponent(rest.join('='));
    }
  });
  return cookies;
}

function createSessionToken() {
  return crypto.randomBytes(24).toString('hex');
}

function startUserSession(res, user) {
  const token = createSessionToken();
  sessions.set(token, {
    id: user.id,
    fullName: user.fullName,
    nickname: user.nickname || user.fullName,
    email: user.email
  });
  res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Lax`);
}

function getUserBySession(req) {
  const cookies = parseCookies(req);
  const token = cookies.session;
  if (!token) return null;
  const user = sessions.get(token);
  return user || null;
}

function requireAuth(req, res, next) {
  const user = getUserBySession(req);
  if (!user) {
    if (!req.path.startsWith('/api/')) {
      return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    }
    return res.status(401).json({ message: '請先登入管理後台。' });
  }
  req.user = user;
  next();
}

function makeCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function getEventByCode(code) {
  const normalized = String(code || '').toUpperCase();
  return loadEvents().find((event) => event.code === normalized) || null;
}

function getEventBySlug(slug) {
  return loadEvents().find((event) => event.slug === slug) || null;
}

function getUserById(id) {
  return loadUsers().find((user) => user.id === id) || null;
}

function validateEventTime(date, endDate, startTime, endTime) {
  const normalizedEndDate = endDate || date;
  if (!date || !normalizedEndDate) return '請填寫開始日期與結束日期。';
  if (normalizedEndDate < date) return '結束日期不能早於開始日期。';
  if (normalizedEndDate === date && startTime && endTime && endTime < startTime) {
    return '同日活動的結束時間不能早於開始時間。';
  }
  return null;
}

function buildInviteLink(req, code) {
  return `${req.protocol}://${req.get('host')}/invite?code=${code}`;
}

function getStableAddressHash(value) {
  return Array.from(String(value || '')).reduce((acc, char) => {
    return (acc * 31 + char.charCodeAt(0)) >>> 0;
  }, 0);
}

async function resolveWeatherFromAddress(address, date, latitude, longitude) {
  const fallback = {
    condition: '晴朗',
    temp: '28°C',
    rainChance: '10%',
    wind: '8 km/h',
    source: 'fallback'
  };

  if (!address || !address.trim()) {
    return fallback;
  }

  if (latitude && longitude && date) {
    try {
      const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
      weatherUrl.search = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        daily: 'weather_code,temperature_2m_max,precipitation_probability_max,wind_speed_10m_max',
        timezone: 'auto',
        start_date: date,
        end_date: date
      });
      const weatherResponse = await fetch(weatherUrl);
      const weatherData = await weatherResponse.json();
      if (weatherResponse.ok && weatherData.daily?.time?.length) {
        const code = weatherData.daily.weather_code[0];
        const condition = code === 0 ? '晴朗' : code <= 3 ? '多雲' : code <= 67 ? '降雨' : code <= 77 ? '降雪' : '雷雨';
        return {
          condition,
          temp: `${Math.round(weatherData.daily.temperature_2m_max[0])}°C`,
          rainChance: `${weatherData.daily.precipitation_probability_max[0] ?? 0}%`,
          wind: `${Math.round(weatherData.daily.wind_speed_10m_max[0] ?? 0)} km/h`,
          source: 'open-meteo'
        };
      }
    } catch (error) {
      // use fallback when the forecast service is unavailable or date is too far away
    }
  }

  const hash = getStableAddressHash(address);
  const temp = 22 + (hash % 15);
  const rain = 8 + (hash % 45);
  const wind = 5 + (hash % 20);
  const pool = ['晴朗', '多雲', '短暫陣雨', '午後雷陣雨', '陰天'];
  const conditionIndex = hash % pool.length;

  return {
    condition: pool[conditionIndex],
    temp: `${temp}°C`,
    rainChance: `${rain}%`,
    wind: `${wind} km/h`,
    source: 'fallback'
  };
}

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  return res.json({ status: 'ok' });
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/workspace', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'workspace.html'));
});

app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/organizer', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'organizer.html'));
});

app.get('/join', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

app.get('/invite', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'invite.html'));
});

app.post('/api/auth/register', (req, res) => {
  const { fullName, nickname, email, password } = req.body || {};
  if (!fullName || !nickname || !email || !password) {
    return res.status(400).json({ message: '請填寫姓名、暱稱、電子信箱與密碼。' });
  }

  const users = loadUsers();
  const existing = users.find((user) => user.email.toLowerCase() === String(email).trim().toLowerCase());
  if (existing) {
    return res.status(409).json({ message: '此電子信箱已被註冊。' });
  }

  const user = {
    id: crypto.randomUUID(),
    fullName: String(fullName).trim(),
    nickname: String(nickname || fullName).trim(),
    email: String(email).trim().toLowerCase(),
    passwordHash: hashPassword(String(password).trim()),
    createdAt: new Date().toISOString()
  };

  users.push(user);
  saveUsers(users);

  startUserSession(res, user);

  return res.status(201).json({
    success: true,
    user: { id: user.id, fullName: user.fullName, nickname: user.nickname, email: user.email }
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: '請輸入電子信箱與密碼。' });
  }

  const users = loadUsers();
  const user = users.find((item) => item.email.toLowerCase() === String(email).trim().toLowerCase()
    && item.passwordHash === hashPassword(String(password).trim()));

  if (!user) {
    return res.status(401).json({ message: '電子信箱或密碼錯誤。' });
  }

  startUserSession(res, user);

  return res.json({
    success: true,
    user: { id: user.id, fullName: user.fullName, nickname: user.nickname || user.fullName, email: user.email }
  });
});

app.get('/api/auth/session', (req, res) => {
  const user = getUserBySession(req);
  if (!user) {
    return res.status(401).json({ message: '未登入' });
  }
  return res.json({ user });
});

app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies.session;
  if (token) {
    sessions.delete(token);
  }
  res.setHeader('Set-Cookie', 'session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  return res.json({ success: true });
});

app.get('/api/admin/events', requireAuth, (req, res) => {
  const events = loadEvents().filter((event) => event.organizerId === req.user.id);
  return res.json({ events });
});

app.get('/api/me/dashboard', requireAuth, (req, res) => {
  const now = new Date();
  const events = loadEvents();
  const isPast = (event) => new Date(`${event.endDate || event.date}T${event.endTime || event.startTime || '23:59'}`) < now;
  const visible = events.map((event) => {
    const isHost = event.organizerId === req.user.id;
    const isGuest = (event.participants || []).some((participant) => participant.userId === req.user.id);
    return isHost ? { ...event, role: 'host' } : isGuest ? { ...event, role: 'guest' } : null;
  }).filter(Boolean);
  const userNotifications = loadNotifications().filter((notification) => notification.userId === req.user.id);
  return res.json({
    user: req.user,
    current: visible.filter((event) => !isPast(event)),
    past: visible.filter(isPast),
    notifications: userNotifications,
    unreadNotifications: userNotifications.filter((notification) => !notification.readAt).length
  });
});

app.post('/api/notifications/read', requireAuth, (req, res) => {
  const notifications = loadNotifications();
  const now = new Date().toISOString();
  notifications.forEach((notification) => {
    if (notification.userId === req.user.id && !notification.readAt) notification.readAt = now;
  });
  saveNotifications(notifications);
  return res.json({ success: true });
});

app.get('/api/weather', async (req, res) => {
  const { address, date, latitude, longitude } = req.query;
  const weather = await resolveWeatherFromAddress(address || '', date, latitude, longitude);
  return res.json({ weather });
});

app.get('/api/config/maps-key', (req, res) => {
  return res.json({ apiKey: process.env.GOOGLE_MAPS_API_KEY || '' });
});

app.get('/api/places/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (query.length < 2) return res.json({ places: [] });

  try {
    const searchUrl = new URL('https://nominatim.openstreetmap.org/search');
    searchUrl.search = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '5',
      'accept-language': 'zh-TW,zh;q=0.9,en;q=0.8'
    });
    const response = await fetch(searchUrl, { headers: { 'User-Agent': 'PartyLink local event planner' } });
    if (!response.ok) return res.json({ places: [] });
    const results = await response.json();
    return res.json({ places: results.map((place) => ({
      name: place.name || place.display_name.split(',')[0],
      address: place.display_name,
      latitude: Number(place.lat),
      longitude: Number(place.lon)
    })) });
  } catch (error) {
    return res.json({ places: [] });
  }
});

app.post('/api/events', requireAuth, async (req, res) => {
  const {
    organizerName,
    title,
    summary,
    date,
    endDate,
    startTime,
    endTime,
    location,
    address,
    latitude,
    longitude,
    notes,
    inviteScope,
    inviteList
  } = req.body;

  if (!organizerName || !title || !summary || !date || !location) {
    return res.status(400).json({ message: '請填寫主辦人、活動名稱、簡介、日期與地點。' });
  }

  const timeError = validateEventTime(date, endDate, startTime, endTime);
  if (timeError) return res.status(400).json({ message: timeError });

  const events = loadEvents();
  const code = makeCode();
  const slug = crypto.randomUUID();
  const now = new Date().toISOString();
  const weatherForecast = await resolveWeatherFromAddress(address || location, date, latitude, longitude);

  const event = {
    id: crypto.randomUUID(),
    slug,
    code,
    organizerId: req.user.id,
    organizerName: String(organizerName).trim(),
    title: String(title).trim(),
    summary: String(summary).trim(),
    date,
    endDate: endDate || date,
    startTime: startTime || '',
    endTime: endTime || '',
    location: String(location).trim(),
    address: address ? String(address).trim() : '',
    latitude: latitude ? Number(latitude) : null,
    longitude: longitude ? Number(longitude) : null,
    notes: notes ? String(notes).trim() : '',
    inviteScope: inviteScope || '未設定',
    inviteList: Array.isArray(inviteList)
      ? inviteList
      : String(inviteList || '')
          .split(/[\n,;]+/)
          .map((item) => item.trim())
          .filter(Boolean),
    weatherForecast: {
      ...weatherForecast,
      label: '活動當天預測天氣'
    },
    participants: [],
    notifications: [],
    cancelRequests: [],
    createdAt: now,
    shareLink: buildInviteLink(req, code)
  };

  events.push(event);
  saveEvents(events);

  return res.status(201).json({
    success: true,
    event,
    code,
    link: event.shareLink
  });
});

app.get('/api/events/code/:code', (req, res) => {
  const event = getEventByCode(req.params.code);
  if (!event) {
    return res.status(404).json({ message: '找不到對應活動碼。' });
  }
  return res.json({ event });
});

app.get('/api/events/:slug', (req, res) => {
  const event = getEventBySlug(req.params.slug);
  if (!event) {
    return res.status(404).json({ message: '找不到活動。' });
  }
  return res.json({ event });
});

app.put('/api/events/:slug', requireAuth, async (req, res) => {
  const events = loadEvents();
  const index = events.findIndex((item) => item.slug === req.params.slug);
  const event = events[index];
  if (!event) return res.status(404).json({ message: '找不到活動。' });
  if (event.organizerId !== req.user.id) return res.status(403).json({ message: '只有主辦人可以修改活動。' });

  const allowed = ['title', 'summary', 'date', 'endDate', 'startTime', 'endTime', 'location', 'address', 'notes'];
  const changedFields = allowed.filter((field) => req.body[field] !== undefined && String(req.body[field]) !== String(event[field] || ''));
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) event[field] = String(req.body[field]).trim();
  });
  const timeError = validateEventTime(event.date, event.endDate, event.startTime, event.endTime);
  if (timeError) return res.status(400).json({ message: timeError });
  if (changedFields.includes('location') || changedFields.includes('address')) {
    event.weatherForecast = {
      ...(await resolveWeatherFromAddress(event.address || event.location, event.date, event.latitude, event.longitude)),
      label: '活動當天預測天氣'
    };
  }
  event.updatedAt = new Date().toISOString();

  const notifications = loadNotifications();
  const recipients = (event.participants || []).filter((participant) => participant.status === 'join' && participant.userId);
  recipients.forEach((participant) => notifications.push({
    id: crypto.randomUUID(),
    userId: participant.userId,
    eventSlug: event.slug,
    type: 'event-updated',
    message: `活動「${event.title}」資訊已更新：${changedFields.join('、') || '活動內容'}`,
    email: participant.email || null,
    emailStatus: process.env.SMTP_HOST ? 'queued' : 'not-configured',
    createdAt: event.updatedAt
  }));
  saveNotifications(notifications);
  events[index] = event;
  saveEvents(events);
  return res.json({ success: true, event, notificationCount: recipients.length });
});

app.delete('/api/events/:slug', requireAuth, (req, res) => {
  const events = loadEvents();
  const event = events.find((item) => item.slug === req.params.slug);
  if (!event) return res.status(404).json({ message: '找不到活動。' });
  if (event.organizerId !== req.user.id) return res.status(403).json({ message: '只有主辦人可以刪除活動。' });

  saveEvents(events.filter((item) => item.slug !== req.params.slug));
  return res.json({ success: true, message: '活動已刪除。' });
});

app.post('/api/events/:slug/repeat', requireAuth, async (req, res) => {
  const original = getEventBySlug(req.params.slug);
  if (!original) return res.status(404).json({ message: '找不到活動。' });
  if (original.organizerId !== req.user.id) return res.status(403).json({ message: '只有主辦人可以再次建立活動。' });
  if (!req.body.date) return res.status(400).json({ message: '請提供新的活動日期。' });

  const events = loadEvents();
  const code = makeCode();
  const slug = crypto.randomUUID();
  const repeated = {
    ...original,
    id: crypto.randomUUID(),
    slug,
    code,
    date: String(req.body.date),
    endDate: String(req.body.endDate || req.body.date),
    weatherForecast: {
      ...(await resolveWeatherFromAddress(original.address || original.location, req.body.date, original.latitude, original.longitude)),
      label: '活動當天預測天氣'
    },
    participants: [],
    cancelRequests: [],
    notifications: [],
    createdAt: new Date().toISOString(),
    updatedAt: undefined,
    shareLink: buildInviteLink(req, code)
  };
  events.push(repeated);
  saveEvents(events);
  return res.status(201).json({ success: true, event: repeated, code, link: repeated.shareLink });
});

app.post('/api/events/:slug/rsvp', requireAuth, (req, res) => {
  const event = getEventBySlug(req.params.slug);
  if (!event) {
    return res.status(404).json({ message: '找不到活動。' });
  }

  const { name, status } = req.body;
  const normalizedName = String(name || '').trim();
  const normalizedStatus = status === 'join' ? 'join' : 'decline';

  if (!normalizedName) {
    return res.status(400).json({ message: '請輸入你的名字。' });
  }

  const participants = event.participants || [];
  const existing = participants.find(
    (participant) => participant.name.toLowerCase() === normalizedName.toLowerCase()
  );
  const previousStatus = existing ? existing.status : null;
  const statusChanged = previousStatus !== normalizedStatus;

  if (existing) {
    existing.status = normalizedStatus;
    existing.updatedAt = new Date().toISOString();
  } else {
    participants.push({
      name: normalizedName,
      status: normalizedStatus,
      userId: req.user?.id || null,
      email: req.user?.email || null,
      createdAt: new Date().toISOString()
    });
  }

  event.participants = participants;
  if (statusChanged && event.organizerId !== req.user.id) {
    const notifications = loadNotifications();
    notifications.push({
      id: crypto.randomUUID(),
      userId: event.organizerId,
      eventSlug: event.slug,
      type: 'participant-changed',
      message: `${normalizedName} 已${normalizedStatus === 'join' ? '加入' : '婉拒'}活動「${event.title}」`,
      createdAt: new Date().toISOString()
    });
    saveNotifications(notifications);
  }
  const events = loadEvents();
  const index = events.findIndex((item) => item.slug === req.params.slug);
  if (index >= 0) {
    events[index] = event;
    saveEvents(events);
  }

  return res.json({ success: true, status: normalizedStatus, event });
});

app.post('/api/events/:slug/cancel-request', (req, res) => {
  const event = getEventBySlug(req.params.slug);
  if (!event) {
    return res.status(404).json({ message: '找不到活動。' });
  }

  const { name, reason } = req.body;
  const normalizedName = String(name || '').trim();
  const normalizedReason = String(reason || '').trim();

  if (!normalizedName || !normalizedReason) {
    return res.status(400).json({ message: '請填寫姓名與取消理由。' });
  }

  const requests = event.cancelRequests || [];
  requests.push({
    name: normalizedName,
    reason: normalizedReason,
    createdAt: new Date().toISOString()
  });

  event.cancelRequests = requests;
  const events = loadEvents();
  const index = events.findIndex((item) => item.slug === req.params.slug);
  if (index >= 0) {
    events[index] = event;
    saveEvents(events);
  }

  return res.json({ success: true, message: '取消申請已提交。' });
});

process.on('SIGTERM', () => {
  Promise.race([
    dbWriteQueue,
    new Promise((resolve) => setTimeout(resolve, 3000))
  ]).then(() => process.exit(0));
});

initStorage()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Party invite platform is running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    // Fail fast instead of serving with an empty cache: writing back an empty
    // cache could overwrite everything that is already stored in the database.
    console.error('Failed to initialise storage:', error);
    process.exit(1);
  });
