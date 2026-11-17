import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUserAgent, identifyModel, describeDevice, batteryEra, supportsSwitchHaptics, compactModelList } from '../lib/device.js';

const SAFARI_26 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1';
const SAFARI_17 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.96 Mobile/15E148 Safari/604.1';
const INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0.0 (iPhone17,1; iOS 26_1)';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

test('Safari 26 reports the real iOS version despite the frozen 18_6 token', () => {
  const parsed = parseUserAgent(SAFARI_26);
  assert.equal(parsed.kind, 'iphone');
  assert.equal(parsed.browser, 'Safari');
  assert.equal(parsed.os.version, '26.1');
  assert.equal(parsed.os.major, 26);
  assert.equal(parsed.os.orLater, false);
});

test('older Safari reads the OS token directly', () => {
  const parsed = parseUserAgent(SAFARI_17);
  assert.equal(parsed.os.version, '17.5.1');
  assert.equal(parsed.os.major, 17);
});

test('third-party browsers with the frozen token are reported as 18.6 or later', () => {
  const parsed = parseUserAgent(CHROME_IOS);
  assert.equal(parsed.browser, 'Chrome');
  assert.equal(parsed.inApp, false);
  assert.equal(parsed.os.version, '18.6');
  assert.equal(parsed.os.orLater, true);
  assert.equal(describeDevice({ ua: CHROME_IOS, screenWidth: 402, screenHeight: 874, dpr: 3 }).osLabel, 'iOS 18.6 or later');
});

test('in-app browsers are flagged', () => {
  const parsed = parseUserAgent(INSTAGRAM);
  assert.equal(parsed.browser, 'Instagram');
  assert.equal(parsed.inApp, true);
});

test('iPad in desktop mode is detected from touch points', () => {
  assert.equal(parseUserAgent(IPAD, 5).kind, 'ipad');
  assert.equal(parseUserAgent(IPAD, 5).os.name, 'iPadOS');
  assert.equal(parseUserAgent(IPAD, 0).kind, 'mac');
});

test('Android is not treated as iOS', () => {
  const parsed = parseUserAgent(ANDROID);
  assert.equal(parsed.kind, 'android');
  assert.equal(parsed.isIOS, false);
  assert.equal(parsed.os.version, '15');
});

test('models are estimated from screen points and pixel ratio', () => {
  const pro = identifyModel(402, 874, 3);
  assert.ok(pro.models.includes('iPhone 17 Pro'));
  assert.equal(pro.era, 'new');
  assert.match(pro.label, /^iPhone 16 Pro, 17, 17 Pro or 18 Pro$/);

  const xr = identifyModel(896, 414, 2);
  assert.deepEqual(xr.models, ['iPhone XR', 'iPhone 11']);
  assert.equal(xr.era, 'old');

  const air = identifyModel(420, 912, 3);
  assert.equal(air.label, 'iPhone Air');
  assert.equal(air.exact, true);
  assert.equal(air.era, 'new');

  const mixed = identifyModel(390, 844, 3);
  assert.equal(mixed.era, 'mixed');

  const unknown = identifyModel(500, 1000, 3);
  assert.equal(unknown.models.length, 0);
  assert.equal(unknown.era, null);
  assert.match(unknown.note, /Settings › General › About/);
});

test('mini screens mention the Display Zoom ambiguity', () => {
  const mini = identifyModel(375, 812, 3);
  assert.match(mini.note, /Display Zoom/);
  assert.equal(mini.exact, false);
});

test('battery era classifies models', () => {
  assert.equal(batteryEra(['iPhone 15', 'iPhone 16']), 'new');
  assert.equal(batteryEra(['iPhone 13', 'iPhone 14']), 'old');
  assert.equal(batteryEra(['iPhone 14', 'iPhone 16e']), 'mixed');
  assert.equal(batteryEra([]), null);
});

test('compactModelList shortens repeated prefixes', () => {
  assert.equal(compactModelList(['iPhone 15', 'iPhone 15 Pro', 'iPhone 16']), 'iPhone 15, 15 Pro or 16');
  assert.equal(compactModelList(['iPhone Air']), 'iPhone Air');
});

test('describeDevice builds readable labels', () => {
  const device = describeDevice({ ua: SAFARI_26, screenWidth: 440, screenHeight: 956, dpr: 3, p3: true, hdr: true, maxTouchPoints: 5 });
  assert.equal(device.kindLabel, 'iPhone');
  assert.equal(device.osLabel, 'iOS 26.1');
  assert.equal(device.browserLabel, 'Safari 26.1');
  assert.equal(device.screenLabel, '440 × 956 pt at 3× (1320 × 2868 px)');
  assert.equal(device.colourLabel, 'Wide colour (Display P3) · HDR');
  assert.ok(device.model.models.includes('iPhone 17 Pro Max'));
});

test('switch haptics need iOS 18 or later', () => {
  assert.equal(supportsSwitchHaptics(describeDevice({ ua: SAFARI_26 })), true);
  assert.equal(supportsSwitchHaptics(describeDevice({ ua: SAFARI_17 })), false);
  assert.equal(supportsSwitchHaptics(describeDevice({ ua: ANDROID })), false);
});
