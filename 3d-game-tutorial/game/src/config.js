// config.js — every gameplay number in one place. Tweak, reload, feel the difference.

export const PLAYER = {
  speed: 6.5,          // top run speed (units / second)
  accel: 14,           // ground acceleration (higher = snappier)
  airAccel: 7,         // air steering
  // #region jump-tuning
  jumpSpeed: 9.4,      // take-off velocity
  gravity: 26,         // units / second²
  lowJumpGravity: 2.3, // gravity multiplier while rising with the button released
  maxFall: 32,
  coyoteTime: 0.12,
  jumpBuffer: 0.14,
  // #endregion
  radius: 0.4,
  height: 1.6,
};

export const RULES = {
  hearts: 3,
  invulnerable: 1.6,   // seconds of mercy after getting hurt
  stun: 0.35,          // seconds without control after a hit
  knockback: 7.5,
  stompBounce: 10.5,
  padPower: 17,
  crumbleDelay: 0.55,  // seconds a crumbling block shakes before it falls
  crumbleRespawn: 3.5,
};

export const CAMERA = {
  distance: 7.5,
  pitch: 0.36,
  minPitch: 0.02,
  maxPitch: 1.2,
  sensitivity: 0.0065,
  smoothing: 8,
  fov: 55,
};

export const QUALITY = {
  high: { pixelRatio: 2, bloom: true, shadowMap: 2048 },
  low: { pixelRatio: 1, bloom: false, shadowMap: 1024 },
};
