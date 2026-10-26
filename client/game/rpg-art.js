import { CLASSES } from '../../shared/rpg.js';

export function createRpgTextures(scene) {
  for (const classId of Object.keys(CLASSES)) for (const appearance of ['ranger', 'sage']) for (let frame = 0; frame < 3; frame++) {
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 50;
    const c = canvas.getContext('2d'); c.imageSmoothingEnabled = false;
    c.drawImage(scene.textures.get(`hero-${appearance}-${frame}`).getSourceImage(), 0, 0);
    const r = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
    if (classId === 'warrior') {
      r(13, 22, 16, 11, '#818f87'); r(14, 23, 4, 9, '#b1b8a0'); r(23, 24, 5, 9, '#626f6b');
      r(12, 5, 18, 7, '#87958e'); r(14, 4, 12, 3, '#bac1ab'); r(13, 11, 3, 6, '#87958e');
    } else {
      c.clearRect(31, 12, 9, 33); r(29, 23, 5, 11, '#bfa075');
      if (classId === 'mage') {
        r(12, 23, 17, 17, '#625a85'); r(13, 23, 3, 15, '#9287af'); r(19, 25, 2, 11, '#bfad72');
        r(34, 13, 3, 33, '#8c6a46'); r(31, 11, 8, 7, '#8eabcf'); r(33, 8, 4, 11, '#c0d9db');
        r(16, 1, 9, 4, '#797099'); r(14, 4, 15, 5, '#625a85');
      } else {
        r(34, 15, 2, 23, '#bf9d5c'); r(31, 12, 3, 5, '#bf9d5c'); r(31, 36, 3, 5, '#bf9d5c');
        r(32, 16, 1, 22, '#d7cd9a'); r(28, 25, 10, 2, '#d9d4ab');
      }
    }
    scene.textures.addCanvas(`class-${classId}-${appearance}-${frame}`, canvas);
  }
  const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 34;
  const c = canvas.getContext('2d');
  for (const [x, y, w, h, color] of [[4,12,32,19,'#55452f'],[5,8,30,13,'#9c7648'],[7,10,26,8,'#b28d54'],[4,20,32,3,'#4c402d'],[8,9,4,23,'#b2a56a'],[28,9,4,23,'#b2a56a'],[18,18,6,8,'#dac081'],[20,20,2,3,'#675b34']]) { c.fillStyle=color; c.fillRect(x,y,w,h); }
  scene.textures.addCanvas('chest', canvas);
}
