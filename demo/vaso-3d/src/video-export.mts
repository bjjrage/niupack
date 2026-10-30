import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, canEncodeVideo } from 'mediabunny';

export const VIDEO = { width: 720, height: 900, fps: 30, seconds: 8, bitrate: 3_000_000 } as const;
const FAILED = 'No se pudo generar el video. Intentá de nuevo.';

interface VideoExport {
  canvas: HTMLCanvasElement;
  draw(turn: number): void;
  checkActive(): void;
  onProgress(percent: number): void;
}

export async function exportTurntable(job: VideoExport): Promise<Blob> {
  job.checkActive(); job.onProgress(0);
  const options = {
    width: VIDEO.width, height: VIDEO.height, frameRate: VIDEO.fps,
    quality: new Quality({ bitrate: VIDEO.bitrate }), fullCodecString: 'avc1.42001f',
  };
  if (!await canEncodeVideo('avc', options)) {
    throw new Error('Este navegador no puede generar MP4. Abrí la página en Safari, Chrome o Edge actualizado.');
  }
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new CanvasSource(job.canvas, {
    codec: 'avc', quality: options.quality, fullCodecString: options.fullCodecString,
    keyFrameInterval: 2, latencyMode: 'quality',
  });
  output.addVideoTrack(source, { frameRate: VIDEO.fps });
  let failure: Error | null = null;
  let cancel!: (error: Error) => void;
  const interrupted = new Promise<never>((_, reject) => {
    cancel = error => {
      failure = error;
      void output.cancel().catch(() => {});
      reject(error);
    };
  });
  const timeout = window.setTimeout(() => cancel(new Error(FAILED)), 120_000);
  const visibility = () => {
    if (document.hidden) cancel(new Error('Mantené esta pestaña abierta mientras se prepara el video. Volvé a intentarlo.'));
  };
  document.addEventListener('visibilitychange', visibility);
  function check(): void { if (failure) throw failure; job.checkActive(); }
  async function encode(): Promise<Blob> {
    await output.start();
    const frames = VIDEO.fps * VIDEO.seconds;
    for (let index = 0; index < frames; index++) {
      check(); job.draw(index / frames);
      // Fixed timestamps preserve every frame and a complete eight-second turn,
      // even when encoding takes longer on a slower phone.
      await source.add(index / VIDEO.fps, 1 / VIDEO.fps);
      check();
      job.onProgress(Math.min(99, Math.round((index + 1) / frames * 100)));
      if (index % 4 === 0) await new Promise(resolve => window.setTimeout(resolve, 0));
    }
    source.close();
    await output.finalize();
    check();
    if (!target.buffer?.byteLength) throw new Error(FAILED);
    return new Blob([target.buffer], { type: 'video/mp4' });
  }
  try {
    return await Promise.race([encode(), interrupted]);
  } catch (error) {
    await output.cancel().catch(() => {});
    job.checkActive();
    throw failure ?? new Error(FAILED, { cause: error });
  } finally {
    clearTimeout(timeout);
    document.removeEventListener('visibilitychange', visibility);
  }
}
