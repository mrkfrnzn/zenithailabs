import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const api = axios.create({ baseURL: BASE_URL });

// Attach JWT on every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('survivor_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Surface error messages
api.interceptors.response.use(
  res => res,
  err => {
    const msg = err.response?.data?.error || err.message || 'Request failed';
    return Promise.reject(new Error(msg));
  }
);

// ── Auth ────────────────────────────────────────────────────────────────────
export const requestMagicLink = email =>
  api.post('/api/auth/magic-link', { email }).then(r => r.data);

export const verifyMagicLink = token =>
  api.get(`/api/auth/verify?token=${token}`).then(r => r.data);

export const getMe = () =>
  api.get('/api/auth/me').then(r => r.data);

// ── Seasons & Weeks ──────────────────────────────────────────────────────────
export const getSeasons = () =>
  api.get('/api/seasons').then(r => r.data);

export const getWeeks = seasonId =>
  api.get(`/api/seasons/${seasonId}/weeks`).then(r => r.data);

export const getMyEntry = seasonId =>
  api.get(`/api/seasons/${seasonId}/my-entry`).then(r => r.data);

// ── Players ──────────────────────────────────────────────────────────────────
export const getPlayers = (position) =>
  api.get('/api/players', { params: { position } }).then(r => r.data);

export const getEligiblePlayers = weekId =>
  api.get(`/api/players/eligible/${weekId}`).then(r => r.data);

export const getUsedPlayers = entryId =>
  api.get(`/api/players/used/${entryId}`).then(r => r.data);

// ── Lineups ──────────────────────────────────────────────────────────────────
export const submitLineup = (weekId, entryId, slots) =>
  api.post('/api/lineups', { weekId, entryId, slots }).then(r => r.data);

export const getMyLineups = seasonId =>
  api.get(`/api/lineups/my/${seasonId}`).then(r => r.data);

export const getWeekLineups = weekId =>
  api.get(`/api/lineups/week/${weekId}`).then(r => r.data);

export const getLineupForEntry = (weekId, entryId) =>
  api.get(`/api/lineups/week/${weekId}/entry/${entryId}`).then(r => r.data);

// ── Scores ───────────────────────────────────────────────────────────────────
export const getWeekScores = weekId =>
  api.get(`/api/scores/week/${weekId}`).then(r => r.data);

export const getEntryScores = entryId =>
  api.get(`/api/scores/entry/${entryId}`).then(r => r.data);

export const triggerScoring = weekId =>
  api.post(`/api/scores/calculate/${weekId}`).then(r => r.data);

// ── Standings ────────────────────────────────────────────────────────────────
export const getStandings = seasonId =>
  api.get(`/api/standings/${seasonId}`).then(r => r.data);

// ── Payouts ──────────────────────────────────────────────────────────────────
export const getPayouts = (seasonId, params) =>
  api.get(`/api/payouts/${seasonId}`, { params }).then(r => r.data);

// ── Admin ────────────────────────────────────────────────────────────────────
export const adminGetSeasons       = ()           => api.get('/api/admin/seasons').then(r => r.data);
export const adminCreateSeason     = body         => api.post('/api/admin/seasons', body).then(r => r.data);
export const adminUpdateSeason     = (id, body)   => api.patch(`/api/admin/seasons/${id}`, body).then(r => r.data);
export const adminGetWeeks         = seasonId     => api.get(`/api/admin/weeks/${seasonId}`).then(r => r.data);
export const adminCreateWeek       = body         => api.post('/api/admin/weeks', body).then(r => r.data);
export const adminUpdateWeek       = (id, body)   => api.patch(`/api/admin/weeks/${id}`, body).then(r => r.data);
export const adminGetParticipants  = seasonId     => api.get(`/api/admin/participants/${seasonId}`).then(r => r.data);
export const adminAddParticipant   = body         => api.post('/api/admin/participants', body).then(r => r.data);
export const adminSetPaid          = (id, paid)   => api.patch(`/api/admin/participants/${id}/paid`, { paid }).then(r => r.data);
export const adminGetLineups       = weekId       => api.get(`/api/admin/lineups/${weekId}`).then(r => r.data);
export const adminOverrideLineup   = (id, slots)  => api.patch(`/api/admin/lineups/${id}`, { slots }).then(r => r.data);
export const adminGetStats         = weekId       => api.get(`/api/admin/stats/${weekId}`).then(r => r.data);
export const adminPutStats         = body         => api.put('/api/admin/stats', body).then(r => r.data);
export const adminGetPayoutRules   = seasonId     => api.get(`/api/admin/payout-rules/${seasonId}`).then(r => r.data);
export const adminUpdatePayoutRule = (id, body)   => api.put(`/api/admin/payout-rules/${id}`, body).then(r => r.data);
export const adminGetUsers         = ()           => api.get('/api/admin/users').then(r => r.data);
export const adminUpdateUserRole   = (id, role)   => api.patch(`/api/admin/users/${id}/role`, { role }).then(r => r.data);
export const adminGetAuditLogs     = params       => api.get('/api/admin/audit-logs', { params }).then(r => r.data);
export const adminGetLeagues       = ()           => api.get('/api/admin/leagues').then(r => r.data);
export const adminCreateLeague     = body         => api.post('/api/admin/leagues', body).then(r => r.data);
export const adminUpdateLeague     = (id, body)   => api.patch(`/api/admin/leagues/${id}`, body).then(r => r.data);

export default api;
