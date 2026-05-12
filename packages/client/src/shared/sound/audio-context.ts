let ctx: AudioContext | null = null;
let listenerAdded = false;

export function getAudioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    addInteractionListener();
  }
  return ctx;
}

function addInteractionListener() {
  if (listenerAdded) return;
  listenerAdded = true;
  const resume = () => {
    if (ctx && ctx.state !== 'running') void ctx.resume();
    document.removeEventListener('click', resume, true);
    document.removeEventListener('keydown', resume, true);
    document.removeEventListener('touchstart', resume, true);
  };
  document.addEventListener('click', resume, true);
  document.addEventListener('keydown', resume, true);
  document.addEventListener('touchstart', resume, true);
}
