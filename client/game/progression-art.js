export function createProgressionArt(scene) {
  const make = (key, w, h, draw) => {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d'); c.imageSmoothingEnabled = false;
    const r = (x, y, width, height, color) => { c.fillStyle = color; c.fillRect(x, y, width, height); };
    draw(c, r); scene.textures.addCanvas(key, canvas);
  };
  make('building-mine', 190, 155, (c, r) => {
    c.fillStyle = '#22352e'; c.beginPath(); c.ellipse(95, 122, 90, 25, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#6b7772'; c.beginPath(); c.moveTo(8, 125); c.lineTo(26, 59); c.lineTo(59, 24); c.lineTo(113, 12); c.lineTo(151, 47); c.lineTo(180, 127); c.closePath(); c.fill();
    r(30, 69, 32, 22, '#899389'); r(115, 47, 29, 32, '#87958d'); r(47, 38, 40, 14, '#9a9f8e'); r(138, 91, 27, 23, '#535f5b');
    r(65, 72, 62, 65, '#111e1e'); r(59, 67, 11, 73, '#7a6245'); r(125, 67, 10, 73, '#7a6245'); r(59, 63, 77, 13, '#a08a5c');
    r(79, 119, 5, 36, '#b7a575'); r(112, 119, 5, 36, '#b7a575'); for (let y = 126; y < 155; y += 9) r(72, y, 53, 4, '#6b5b43');
    r(45, 105, 5, 25, '#6b6246'); r(39, 102, 16, 6, '#e5bc6c'); r(41, 98, 11, 7, '#f2d49a');
  });
  make('ore-vein', 49, 42, (_c, r) => {
    r(3, 26, 43, 11, '#424f53'); r(8, 15, 32, 16, '#71858b'); r(15, 7, 19, 16, '#829ca5');
    r(13, 16, 6, 8, '#bad4d2'); r(28, 12, 6, 10, '#c9d8be'); r(31, 27, 7, 5, '#aec7d0'); r(8, 30, 31, 3, '#617b7f');
  });
  make('stump', 39, 26, (c, r) => { r(9, 9, 23, 13, '#6f5436'); c.fillStyle = '#bdab7d'; c.beginPath(); c.ellipse(20, 8, 14, 6, 0, 0, Math.PI * 2); c.fill(); r(11, 7, 18, 2, '#8d7651'); r(17, 5, 4, 5, '#b3a477'); });
  make('fence-crate', 38, 46, (_c, r) => {
    r(1, 37, 36, 8, '#17271b77'); r(3, 8, 32, 30, '#705534'); r(5, 10, 28, 25, '#a1854d');
    for (const x of [5, 15, 25]) r(x, 11, 2, 24, '#5d4d33');
    r(3, 8, 32, 5, '#bc9c64'); r(3, 30, 32, 5, '#bc9c64'); r(6, 12, 4, 22, '#6f6249'); r(28, 12, 4, 22, '#6f6249');
    r(7, 11, 2, 3, '#c3c1a5'); r(29, 31, 2, 3, '#c3c1a5');
  });
  make('skeleton', 38, 49, (_c, r) => {
    r(12, 3, 15, 12, '#d3d6bf'); r(14, 5, 4, 4, '#3e5662'); r(22, 5, 3, 4, '#3e5662'); r(17, 12, 7, 5, '#a7bdba');
    r(17, 17, 5, 18, '#c0cbb9'); r(12, 20, 15, 3, '#d2d6c4'); r(12, 26, 15, 3, '#a6bfb8'); r(9, 20, 3, 16, '#c2d1c2'); r(27, 20, 3, 15, '#b3c8bd');
    r(12, 34, 5, 12, '#b1c5b6'); r(22, 34, 5, 12, '#b1c5b6'); r(9, 44, 10, 3, '#9eb6b2'); r(22, 44, 9, 3, '#9eb6b2'); r(31, 23, 3, 18, '#9baeb5');
  });
  for (const appearance of ['ranger', 'sage']) for (let frame = 0; frame < 3; frame++) make(`class-axe-${appearance}-${frame}`, 40, 50, (c, r) => {
    c.drawImage(scene.textures.get(`hero-${appearance}-${frame}`).getSourceImage(), 0, 0); c.clearRect(31, 10, 9, 37);
    r(33, 17, 3, 29, '#a17d50'); r(27, 16, 11, 11, '#849b9a'); r(26, 18, 3, 9, '#ced7c5'); r(31, 17, 3, 8, '#afc0b2');
  });
}
