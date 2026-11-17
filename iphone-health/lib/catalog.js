// The list of checks shown in the app. Pure data so it can be tested in Node.

export const GROUPS = {
  hardware: {
    title: 'Hardware tests',
    note: 'Run these right here. Most take under a minute.',
  },
  settings: {
    title: 'Check on your iPhone',
    note: 'Things a web page can’t measure. Each one shows you where to look.',
  },
};

export const TESTS = [
  {
    id: 'display',
    group: 'hardware',
    icon: 'display',
    title: 'Display',
    blurb: 'Dead pixels, tint and burn-in',
    items: [
      { id: 'pixels', label: 'No dead or stuck pixels', short: 'Pixels', hint: 'Tiny dots that stay black, white or one colour on every screen.' },
      { id: 'uniform', label: 'Even colour with no blotches or lines', short: 'Uniformity', hint: 'Watch for yellow or pink areas, dark patches, or lines across the screen.' },
      { id: 'burnin', label: 'No burn-in or ghost images', short: 'Burn-in', hint: 'Faint outlines of the keyboard or status bar, most visible on the grey screens.' },
    ],
  },
  {
    id: 'touch',
    group: 'hardware',
    icon: 'touch',
    title: 'Touchscreen',
    blurb: 'Find dead zones by painting the screen',
    items: [
      { id: 'coverage', label: 'Every part of the screen responds', short: 'Dead zones', hint: 'Fills in automatically when every square has been painted.' },
    ],
  },
  {
    id: 'multitouch',
    group: 'hardware',
    icon: 'multitouch',
    title: 'Multi-touch',
    blurb: 'Five fingers at once',
    items: [
      { id: 'fingers', label: 'Tracks five fingers at once', short: 'Multi-touch', hint: 'Fills in automatically when five touches are seen together.' },
    ],
  },
  {
    id: 'speakers',
    group: 'hardware',
    icon: 'speaker',
    title: 'Speakers',
    blurb: 'Left, right and a frequency sweep',
    items: [
      { id: 'left', label: 'Left side plays clearly', short: 'Left speaker' },
      { id: 'right', label: 'Right side plays clearly', short: 'Right speaker' },
      { id: 'sweep', label: 'No buzzing or rattling during the sweep', short: 'Distortion' },
    ],
  },
  {
    id: 'microphone',
    group: 'hardware',
    icon: 'mic',
    title: 'Microphone',
    blurb: 'Level meter and record-playback',
    items: [
      { id: 'level', label: 'Meter reacts to your voice', short: 'Mic level', hint: 'Fills in automatically when your voice is picked up.' },
      { id: 'playback', label: 'Your recording sounds clear', short: 'Recording quality', hint: 'Muffled or crackly audio can mean a blocked or damaged microphone.' },
    ],
  },
  {
    id: 'cameras',
    group: 'hardware',
    icon: 'camera',
    title: 'Cameras & flash',
    blurb: 'Every lens Safari can open',
    items: [
      { id: 'back', label: 'Back camera is sharp and clean', short: 'Back camera', hint: 'No blur, dark spots or dust behind the lens. Try focusing on something close.' },
      { id: 'front', label: 'Front camera is sharp and clean', short: 'Front camera' },
      { id: 'lenses', label: 'Ultra Wide and Telephoto lenses work', short: 'Extra lenses', hint: 'Pick them from the lens list. Choose N/A if your model has one back camera.', na: true },
      { id: 'flash', label: 'Flashlight turns on', short: 'Flash', hint: 'Use the flash button here, or the flashlight in Control Center.', na: true },
    ],
  },
  {
    id: 'motion',
    group: 'hardware',
    icon: 'motion',
    title: 'Motion sensors',
    blurb: 'Accelerometer, gyroscope and compass',
    items: [
      { id: 'accel', label: 'Accelerometer', short: 'Accelerometer', hint: 'Senses gravity and tilt.' },
      { id: 'gyro', label: 'Gyroscope', short: 'Gyroscope', hint: 'Senses rotation. Give the phone a quick twist.' },
      { id: 'compass', label: 'Compass', short: 'Compass', hint: 'Turn around slowly; the heading should follow.' },
    ],
  },
  {
    id: 'haptics',
    group: 'hardware',
    icon: 'haptics',
    title: 'Haptics',
    blurb: 'Taptic Engine feedback',
    items: [
      { id: 'tap', label: 'You feel a tap when you flip the switch', short: 'Haptics' },
    ],
  },
  {
    id: 'location',
    group: 'hardware',
    icon: 'location',
    title: 'Location',
    blurb: 'GPS fix and accuracy',
    items: [
      { id: 'fix', label: 'Finds an accurate location', short: 'Location', hint: 'Fills in automatically at ±50 m or better. Indoors it can take longer.' },
    ],
  },
  {
    id: 'performance',
    group: 'hardware',
    icon: 'performance',
    title: 'Performance',
    blurb: 'Processor speed and smoothness',
    auto: true,
  },
  {
    id: 'network',
    group: 'hardware',
    icon: 'network',
    title: 'Connection',
    blurb: 'Online status and response time',
    auto: true,
  },
  {
    id: 'battery',
    group: 'settings',
    icon: 'battery',
    title: 'Battery health',
    blurb: 'Maximum capacity and cycle count',
    custom: true,
  },
  {
    id: 'buttons',
    group: 'settings',
    icon: 'buttons',
    title: 'Buttons & switches',
    blurb: 'Volume, side, Action and Camera Control',
    intro: 'Press each button and watch for the on-screen response.',
    items: [
      { id: 'volup', label: 'Volume up raises the volume', short: 'Volume up', hint: 'A volume bar appears at the side of the screen.' },
      { id: 'voldown', label: 'Volume down lowers it', short: 'Volume down' },
      { id: 'side', label: 'Side button locks and wakes the screen', short: 'Side button' },
      { id: 'action', label: 'Ring/Silent switch or Action button works', short: 'Action button', hint: 'Toggle Silent mode: a banner appears and you feel a buzz.' },
      { id: 'cameracontrol', label: 'Camera Control opens the Camera', short: 'Camera Control', hint: 'iPhone 16 and later. Choose N/A on older models.', na: true },
    ],
  },
  {
    id: 'faceid',
    group: 'settings',
    icon: 'faceid',
    title: 'Face ID & light sensor',
    blurb: 'Unlocking and auto-brightness',
    intro: 'Lock your iPhone, then pick it up and unlock it.',
    items: [
      { id: 'unlock', label: 'Face ID or Touch ID unlocks the phone', short: 'Face ID', hint: 'If Settings › Face ID & Passcode shows an error or won’t set up, it needs service.' },
      { id: 'light', label: 'Brightness adapts to the light around you', short: 'Light sensor', hint: 'With Auto-Brightness on (Settings › Accessibility › Display & Text Size), cover the top of the screen for a few seconds. It should dim.' },
    ],
  },
  {
    id: 'calls',
    group: 'settings',
    icon: 'calls',
    title: 'Calls & earpiece',
    blurb: 'Earpiece, voice and proximity sensor',
    intro: 'Make a short call to a friend or your voicemail.',
    items: [
      { id: 'earpiece', label: 'You hear the caller clearly through the earpiece', short: 'Earpiece' },
      { id: 'voice', label: 'The other person hears you clearly', short: 'Call microphone' },
      { id: 'proximity', label: 'Screen turns off when the phone is at your ear', short: 'Proximity sensor', hint: 'This checks the proximity sensor.' },
    ],
  },
  {
    id: 'charging',
    group: 'settings',
    icon: 'charging',
    title: 'Charging',
    blurb: 'Cable and wireless charging',
    intro: 'Plug in your charger and watch the battery icon.',
    items: [
      { id: 'cable', label: 'Charges with a cable', short: 'Cable charging', hint: 'A lightning bolt appears on the battery icon. If the plug feels loose, the port may need cleaning.' },
      { id: 'wireless', label: 'Charges on MagSafe or a Qi charger', short: 'Wireless charging', na: true },
      { id: 'heat', label: 'Stays warm, not hot, while charging', short: 'Heat' },
    ],
  },
  {
    id: 'wireless',
    group: 'settings',
    icon: 'wireless',
    title: 'Wi-Fi, Bluetooth & cellular',
    blurb: 'Radios and signal',
    intro: 'Use each connection for a moment.',
    items: [
      { id: 'wifi', label: 'Wi-Fi connects and stays connected', short: 'Wi-Fi' },
      { id: 'bluetooth', label: 'Bluetooth pairs with headphones, a watch or a car', short: 'Bluetooth', na: true },
      { id: 'cellular', label: 'Mobile signal, calls and data work', short: 'Cellular', hint: 'Turn Wi-Fi off briefly to test mobile data.', na: true },
    ],
  },
  {
    id: 'service',
    group: 'settings',
    icon: 'service',
    title: 'Parts & service history',
    blurb: 'Genuine parts and past repairs',
    intro: 'Open Settings › General › About.',
    items: [
      { id: 'parts', label: 'No “Unknown Part” messages', short: 'Parts', hint: 'If a Parts and Service History section appears, each part should say Genuine Apple Part.' },
      { id: 'serial', label: 'Serial number matches the box or receipt', short: 'Serial number', hint: 'Handy when buying second-hand. Check warranty at checkcoverage.apple.com.', na: true },
    ],
  },
  {
    id: 'software',
    group: 'settings',
    icon: 'software',
    title: 'Software & storage',
    blurb: 'Updates, free space and stability',
    intro: 'A few quick checks in Settings › General.',
    items: [
      { id: 'update', label: 'iOS is up to date', short: 'Software update', hint: 'Settings › General › Software Update.' },
      { id: 'storage', label: 'Several GB of storage are free', short: 'Storage', hint: 'Settings › General › iPhone Storage. A nearly full iPhone can feel slow.' },
      { id: 'stable', label: 'No random restarts or freezing', short: 'Stability', hint: 'Unexpected restarts can point to a battery or hardware fault.' },
    ],
  },
];

export function getTest(id) {
  return TESTS.find((test) => test.id === id) || null;
}

export function testsInGroup(group) {
  return TESTS.filter((test) => test.group === group);
}
