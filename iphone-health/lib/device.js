// Device and browser description from information Safari exposes to web pages.
// Safari does not reveal the exact iPhone model, so the model is estimated from
// the screen size in points and the pixel ratio. Display Zoom changes those values.

const MODEL_TABLE = [
  { w: 320, h: 480, dpr: 2, models: ['iPhone 4', 'iPhone 4s'] },
  { w: 320, h: 568, dpr: 2, models: ['iPhone 5', 'iPhone 5s', 'iPhone 5c', 'iPhone SE (1st gen)'], zoomed: 'a 4.7-inch iPhone with Display Zoom' },
  { w: 375, h: 667, dpr: 2, models: ['iPhone 6', 'iPhone 6s', 'iPhone 7', 'iPhone 8', 'iPhone SE (2nd gen)', 'iPhone SE (3rd gen)'] },
  { w: 375, h: 667, dpr: 3, models: [], zoomed: 'an iPhone 6, 6s, 7 or 8 Plus with Display Zoom' },
  { w: 414, h: 736, dpr: 3, models: ['iPhone 6 Plus', 'iPhone 6s Plus', 'iPhone 7 Plus', 'iPhone 8 Plus'] },
  { w: 375, h: 812, dpr: 3, models: ['iPhone X', 'iPhone XS', 'iPhone 11 Pro', 'iPhone 12 mini', 'iPhone 13 mini'], zoomed: 'a larger model with Display Zoom' },
  { w: 414, h: 896, dpr: 2, models: ['iPhone XR', 'iPhone 11'] },
  { w: 414, h: 896, dpr: 3, models: ['iPhone XS Max', 'iPhone 11 Pro Max'] },
  { w: 390, h: 844, dpr: 3, models: ['iPhone 12', 'iPhone 12 Pro', 'iPhone 13', 'iPhone 13 Pro', 'iPhone 14', 'iPhone 16e', 'iPhone 17e'] },
  { w: 428, h: 926, dpr: 3, models: ['iPhone 12 Pro Max', 'iPhone 13 Pro Max', 'iPhone 14 Plus'] },
  { w: 393, h: 852, dpr: 3, models: ['iPhone 14 Pro', 'iPhone 15', 'iPhone 15 Pro', 'iPhone 16'] },
  { w: 430, h: 932, dpr: 3, models: ['iPhone 14 Pro Max', 'iPhone 15 Plus', 'iPhone 15 Pro Max', 'iPhone 16 Plus'] },
  { w: 402, h: 874, dpr: 3, models: ['iPhone 16 Pro', 'iPhone 17', 'iPhone 17 Pro', 'iPhone 18 Pro'] },
  { w: 420, h: 912, dpr: 3, models: ['iPhone Air'] },
  { w: 440, h: 956, dpr: 3, models: ['iPhone 16 Pro Max', 'iPhone 17 Pro Max', 'iPhone 18 Pro Max'] },
  { w: 466, h: 678, dpr: 3, models: ['iPhone Duo (outer screen)'] },
  { w: 626, h: 890, dpr: 3, models: ['iPhone Duo (inner screen)'] },
  { w: 320, h: 693, dpr: 3, models: [], zoomed: 'a 5.4- to 6.3-inch model with Display Zoom' },
];

const IN_APP = [
  ['Facebook', /FBAN|FBAV/],
  ['Instagram', /Instagram/],
  ['LINE', /\bLine\//],
  ['WeChat', /MicroMessenger/],
];

const BROWSER_RULES = [
  ['Chrome', /CriOS\/([\d.]+)/],
  ['Firefox', /FxiOS\/([\d.]+)/],
  ['Edge', /EdgiOS\/([\d.]+)/],
  ['Opera', /OPiOS\/([\d.]+)|OPT\/([\d.]+)/],
  ['DuckDuckGo', /Ddg\/([\d.]+)/],
  ['Google app', /GSA\/([\d.]+)/],
  ['Edge', /Edg(?:e|A)?\/([\d.]+)/],
  ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
  ['Firefox', /Firefox\/([\d.]+)/],
  ['Chrome', /Chrome\/([\d.]+)/],
];

function trimVersion(parts) {
  const clean = parts.filter((part) => part !== undefined && part !== null && part !== '').map(Number);
  while (clean.length > 2 && clean[clean.length - 1] === 0) clean.pop();
  if (clean.length === 1) clean.push(0);
  return clean.join('.');
}

export function shortVersion(version) {
  if (!version) return '';
  const [major, minor] = String(version).split('.');
  return minor && minor !== '0' ? `${major}.${minor}` : major;
}

export function parseUserAgent(ua = '', maxTouchPoints = 0) {
  const isIPhone = /\biPhone\b/.test(ua);
  const isIPod = /\biPod\b/.test(ua);
  const isIPad = /\biPad\b/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  let kind = 'other';
  if (isIPhone) kind = 'iphone';
  else if (isIPad) kind = 'ipad';
  else if (isIPod) kind = 'ipod';
  else if (isAndroid) kind = 'android';
  else if (/Macintosh/.test(ua)) kind = 'mac';
  else if (/Windows/.test(ua)) kind = 'windows';
  const isIOS = isIPhone || isIPad || isIPod;

  let browser = null;
  let browserVersion = null;
  let inApp = false;
  for (const [name, pattern] of IN_APP) {
    if (pattern.test(ua)) { browser = name; inApp = true; break; }
  }
  if (!browser) {
    for (const [name, pattern] of BROWSER_RULES) {
      const match = ua.match(pattern);
      if (match) { browser = name; browserVersion = match[1] || match[2] || null; break; }
    }
  }
  if (!browser) {
    const safari = ua.match(/Version\/([\d.]+).*Safari\//);
    if (safari) { browser = 'Safari'; browserVersion = safari[1]; }
    else if (isIOS) { browser = 'In-app browser'; inApp = true; }
    else browser = 'Browser';
  }

  let os = null;
  if (isIOS) {
    const reported = ua.match(/OS (\d+)[_.](\d+)(?:[_.](\d+))? like Mac OS X/);
    const safari = browser === 'Safari' ? ua.match(/Version\/(\d+)(?:\.(\d+))?(?:\.(\d+))?/) : null;
    const name = isIPad ? 'iPadOS' : 'iOS';
    if (safari && Number(safari[1]) >= 26) {
      // Since iOS 26, Safari freezes the reported OS at 18.6, but Safari's own version tracks the OS.
      os = { name, version: trimVersion([safari[1], safari[2], safari[3]]), major: Number(safari[1]), orLater: false };
    } else if (reported) {
      const major = Number(reported[1]);
      const minor = Number(reported[2]);
      const frozen = major === 18 && minor === 6 && browser !== 'Safari';
      os = { name, version: trimVersion([reported[1], reported[2], reported[3]]), major, orLater: frozen };
    } else if (safari) {
      os = { name, version: trimVersion([safari[1], safari[2], safari[3]]), major: Number(safari[1]), orLater: false };
    } else {
      os = { name, version: null, major: null, orLater: false };
    }
  } else if (isAndroid) {
    const match = ua.match(/Android (\d+(?:\.\d+)?)/);
    os = { name: 'Android', version: match ? match[1] : null, major: match ? Number.parseInt(match[1], 10) : null, orLater: false };
  } else if (kind === 'mac') {
    os = { name: 'macOS', version: null, major: null, orLater: false };
  } else if (kind === 'windows') {
    os = { name: 'Windows', version: null, major: null, orLater: false };
  }

  return { kind, isIOS, browser, browserVersion, inApp, os };
}

export function compactModelList(models) {
  if (!models.length) return '';
  const [first, ...rest] = models;
  const all = [first, ...rest.map((name) => name.replace(/^iPhone /, ''))];
  if (all.length === 1) return all[0];
  return `${all.slice(0, -1).join(', ')} or ${all[all.length - 1]}`;
}

export function isRecentBatteryModel(name) {
  if (/\bAir\b|\bDuo\b/.test(name)) return true;
  const match = name.match(/iPhone (\d+)/);
  return Boolean(match) && Number(match[1]) >= 15;
}

// 'new' = iPhone 15 and later (rated 80% at 1000 cycles), 'old' = iPhone 14 and earlier (500 cycles).
export function batteryEra(models) {
  if (!models || !models.length) return null;
  const recent = models.map(isRecentBatteryModel);
  if (recent.every(Boolean)) return 'new';
  if (!recent.some(Boolean)) return 'old';
  return 'mixed';
}

export function identifyModel(width, height, dpr) {
  const short = Math.round(Math.min(width, height));
  const long = Math.round(Math.max(width, height));
  const ratio = Math.round(dpr);
  const entry = MODEL_TABLE.find((row) => Math.abs(row.w - short) <= 1 && Math.abs(row.h - long) <= 2 && row.dpr === ratio);
  if (!entry) {
    return {
      label: 'iPhone',
      models: [],
      zoomed: null,
      exact: false,
      era: null,
      note: 'Screen size not recognised (Display Zoom or a newer model). Settings › General › About shows your model.',
    };
  }
  const label = entry.models.length ? compactModelList(entry.models) : `Likely ${entry.zoomed}`;
  const notes = ['Estimated from screen size, because Safari doesn’t share the exact model. Settings › General › About shows it.'];
  if (entry.models.length && entry.zoomed) notes.push(`It could also be ${entry.zoomed}.`);
  return {
    label,
    models: entry.models.slice(),
    zoomed: entry.zoomed || null,
    exact: entry.models.length === 1 && !entry.zoomed,
    era: batteryEra(entry.models),
    note: notes.join(' '),
  };
}

const KIND_LABELS = {
  iphone: 'iPhone',
  ipad: 'iPad',
  ipod: 'iPod touch',
  android: 'Android device',
  mac: 'Mac',
  windows: 'Windows PC',
  other: 'Unknown device',
};

export function describeDevice(env = {}) {
  const parsed = parseUserAgent(env.ua || '', env.maxTouchPoints || 0);
  const width = Math.round(Math.min(env.screenWidth || 0, env.screenHeight || 0));
  const height = Math.round(Math.max(env.screenWidth || 0, env.screenHeight || 0));
  const dpr = Math.round((env.dpr || 1) * 100) / 100;
  const model = parsed.kind === 'iphone' ? identifyModel(width, height, dpr) : null;
  const os = parsed.os;
  let osLabel = 'Unknown';
  if (os) osLabel = os.version ? `${os.name} ${os.version}${os.orLater ? ' or later' : ''}` : os.name;
  const browserLabel = parsed.browserVersion ? `${parsed.browser} ${shortVersion(parsed.browserVersion)}` : parsed.browser;
  const colour = [env.p3 ? 'Wide colour (Display P3)' : 'Standard colour (sRGB)'];
  if (env.hdr) colour.push('HDR');
  return {
    ...parsed,
    kindLabel: KIND_LABELS[parsed.kind] || KIND_LABELS.other,
    model,
    osLabel,
    browserLabel,
    screen: { width, height, dpr },
    screenLabel: width && height
      ? `${width} × ${height} pt at ${dpr}× (${Math.round(width * dpr)} × ${Math.round(height * dpr)} px)`
      : 'Unknown',
    colourLabel: colour.join(' · '),
    touchPoints: env.maxTouchPoints || 0,
    standalone: Boolean(env.standalone),
  };
}

// iOS 18 added haptic feedback when a person taps an <input type=checkbox switch>.
export function supportsSwitchHaptics(device, hasSwitchProperty = false) {
  if (!device || !device.isIOS) return false;
  const major = device.os && device.os.major;
  if (major && major >= 18) return true;
  return Boolean(hasSwitchProperty) && device.browser === 'Safari' && !major;
}
