// levels.js — levels are pure DATA. The Level class turns this into meshes and colliders.
// Units: metres-ish. The robot is 1.6 tall, runs 6.5/s and jumps ~1.7 high (~4.5 far).
// `at` = [x, topY, z] (the walkable top surface). Progress mostly heads towards -Z.

export const LEVELS = [
  // #region meadow
  {
    id: 'meadow',
    name: 'Meadow Hop',
    tagline: 'Hop between islands and grab every energy core.',
    sky: 'day',
    spawn: [0, 0, 2],
    facing: Math.PI,
    islands: [
      { at: [0, 0, 0], r: 5.5, trees: [[-3.4, 2.2, 1.1], [3.7, 1.4, 0.9], [2.2, 3.9, 1]] },
      { at: [0, 0.5, -11.5], r: 3.4 },
      { at: [6.5, 1.2, -17], r: 3, trees: [[1.6, -1.2, 0.8]] },
      { at: [1.5, 1.0, -27.5], r: 6, trees: [[-3.8, 1.8, 1.2], [4.2, 2.4, 1], [-2.4, -4.3, 0.9]] },
      { at: [-1, 1.6, -40], r: 4.2, trees: [[3, 1.8, 1]] },
    ],
    blocks: [
      { at: [8.8, 2.2, -29], size: [2.4, 2.4, 1.2] },
      { at: [11.6, 3.3, -26.2], size: [2.2, 2.2, 1.2] },
    ],
    movers: [],
    crumbles: [],
    pads: [],
    cores: [
      [0, 1.5, -11.5],
      [3.3, 2.4, -14.3],
      [6.5, 2.2, -17],
      [3.8, 2.0, -29.8],
      [-2.6, 2.0, -25],
      [11.6, 4.3, -26.2],
    ],
    enemies: [
      { y: 1.0, path: [[-1.5, -29], [5, -28]], speed: 1.5, chaseSpeed: 3.0, sight: 4.8 },
    ],
    portal: { at: [-1, 1.6, -41.6], yaw: 0 },
  },
  // #endregion

  {
    id: 'driftways',
    name: 'Drift Ways',
    tagline: 'Ride moving platforms. Some blocks will not wait for you.',
    sky: 'golden',
    spawn: [0, 0, 1.5],
    facing: Math.PI,
    islands: [
      { at: [0, 0, 0], r: 4.5, trees: [[-2.8, 2, 1], [2.9, 1.8, 0.9]] },
      { at: [0, 0.4, -16.5], r: 3.2 },
      { at: [-8, 4.2, -33.5], r: 5, trees: [[-3, -2.8, 1], [3.4, 1.6, 0.9]] },
      { at: [-8, 4.6, -52], r: 4, trees: [[2.6, 2, 0.9]] },
    ],
    blocks: [
      { at: [7, 5.6, -21.8], size: [3, 3, 1] },
    ],
    movers: [
      { at: [0, 0, -9], size: [3, 3, 0.6], axis: 'x', amp: 3, speed: 0.9 },
      { at: [7, 2.6, -16.5], size: [2.6, 2.6, 0.6], axis: 'y', amp: 2.2, speed: 0.8, phase: -1.57 },
      { at: [-8, 4.2, -43], size: [3, 3, 0.6], axis: 'z', amp: 2, speed: 0.8 },
    ],
    crumbles: [
      { at: [3, 5.6, -24.5], size: [2, 2, 0.6] },
      { at: [-0.8, 5.6, -26.5], size: [2, 2, 0.6] },
      { at: [-4.6, 5.8, -25], size: [2, 2, 0.6] },
    ],
    pads: [],
    cores: [
      [0, 1.3, -9],
      [0, 1.4, -16.5],
      [7, 6.1, -16.5],
      [7, 6.6, -21.8],
      [-2.7, 7.0, -26],
      [-10.5, 5.2, -31],
      [-5.5, 5.2, -36],
      [-8, 5.6, -49.5],
    ],
    enemies: [
      { y: 4.2, path: [[-11, -33.5], [-5, -34]], speed: 2, chaseSpeed: 3.6 },
      { y: 4.6, path: [[-10.5, -51.2], [-5.5, -51.2]], speed: 1.8, chaseSpeed: 3.4, sight: 4.5 },
    ],
    portal: { at: [-8, 4.6, -54], yaw: 0 },
  },

  {
    id: 'spire',
    name: 'Storm Spire',
    tagline: 'Jump pads, crumbling bridges and angry drones. Climb!',
    sky: 'dusk',
    spawn: [0, 0, 3],
    facing: Math.PI,
    islands: [
      { at: [0, 0, 0], r: 5, trees: [[-3, 2.4, 1.1], [3.2, 2.2, 1]] },
      { at: [0, 4.5, -11], r: 3.2 },
      { at: [12, 5.8, -24.5], r: 3.6, trees: [[2, -1.8, 0.8]] },
      { at: [0, 10, -31], r: 3.4 },
      { at: [-3, 15, -41], r: 3.8, trees: [[-2.4, 1.6, 0.8]] },
      { at: [-3, 15.8, -56.5], r: 4, trees: [[2.6, 1.6, 0.9]] },
    ],
    blocks: [],
    movers: [
      { at: [5.5, 7.6, -27], size: [2.6, 2.6, 0.6], axis: 'y', amp: 1.8, speed: 0.75, phase: -1.57 },
      { at: [-3, 15, -48.8], size: [2.8, 2.8, 0.6], axis: 'x', amp: 3.5, speed: 1.1 },
    ],
    crumbles: [
      { at: [5.2, 4.5, -12], size: [2, 2, 0.6] },
      { at: [8.6, 4.9, -14], size: [2, 2, 0.6] },
      { at: [11.4, 5.4, -17], size: [2, 2, 0.6] },
    ],
    pads: [
      { at: [0, 0, -3] },
      { at: [0, 10, -33.6] },
    ],
    cores: [
      [0, 4.2, -5.8],
      [0, 5.5, -11],
      [10, 6.6, -15.5],
      [13.5, 6.8, -22.5],
      [5.5, 10.8, -27],
      [-1.6, 11, -29.6],
      [-1.5, 15.4, -37],
      [-4.5, 16, -40],
      [-3, 16.2, -48.8],
      [-1, 16.8, -55],
    ],
    enemies: [
      { y: 5.8, path: [[10, -23.5], [14, -26]], speed: 2.1, chaseSpeed: 4.0 },
      { y: 10, path: [[-2, -30], [2, -32]], speed: 2.0, chaseSpeed: 4.2, sight: 4.5, leash: 3 },
      { y: 15, path: [[-5, -39.5], [-1, -42.5]], speed: 2.2, chaseSpeed: 4.4, leash: 3.2 },
      { y: 15.8, path: [[-5.5, -56.2], [-0.5, -56.2]], speed: 2.4, chaseSpeed: 4.4, sight: 4.5, leash: 3.5 },
    ],
    portal: { at: [-3, 15.8, -59], yaw: 0 },
  },
];
