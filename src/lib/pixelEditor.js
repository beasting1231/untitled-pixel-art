import { GIFEncoder, applyPalette, quantize } from "gifenc";

export const CANVAS_SIZES = [16, 32, 64];
export const TRANSPARENT = "rgba(0, 0, 0, 0)";
export const BASE_PALETTE = [
  "#111827",
  "#ef4444",
  "#f97316",
  "#facc15",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f3f4f6",
];

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createEmptyProjectsBySize = () => ({
  16: [],
  32: [],
  64: [],
});

export const createBlankPixels = (size) =>
  Array.from({ length: size * size }, () => TRANSPARENT);

export const createProject = (size, name) => ({
  id: newId(),
  name,
  size,
  frames: [createBlankPixels(size)],
});

const getColorParserContext = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas.getContext("2d");
};

const colorCache = new Map();

const toRgba = (color, parserContext) => {
  if (color === TRANSPARENT) return [0, 0, 0, 0];
  if (colorCache.has(color)) return colorCache.get(color);

  parserContext.clearRect(0, 0, 1, 1);
  parserContext.fillStyle = color;
  parserContext.fillRect(0, 0, 1, 1);
  const data = parserContext.getImageData(0, 0, 1, 1).data;
  const rgba = [data[0], data[1], data[2], data[3]];
  colorCache.set(color, rgba);
  return rgba;
};

const drawFrameToContext = (context, framePixels, size, offsetX = 0, offsetY = 0) => {
  framePixels.forEach((color, index) => {
    if (color === TRANSPARENT) return;
    const x = index % size;
    const y = Math.floor(index / size);
    context.fillStyle = color;
    context.fillRect(offsetX + x, offsetY + y, 1, 1);
  });
};

const frameToRgba = (framePixels, size, parserContext) => {
  const rgba = new Uint8Array(size * size * 4);

  framePixels.forEach((color, index) => {
    const [r, g, b, a] = toRgba(color, parserContext);
    const offset = index * 4;
    rgba[offset + 0] = r;
    rgba[offset + 1] = g;
    rgba[offset + 2] = b;
    rgba[offset + 3] = a;
  });

  return rgba;
};

export const buildCurBlob = async (project, pixels) => {
  if (!project || !pixels) return null;

  const width = project.size;
  const height = project.size;
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const context = offscreen.getContext("2d");
  if (!context) return null;

  context.clearRect(0, 0, width, height);

  pixels.forEach((color, index) => {
    if (color === TRANSPARENT) return;
    const x = index % width;
    const y = Math.floor(index / width);
    context.fillStyle = color;
    context.fillRect(x, y, 1, 1);
  });

  const pngBlob = await new Promise((resolve) => offscreen.toBlob(resolve, "image/png"));
  if (!pngBlob) return null;
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());

  const header = new ArrayBuffer(6);
  const headerView = new DataView(header);
  headerView.setUint16(0, 0, true);
  headerView.setUint16(2, 2, true);
  headerView.setUint16(4, 1, true);

  const dirEntry = new ArrayBuffer(16);
  const dirView = new DataView(dirEntry);
  dirView.setUint8(0, width === 256 ? 0 : width);
  dirView.setUint8(1, height === 256 ? 0 : height);
  dirView.setUint8(2, 0);
  dirView.setUint8(3, 0);
  dirView.setUint16(4, 0, true);
  dirView.setUint16(6, 0, true);
  dirView.setUint32(8, pngBytes.length, true);
  dirView.setUint32(12, 22, true);

  const curFile = new Uint8Array(header.byteLength + dirEntry.byteLength + pngBytes.length);
  curFile.set(new Uint8Array(header), 0);
  curFile.set(new Uint8Array(dirEntry), 6);
  curFile.set(pngBytes, 22);

  return new Blob([curFile], { type: "image/x-icon" });
};

export const buildPngBlob = async (project, pixels) => {
  if (!project || !pixels) return null;

  const canvas = document.createElement("canvas");
  canvas.width = project.size;
  canvas.height = project.size;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.clearRect(0, 0, project.size, project.size);
  drawFrameToContext(context, pixels, project.size);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
};

export const buildSpriteSheetPngBlob = async (project) => {
  if (!project || !Array.isArray(project.frames) || project.frames.length === 0) return null;

  const frameCount = project.frames.length;
  const canvas = document.createElement("canvas");
  canvas.width = project.size * frameCount;
  canvas.height = project.size;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.clearRect(0, 0, canvas.width, canvas.height);
  project.frames.forEach((framePixels, frameIndex) => {
    drawFrameToContext(context, framePixels, project.size, frameIndex * project.size, 0);
  });

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
};

export const buildGifBlob = async (project, fps = 8) => {
  if (!project || !Array.isArray(project.frames) || project.frames.length === 0) return null;

  const size = project.size;
  const parserContext = getColorParserContext();
  if (!parserContext) return null;

  const gif = GIFEncoder();
  const delay = Math.max(20, Math.round(1000 / Math.max(1, fps)));

  project.frames.forEach((framePixels, frameIndex) => {
    const rgba = frameToRgba(framePixels, size, parserContext);
    const palette = quantize(rgba, 256, { format: "rgba4444", oneBitAlpha: true });
    const index = applyPalette(rgba, palette, "rgba4444");
    const transparentIndex = palette.findIndex((entry) => entry?.[3] === 0);

    gif.writeFrame(index, size, size, {
      palette,
      delay,
      repeat: frameIndex === 0 ? 0 : undefined,
      transparent: transparentIndex >= 0,
      transparentIndex: transparentIndex >= 0 ? transparentIndex : 0,
    });
  });

  gif.finish();
  return new Blob([gif.bytesView()], { type: "image/gif" });
};

export const buildJsonBlob = (project) => {
  if (!project) return null;

  const payload = {
    name: project.name,
    size: project.size,
    frameCount: project.frames.length,
    frames: project.frames,
  };

  return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
};
