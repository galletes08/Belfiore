const TRACK123_API_URL = 'https://api.track123.com/gateway/open-api';

const TRACK123_STATUS_MAP = [
  { match: ['003', 'delivered'], value: 'Delivered' },
  { match: ['002', 'out for delivery'], value: 'Out for Delivery' },
  { match: ['004', 'in transit', 'transit'], value: 'In Transit' },
  { match: ['packed'], value: 'Packed' },
  { match: ['001', 'init', 'preparing', 'info received', 'pending', 'notfound', 'exception'], value: 'Pending' },
  { match: ['cancelled', 'canceled'], value: 'Cancelled' },
];

function getApiKey() {
  return String(process.env.TRACK123_API_KEY || '').trim();
}

function getWebhookToken() {
  return String(process.env.TRACK123_WEBHOOK_TOKEN || '').trim();
}

export function isTrack123Configured() {
  return Boolean(getApiKey());
}

export function verifyTrack123WebhookRequest(req) {
  const configuredToken = getWebhookToken();
  if (!configuredToken) return true;

  const providedToken =
    String(req.query?.token || '').trim() ||
    String(req.get('x-track123-webhook-token') || '').trim();

  return providedToken === configuredToken;
}

async function requestTrack123(path, payload, method = 'POST') {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Track123 API key is missing. Set TRACK123_API_KEY in server/.env.');
  }

  const response = await fetch(`${TRACK123_API_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Track123-Api-Secret': apiKey,
    },
    body: method === 'GET' ? undefined : JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data?.message ||
      data?.msg ||
      data?.error ||
      data?.errors?.[0]?.message ||
      'Track123 request failed.';
    throw new Error(message);
  }

  return data;
}

function findFirstString(root, keys) {
  if (root == null) return '';
  if (Array.isArray(root)) {
    for (const item of root) {
      const result = findFirstString(item, keys);
      if (result) return result;
    }
    return '';
  }

  if (typeof root !== 'object') return '';

  for (const key of keys) {
    const value = root[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  for (const value of Object.values(root)) {
    const result = findFirstString(value, keys);
    if (result) return result;
  }

  return '';
}

function findFirstValue(root, keys) {
  if (root == null) return null;
  if (Array.isArray(root)) {
    for (const item of root) {
      const result = findFirstValue(item, keys);
      if (result != null) return result;
    }
    return null;
  }

  if (typeof root !== 'object') return null;

  for (const key of keys) {
    if (root[key] != null && root[key] !== '') {
      return root[key];
    }
  }

  for (const value of Object.values(root)) {
    const result = findFirstValue(value, keys);
    if (result != null) return result;
  }

  return null;
}

function normalizeTrackingStatus(rawStatus) {
  const normalized = String(rawStatus || '').trim().toLowerCase();
  if (!normalized) return 'Pending';

  for (const entry of TRACK123_STATUS_MAP) {
    if (entry.match.some((term) => normalized.includes(term))) {
      return entry.value;
    }
  }

  return 'Pending';
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toTitleCase(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function extractAcceptedContent(root) {
  const accepted = root?.data?.accepted;
  if (Array.isArray(accepted)) return accepted;
  if (Array.isArray(accepted?.content)) return accepted.content;
  return [];
}

function selectBestAcceptedEntry(entries) {
  if (!Array.isArray(entries) || !entries.length) return null;

  return [...entries].sort((left, right) => {
    const leftDetails = Array.isArray(left?.localLogisticsInfo?.trackingDetails) ? left.localLogisticsInfo.trackingDetails.length : 0;
    const rightDetails = Array.isArray(right?.localLogisticsInfo?.trackingDetails) ? right.localLogisticsInfo.trackingDetails.length : 0;
    if (rightDetails !== leftDetails) return rightDetails - leftDetails;

    const leftLastTime = Date.parse(left?.lastTrackingTime || left?.createTime || 0) || 0;
    const rightLastTime = Date.parse(right?.lastTrackingTime || right?.createTime || 0) || 0;
    return rightLastTime - leftLastTime;
  })[0];
}

function extractRejectedEntries(root) {
  const rejected = root?.data?.rejected;
  return Array.isArray(rejected) ? rejected : [];
}

function collectCandidateArrays(root, keys, results = []) {
  if (root == null) return results;
  if (Array.isArray(root)) {
    for (const item of root) {
      collectCandidateArrays(item, keys, results);
    }
    return results;
  }

  if (typeof root !== 'object') return results;

  for (const [key, value] of Object.entries(root)) {
    if (Array.isArray(value) && keys.includes(key)) {
      results.push(value);
    }
    collectCandidateArrays(value, keys, results);
  }

  return results;
}

function normalizeTrack123Update(entry, index) {
  if (!entry || typeof entry !== 'object') return null;

  const rawStatus =
    findFirstString(entry, [
      'transitSubStatus',
      'sub_status',
      'transitStatus',
      'status',
      'checkpoint_status',
      'trackingStatus',
      'trackStatus',
      'delivery_status',
      'event',
      'title',
    ]) || 'Update';
  const description = findFirstString(entry, [
    'eventDetail',
    'description',
    'status_description',
    'checkpoint_description',
    'details',
    'content',
    'desc',
    'message',
    'eventDescription',
  ]);
  const location = findFirstString(entry, [
    'location',
    'address',
    'country',
    'city',
    'province',
    'state',
    'area',
  ]);
  const happenedAt = toIsoOrNull(
    findFirstValue(entry, [
      'time',
      'eventTime',
      'event_time',
      'checkpointTime',
      'latestEventTime',
      'createTime',
      'nextUpdateTime',
      'created_at',
      'updated_at',
      'date',
    ])
  );

  return {
    id: `${index}-${rawStatus}-${happenedAt || 'na'}`,
    status: normalizeTrackingStatus(rawStatus) || toTitleCase(rawStatus.replace(/[_-]+/g, ' ')) || 'Update',
    description: description || rawStatus,
    location: location || '',
    happenedAt,
  };
}

function extractTrack123Updates(data) {
  const candidateArrays = collectCandidateArrays(data, [
    'checkpoints',
    'events',
    'history',
    'trackingDetails',
    'milestones',
  ]);

  const detailedEntries = candidateArrays.flatMap((array) => array);
  const entries = detailedEntries.length ? detailedEntries : extractAcceptedContent(data);

  const updates = entries
    .map((entry, index) => normalizeTrack123Update(entry, index))
    .filter((update) => update.status || update.description);

  updates.sort((left, right) => {
    const leftTime = left.happenedAt ? Date.parse(left.happenedAt) : 0;
    const rightTime = right.happenedAt ? Date.parse(right.happenedAt) : 0;
    return rightTime - leftTime;
  });

  const seen = new Set();
  return updates.filter((update) => {
    const key = `${update.status}|${update.description}|${update.location}|${update.happenedAt || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeTrack123Tracking(data, fallback = {}) {
  const acceptedContent = extractAcceptedContent(data);
  const primaryAccepted = selectBestAcceptedEntry(acceptedContent);
  const trackingId = findFirstString(primaryAccepted || data, ['id', 'trackingId', 'trackId']);
  const trackingNumber =
    findFirstString(primaryAccepted || data, ['trackNo', 'trackingNumber', 'tracking_number', 'number']) ||
    String(fallback.trackingNumber || '').trim();
  const courierCode =
    findFirstString(primaryAccepted || data, ['courierCode', 'courier_code', 'carrierCode', 'carrier_code']) ||
    findFirstString(primaryAccepted?.localLogisticsInfo || {}, ['courierCode']) ||
    String(fallback.courierCode || '').trim();
  const rawStatus = findFirstString(data, [
    'status',
    'trackStatus',
    'trackingStatus',
    'delivery_status',
    'latest_status',
    'checkpoint_status',
    'statusDescription',
    'status_description',
  ]) || findFirstString(primaryAccepted || {}, ['trackingStatus', 'transitStatus']);
  const checkpointTime = findFirstValue(data, [
    'checkpointTime',
    'latestEventTime',
    'latest_event_time',
    'time',
    'eventTime',
    'event_time',
    'updateTime',
    'updated_at',
  ]) || findFirstValue(primaryAccepted || {}, ['createTime', 'nextUpdateTime']);

  return {
    trackingId,
    trackingNumber,
    courierCode,
    rawStatus: rawStatus || '',
    trackingStatus: normalizeTrackingStatus(rawStatus),
    checkpointTime: toIsoOrNull(checkpointTime),
    raw: data,
  };
}

export async function registerTrack123Tracking({ trackingNumber, courierCode }) {
  const payload = [
    {
      trackNo: trackingNumber,
      ...(courierCode ? { courierCode } : {}),
    },
  ];

  const data = await requestTrack123('/tk/v2.1/track/import', payload);
  const rejected = extractRejectedEntries(data);
  const unsupportedCourier = rejected.find((entry) =>
    String(entry?.error?.msg || '').toLowerCase().includes('unsupported logistics supplier code')
  );

  if (unsupportedCourier && courierCode) {
    return registerTrack123Tracking({ trackingNumber, courierCode: '' });
  }

  return normalizeTrack123Tracking(data, { trackingNumber, courierCode });
}

export async function queryTrack123Tracking({ trackingNumber, courierCode }) {
  const primaryPayload = {
    trackNos: [trackingNumber],
    ...(courierCode ? { courierCode } : {}),
  };

  try {
    const data = await requestTrack123('/tk/v2.1/track/query', primaryPayload);
    return normalizeTrack123Tracking(data, { trackingNumber, courierCode });
  } catch {
    const fallbackPayload = [
      {
        trackNo: trackingNumber,
        ...(courierCode ? { courierCode } : {}),
      },
    ];
    const data = await requestTrack123('/tk/v2.1/track/query', fallbackPayload);
    return normalizeTrack123Tracking(data, { trackingNumber, courierCode });
  }
}

export async function queryTrack123TrackingDetails({ trackingNumber, courierCode }) {
  const registered = await registerTrack123Tracking({ trackingNumber, courierCode });
  const tracking = await queryTrack123Tracking({
    trackingNumber: registered.trackingNumber || trackingNumber,
    courierCode: registered.courierCode || courierCode,
  });
  return {
    ...tracking,
    courierCode: tracking.courierCode || registered.courierCode || courierCode || '',
    updates: extractTrack123Updates(tracking.raw),
  };
}

export async function syncTrack123Tracking({ trackingNumber, courierCode }) {
  const registerResult = await registerTrack123Tracking({ trackingNumber, courierCode });
  const queryResult = await queryTrack123Tracking({
    trackingNumber: registerResult.trackingNumber || trackingNumber,
    courierCode: registerResult.courierCode || courierCode,
  });

  return {
    trackingId: queryResult.trackingId || registerResult.trackingId,
    trackingNumber: queryResult.trackingNumber || registerResult.trackingNumber || trackingNumber,
    courierCode: queryResult.courierCode || registerResult.courierCode || courierCode || '',
    rawStatus: queryResult.rawStatus || registerResult.rawStatus || '',
    trackingStatus: queryResult.trackingStatus || registerResult.trackingStatus || 'Pending',
    checkpointTime: queryResult.checkpointTime || registerResult.checkpointTime,
    raw: queryResult.raw || registerResult.raw,
  };
}

export function extractTrack123WebhookUpdate(payload) {
  const tracking = normalizeTrack123Tracking(payload);
  if (!tracking.trackingNumber) {
    return null;
  }

  return tracking;
}
