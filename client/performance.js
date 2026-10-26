// Opt-in local QA only; Vite removes this module's call from production builds.
export function showPerformance() {
  const hud = document.getElementById('hud'), meter = document.createElement('output');
  meter.id = 'performance-meter'; meter.style.cssText = 'position:fixed;left:24px;bottom:8px;z-index:100;font:12px monospace;color:#dfebc9;background:#162a23;padding:4px 8px;pointer-events:none';
  document.body.append(meter);
  let frames = 0, mutations = 0, start = performance.now();
  new MutationObserver(records => { mutations += records.length; }).observe(hud, { subtree: true, childList: true, attributes: true, characterData: true });
  const sample = now => {
    frames++;
    if (now - start >= 2000) { const seconds = (now - start) / 1000; meter.textContent = `${Math.round(frames / seconds)} FPS · Изменений интерфейса: ${Math.round(mutations / seconds)}/с`; frames = 0; mutations = 0; start = now; }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}
