// The original MP4 is preserved. Color enhancement is reversible in entry.css.
import { t } from './i18n.js';
export function initializeHeroVideo() {
  const video = document.getElementById('hero-video');
  const toggle = document.querySelector('.hero-video-toggle');
  if (!video || !toggle) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false;
  let userPlayback = null;
  video.muted = true;

  const updateLabel = () => {
    toggle.textContent = t(video.paused ? 'Reproducir video' : 'Pausar video');
  };
  const updatePlayback = () => {
    if (visible && !document.hidden && (userPlayback ?? !reducedMotion.matches)) {
      void video.play().catch(updateLabel); // The button also handles blocked autoplay.
    } else video.pause();
  };

  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    userPlayback = video.paused;
    updatePlayback();
  });
  video.addEventListener('play', updateLabel);
  video.addEventListener('pause', updateLabel);
  video.querySelector('source').addEventListener('error', () => { toggle.hidden = true; });
  video.addEventListener('error', () => { toggle.hidden = true; });
  document.addEventListener('visibilitychange', updatePlayback);
  reducedMotion.addEventListener('change', updatePlayback);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    updatePlayback();
  }, { threshold: 0.1 }).observe(video);
}
