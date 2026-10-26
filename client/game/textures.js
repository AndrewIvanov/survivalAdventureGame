import { WORLD } from '../../shared/config.js';
import { seeded } from '../../shared/map.js';

// Original pixel art, drawn locally. No third-party art or external requests.
function texture(scene, key, width, height, draw) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const c = canvas.getContext('2d'); c.imageSmoothingEnabled = false;
  const rect = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const poly = (points, color) => { c.fillStyle = color; c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); };
  draw(c, rect, poly);
  scene.textures.addCanvas(key, canvas);
}

export function createTextures(scene) {
  texture(scene, 'actor-shadow', 40, 16, c => { c.fillStyle = '#15261c66'; c.beginPath(); c.ellipse(20, 8, 19, 7, 0, 0, Math.PI * 2); c.fill(); });
  for (const [name, color] of [['self', '#d9c887bf'], ['ally', '#8fb6c0bf']]) texture(scene, `actor-ring-${name}`, 36, 18, c => { c.strokeStyle = color; c.lineWidth = 1; c.beginPath(); c.ellipse(18, 9, 16, 7, 0, 0, Math.PI * 2); c.stroke(); });
  for (const kind of ['arrow', 'power', 'sniper', 'magic', 'fire']) texture(scene, `shot-${kind}`, 80, 24, (c, r) => {
    const magic = kind === 'fire' || kind === 'magic', sniper = kind === 'sniper', width = sniper ? 52 : magic ? 14 : 23, height = sniper ? 10 : magic ? 8 : 3;
    r(40 - width / 2, 12 - height / 2, width, height, magic ? kind === 'fire' ? '#f0a45e' : '#b8a7ed' : '#e3d8a2');
    c.fillStyle = magic ? '#f3d8ad' : '#e4dec2'; c.beginPath(); c.arc(40 + (sniper ? 24 : magic ? 7 : 11), 12, sniper ? 9 : magic ? 5 : 3, 0, Math.PI * 2); c.fill();
  });
  for (let variant = 0; variant < 3; variant++) texture(scene, `tree-${variant}`, 88, 122, (c, r, p) => {
    const random = seeded(19 + variant);
    const palettes = [['#182e27', '#244838', '#355b40', '#497148', '#65834e'], ['#1b332b', '#294c37', '#3d6140', '#577644', '#809553'], ['#28382a', '#3b4e30', '#52663a', '#718047', '#9c9b56']];
    const col = palettes[variant];
    c.fillStyle = '#0d231c70'; c.beginPath(); c.ellipse(45, 110, 34, 9, 0, 0, Math.PI * 2); c.fill();
    r(38, 75, 13, 38, '#493e2c'); r(42, 80, 5, 31, '#6d5a37'); r(48, 98, 7, 10, '#493e2c');
    p([[44, 4], [51, 15], [57, 15], [57, 25], [68, 36], [64, 40], [78, 57], [73, 63], [85, 81], [76, 88], [79, 96], [59, 100], [48, 96], [30, 103], [14, 96], [7, 86], [14, 77], [8, 73], [24, 53], [19, 51], [32, 32], [28, 29]], col[0]);
    p([[43, 7], [54, 26], [51, 30], [67, 46], [59, 48], [75, 69], [65, 71], [75, 89], [56, 92], [47, 87], [31, 96], [13, 87], [29, 67], [20, 68], [36, 46], [29, 47]], col[1]);
    p([[43, 9], [47, 28], [43, 29], [57, 46], [45, 45], [61, 65], [48, 66], [60, 85], [37, 88], [23, 85], [37, 67], [29, 64], [41, 46], [35, 44]], col[2]);
    for (let i = 0; i < 50; i++) {
      const x = 23 + random() * 41, y = 24 + random() * 66;
      if (Math.abs(x - 43) < (y - 6) * .39) r(x, y, 3 + random() * 6, 2 + random() * 3, col[3 + (i % 5 === 0 ? 1 : 0)]);
    }
    r(38, 17, 4, 5, col[4]); r(32, 44, 7, 3, col[4]);
  });

  for (const style of ['altar', 'hall', 'forge', 'shop', 'cottage', 'sawmill']) texture(scene, `building-${style}`, 176, 172, (c, r, p) => {
    const roof = style === 'altar' ? ['#414a59', '#647586', '#a3b7bf'] : style === 'hall' ? ['#454c59', '#596879', '#74828a'] : style === 'forge' ? ['#514c43', '#6c6453', '#8a7a5c'] : ['#713e31', '#955539', '#b87648'];
    c.fillStyle = '#14291c70'; c.beginPath(); c.ellipse(88, 149, 82, 16, 0, 0, Math.PI * 2); c.fill();
    r(24, 84, 128, 62, '#a69b74'); r(25, 86, 14, 59, '#817655'); r(140, 85, 12, 62, '#71684c');
    r(20, 141, 138, 9, '#656650'); r(22, 146, 135, 5, '#879076');
    r(32, 88, 5, 56, '#574b35'); r(139, 88, 5, 58, '#574b35'); r(33, 112, 110, 5, '#796446');
    r(72, 111, 31, 36, '#493f30'); r(77, 114, 21, 31, '#73603c'); r(88, 116, 2, 28, '#4f432d'); r(92, 129, 3, 3, '#c1ad65');
    r(68, 145, 40, 5, '#b0a283'); r(64, 150, 48, 4, '#7f8066');
    for (const x of [44, 115]) { r(x - 3, 95, 24, 24, '#4c4432'); r(x, 97, 18, 16, '#d4a65b'); r(x + 8, 96, 2, 18, '#695c3e'); r(x, 104, 18, 2, '#695c3e'); r(x - 4, 116, 27, 4, '#6b5a3e'); }
    r(123, 32, 17, 40, '#777866'); r(121, 30, 22, 6, '#a09b80');
    p([[8, 88], [8, 77], [26, 61], [43, 44], [59, 29], [79, 11], [95, 11], [115, 30], [134, 48], [152, 65], [169, 80], [169, 88]], roof[0]);
    p([[15, 78], [84, 15], [92, 15], [160, 78]], roof[1]);
    for (let y = 28; y < 81; y += 9) {
      const inset = (81 - y) * 1.05;
      r(14 + inset, y, 147 - inset * 2, 2, roof[0]);
      for (let x = 18 + inset + (y % 2) * 6; x < 158 - inset; x += 14) r(x, y - 6, 2, 7, roof[2]);
    }
    p([[10, 79], [83, 10], [88, 12], [16, 83]], roof[2]); r(9, 83, 159, 7, roof[0]); r(13, 82, 150, 3, roof[2]);
    r(77, 48, 24, 25, '#513f2e'); r(81, 51, 16, 18, '#d7b76d'); r(87, 50, 3, 22, '#735638');
    if (style === 'shop') {
      r(31, 119, 116, 9, '#59673b');
      for (let x = 34; x < 145; x += 20) { r(x, 121, 10, 13, '#b3ab74'); r(x + 10, 121, 10, 13, '#647249'); }
      r(32, 132, 3, 22, '#584b32'); r(144, 132, 3, 22, '#584b32');
    }
    if (style === 'altar') {
      r(155, 94, 3, 24, '#4e5260'); r(152, 100, 18, 3, '#4e5260'); r(153, 105, 15, 16, '#738a95');
      r(159, 107, 3, 12, '#deebcc'); r(155, 111, 11, 3, '#deebcc');
      r(85, 51, 5, 18, '#e2edcb'); r(80, 57, 15, 4, '#e2edcb');
    }
    if (style === 'forge') { r(115, 119, 28, 25, '#484a42'); r(120, 128, 16, 14, '#9d5034'); r(125, 131, 7, 11, '#f0b858'); r(24, 134, 17, 10, '#484a42'); }
    if (style === 'sawmill') {
      for (const [x, y] of [[22, 142], [34, 150], [122, 145]]) { r(x, y, 35, 9, '#725536'); r(x + 2, y + 1, 5, 7, '#ceb181'); r(x + 11, y + 2, 21, 2, '#9e7949'); }
    }
    r(42, 144, 7, 5, '#526b44'); r(130, 145, 10, 5, '#526b44');
  });

  texture(scene, 'fountain', 104, 98, (c, r, p) => {
    c.fillStyle = '#14291c70'; c.beginPath(); c.ellipse(53, 82, 48, 12, 0, 0, Math.PI * 2); c.fill();
    p([[7, 56], [20, 43], [84, 43], [98, 56], [98, 76], [83, 88], [22, 88], [7, 76]], '#626d65');
    p([[8, 54], [23, 42], [81, 42], [96, 54], [96, 68], [81, 80], [23, 80], [8, 68]], '#a4ad92');
    p([[17, 55], [28, 48], [76, 48], [87, 55], [87, 65], [76, 73], [28, 73], [17, 65]], '#365c60');
    r(26, 57, 51, 7, '#4e8990'); r(23, 64, 59, 3, '#75b1a6');
    r(45, 27, 14, 38, '#71877d'); r(48, 28, 6, 35, '#b0bda3');
    p([[31, 28], [37, 21], [67, 21], [75, 28], [68, 36], [38, 36]], '#8d9f8a'); r(36, 25, 32, 4, '#b7c4a4');
    r(49, 9, 7, 17, '#8d9f8a'); r(45, 8, 15, 5, '#b1c1a7');
    r(32, 37, 3, 19, '#8cc9bb'); r(71, 36, 3, 19, '#8cc9bb'); r(50, 4, 4, 5, '#c8e1c4');
    for (let x = 25; x < 84; x += 16) r(x, 80, 2, 7, '#596b5e');
  });

  for (const appearance of ['ranger', 'sage']) for (let frame = 0; frame < 3; frame++) texture(scene, `hero-${appearance}-${frame}`, 40, 50, (c, r, p) => {
    const cape = appearance === 'ranger' ? ['#284c3f', '#466c50', '#7a8e57'] : ['#3c4359', '#5d6888', '#99a6b0'];
    const step = frame === 1 ? 2 : frame === 2 ? -2 : 0;
    r(11, 38 + step, 7, 9 - step, '#35382f'); r(23, 38 - step, 7, 9 + step, '#35382f');
    r(10, 44 + step, 9, 4, '#665440'); r(23, 44 - step, 9, 4, '#665440');
    p([[12, 18], [27, 18], [32, 40], [25, 43], [11, 41], [8, 35]], cape[0]);
    r(13, 21, 16, 19, cape[1]); r(13, 22, 4, 15, cape[2]); r(12, 34, 17, 4, '#65513a'); r(18, 34, 5, 4, '#c6aa68');
    r(7, 23, 6, 14, '#97775a'); r(8, 25, 5, 7, cape[1]); r(29, 23, 6, 12, '#be9871');
    r(13, 5, 15, 17, '#453e32'); r(15, 9, 14, 13, '#d0ac7b'); r(16, 18, 10, 5, '#b48a63');
    r(24, 12, 3, 3, '#2b3934'); r(16, 8, 9, 4, '#6c5739');
    p([[9, 13], [12, 4], [24, 1], [30, 8], [30, 11], [17, 10], [14, 16]], cape[0]); r(12, 7, 16, 4, cape[1]); r(14, 4, 9, 3, cape[2]);
    r(33, 21, 3, 22, '#8a7049'); r(32, 14, 5, 15, '#c1c7ac'); r(34, 12, 3, 13, '#e4e0c0'); r(29, 29, 10, 3, '#c6a45d');
  });
  texture(scene, 'wolf', 56, 40, (c, r, p) => {
    p([[4, 19], [13, 13], [30, 13], [37, 7], [47, 10], [51, 20], [54, 23], [49, 28], [32, 29], [18, 28], [8, 25]], '#46534e');
    p([[10, 17], [28, 16], [39, 10], [45, 13], [47, 22], [33, 26], [16, 23]], '#7c8980');
    r(17, 17, 14, 6, '#9ca99a'); r(39, 17, 10, 6, '#b3b9a6');
    p([[37, 12], [35, 1], [43, 9]], '#56675b'); p([[44, 12], [45, 3], [50, 16]], '#6e7e6c');
    r(44, 16, 3, 3, '#e5c77a'); r(50, 21, 5, 3, '#26372f'); r(45, 25, 3, 3, '#d8d4b5');
    r(14, 25, 5, 10, '#56665a'); r(31, 26, 5, 10, '#56665a'); r(39, 26, 5, 8, '#7c8980');
    p([[12, 17], [1, 11], [2, 20], [13, 25]], '#7c8980');
  });
  texture(scene, 'goblin', 40, 50, (c, r, p) => {
    r(11, 37, 6, 10, '#5c563b'); r(24, 37, 6, 10, '#5c563b'); r(10, 44, 8, 4, '#383d2d'); r(24, 44, 9, 4, '#383d2d');
    r(12, 23, 18, 17, '#776144'); r(14, 24, 12, 9, '#956d45'); r(12, 34, 18, 4, '#453f2c');
    r(6, 24, 7, 15, '#729056'); r(30, 24, 6, 13, '#87a25b'); r(12, 6, 18, 18, '#779a57');
    p([[13, 10], [2, 7], [7, 18], [15, 18]], '#89a65e'); p([[27, 10], [38, 7], [34, 18], [28, 18]], '#89a65e');
    r(13, 15, 5, 3, '#e6cd7b'); r(25, 15, 5, 3, '#e6cd7b'); r(16, 16, 2, 2, '#2b3729'); r(26, 16, 2, 2, '#2b3729');
    r(20, 17, 5, 7, '#9cb76b'); r(16, 24, 12, 3, '#3b4930'); r(17, 23, 3, 3, '#e2d5ad');
    p([[10, 9], [14, 3], [25, 1], [31, 9]], '#6f4d35'); r(9, 8, 23, 4, '#977249');
    r(33, 23, 3, 23, '#6e5135'); r(31, 18, 7, 13, '#9c8860'); r(33, 17, 3, 4, '#b9b193');
  });
  for (let variant = 0; variant < 3; variant++) texture(scene, `rock-${variant}`, 40, 32, (_c, r, p) => {
    p([[3, 24], [5, 12], [14, 5], [28, 7], [36, 17], [35, 26], [22, 30], [7, 28]], '#46554a');
    p([[5, 19], [10, 9], [24, 6], [32, 14], [24, 22], [11, 25]], '#7b8974');
    p([[11, 10], [24, 7], [24, 12], [17, 17], [8, 19]], '#a0a68a'); r(7, 23, 16, 3, '#577040');
  });
  texture(scene, 'sign', 46, 55, (_c, r, p) => { r(20, 16, 6, 38, '#6c5937'); r(22, 24, 2, 27, '#9a8050'); p([[1, 4], [35, 4], [44, 14], [35, 24], [1, 24]], '#534c31'); p([[3, 6], [34, 6], [41, 14], [34, 21], [3, 21]], '#ac9760'); r(9, 12, 21, 3, '#655533'); });
  texture(scene, 'lantern', 20, 58, (_c, r) => { r(9, 6, 4, 51, '#4d4935'); r(8, 5, 13, 4, '#656046'); r(19, 8, 2, 10, '#4d4935'); r(14, 17, 8, 13, '#a27f41'); r(16, 19, 4, 8, '#f5cd78'); r(13, 15, 10, 3, '#4d4935'); });
  texture(scene, 'flower', 16, 16, (_c, r) => { r(7, 7, 2, 9, '#588047'); r(3, 12, 5, 2, '#7a9852'); r(5, 3, 7, 6, '#bdac70'); r(7, 2, 3, 8, '#cfbf86'); r(7, 5, 3, 3, '#dec987'); });
}

export function createGround(scene, map) {
  texture(scene, 'ground', WORLD.width, WORLD.height, (c, r, p) => {
    const random = seeded(map.seed);
    r(0, 0, WORLD.width, WORLD.height, '#455e38');
    const palette = ['#4c653c', '#506940', '#405936', '#3c5634', '#597044', '#63794a'];
    for (let i = 0; i < 42000; i++) {
      const x = random() * WORLD.width, y = random() * WORLD.height;
      r(x, y, 2 + random() * 7, 2 + random() * 4, palette[i % palette.length]);
    }
    // Dappled forest floor, and the softly worn edge of the village clearing.
    for (let i = 0; i < 2600; i++) {
      const angle = random() * Math.PI * 2, radius = 260 + random() * 180;
      r(1536 + Math.cos(angle) * radius, 1152 + Math.sin(angle) * radius * .85, 8 + random() * 16, 4 + random() * 8, i % 2 ? '#65784a' : '#596f41');
    }
    r(0, 1120, WORLD.width, 66, '#7b7950'); r(1505, 0, 64, WORLD.height, '#7b7950');
    r(1160, 1096, 760, 112, '#96906a'); r(1481, 750, 111, 770, '#96906a');
    for (let i = 0; i < 2000; i++) {
      const horizontal = i % 2 === 0;
      const x = horizontal ? random() * WORLD.width : 1500 + random() * 75;
      const y = horizontal ? 1115 + random() * 78 : random() * WORLD.height;
      r(x, y, 3 + random() * 10, 2 + random() * 5, ['#aaa17a', '#8d8b62', '#797c52', '#b1a77f'][i % 4]);
    }
    // Branching paths to each doorstep.
    for (const b of map.buildings) {
      const startX = Math.min(b.x, 1536), endX = Math.max(b.x, 1536);
      r(startX, b.y + 30, endX - startX + 20, 28, '#8c8960');
    }
    c.fillStyle = '#808465'; c.beginPath(); c.ellipse(1536, 1157, 144, 104, 0, 0, Math.PI * 2); c.fill();
    for (let y = 1064; y < 1250; y += 12) for (let x = 1396; x < 1680; x += 18) {
      if (((x - 1536) / 142) ** 2 + ((y - 1157) / 102) ** 2 < 1) r(x + (y % 24 ? 8 : 0), y, 15, 9, random() > .6 ? '#9a9d7b' : '#8b9272');
    }
    // Woodland pond.
    p([[1964, 604], [2020, 576], [2152, 579], [2220, 615], [2240, 707], [2200, 768], [2070, 792], [1962, 752], [1935, 673]], '#718464');
    p([[1975, 620], [2025, 590], [2150, 594], [2208, 628], [2224, 700], [2188, 754], [2070, 774], [1976, 741], [1952, 670]], '#385e59');
    for (let i = 0; i < 90; i++) r(1980 + random() * 205, 620 + random() * 120, 7 + random() * 17, 2, '#4d7970');
    // Village fences; open at paths.
    for (let x = 1195; x <= 1870; x += 23) if (Math.abs(x - 1536) > 75) {
      for (const y of [915, 1450]) { r(x, y, 4, 20, '#6a6440'); r(x, y + 5, 26, 3, '#a08c56'); r(x, y + 12, 26, 3, '#8c7949'); }
    }
    // Little cultivated gardens.
    for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) {
      r(1650 + col * 14, 1380 + row * 13, 11, 9, '#665c3c'); r(1653 + col * 14, 1381 + row * 13, 5, 5, row % 2 ? '#8b9c58' : '#a59957');
    }
    for (let i = 0; i < 900; i++) {
      const x = random() * WORLD.width, y = random() * WORLD.height;
      if (Math.abs(y - 1152) < 55 || Math.abs(x - 1536) < 60) continue;
      r(x, y, 2, 5, '#7f9353'); r(x + 3, y - 2, 2, 6, '#698449');
      if (i % 13 === 0) r(x, y - 3, 3, 3, '#b7ac6c');
    }
  });
}
