import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import CreateFileModal from "./components/CreateFileModal";
import EditorPanel from "./components/EditorPanel";
import HomePage from "./components/HomePage";
import IconActionButton from "./components/IconActionButton";
import { auth, db } from "./lib/firebase";
import {
  Check,
  Eraser,
  House,
  Image as ImageIcon,
  Loader2,
  MousePointer2,
  PaintBucket,
  Pipette,
  Pencil,
  Grid3x3,
  Clapperboard,
  Save,
  Square,
} from "lucide-react";
import {
  BASE_PALETTE,
  CANVAS_SIZES,
  TRANSPARENT,
  buildCurBlob,
  buildGifBlob,
  buildJsonBlob,
  buildPngBlob,
  buildSpriteSheetPngBlob,
  createBlankPixels,
  createEmptyProjectsBySize,
  createProject,
  getProjectBucketKey,
  getProjectDimensions,
} from "./lib/pixelEditor";

const TOOLS = {
  SELECT: "select",
  BRUSH: "brush",
  ERASER: "eraser",
  LINE: "line",
  SQUARE: "square",
  BUCKET: "bucket",
};

const STORAGE_VERSION = 1;
const STORAGE_KEY_PREFIX = "pixel-forge-state";
const COMMUNITY_COLLECTION = "communityProjects";
const MAX_COMMUNITY_PREVIEW_FRAMES = 12;
const MIN_BRUSH_SIZE = 1;
const MAX_BRUSH_SIZE = 5;
const CUSTOM_PALETTE_SLOTS = 6;
const DEFAULT_REFERENCE_TRANSFORM = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 360,
  layer: "top",
  flipX: false,
  flipY: false,
};

const toXY = (index, width) => ({ x: index % width, y: Math.floor(index / width) });
const toIndex = (x, y, width) => y * width + x;
const getStorageKey = (uid) => `${STORAGE_KEY_PREFIX}:${uid}`;
const getUserStateRef = (uid) => doc(db, "users", uid, "editorState", "pixelForge");
const getProjectPreviewPixels = (project) =>
  Array.isArray(project?.frames?.[0]) ? project.frames[0] : [];
const getProjectPreviewFrameStrings = (project) => {
  if (!Array.isArray(project?.frames)) return [];
  return project.frames
    .filter((frame) => Array.isArray(frame))
    .slice(0, MAX_COMMUNITY_PREVIEW_FRAMES)
    .map((frame) => JSON.stringify(frame));
};

const parsePreviewFrameStrings = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry !== "string") return null;
      try {
        const parsed = JSON.parse(entry);
        return Array.isArray(parsed) ? parsed : null;
      } catch (_error) {
        return null;
      }
    })
    .filter((frame) => Array.isArray(frame));
};

const parseFrameStrings = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry !== "string") return null;
      try {
        const parsed = JSON.parse(entry);
        return Array.isArray(parsed) ? parsed : null;
      } catch (_error) {
        return null;
      }
    })
    .filter((frame) => Array.isArray(frame));
};

const clampChannel = (value, min, max) => Math.min(max, Math.max(min, value));
const normalizeHexColor = (value) => {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(candidate)) {
    return `#${candidate[1]}${candidate[1]}${candidate[2]}${candidate[2]}${candidate[3]}${candidate[3]}`;
  }
  if (/^#[0-9a-f]{6}$/i.test(candidate)) return candidate;
  return null;
};

const hexToRgb = (hex) => {
  if (typeof hex !== "string") return null;
  const normalized = hex.trim().toLowerCase();
  const full = /^#[0-9a-f]{3}$/i.test(normalized)
    ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
    : normalized;
  if (!/^#[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(1, 3), 16),
    g: parseInt(full.slice(3, 5), 16),
    b: parseInt(full.slice(5, 7), 16),
  };
};

const rgbToHex = (r, g, b) => {
  const toHex = (channel) => clampChannel(Math.round(channel), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const rgbToHsl = (r, g, b) => {
  const rn = clampChannel(r, 0, 255) / 255;
  const gn = clampChannel(g, 0, 255) / 255;
  const bn = clampChannel(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: Math.round(lightness * 100) };
  }

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;

  if (max === rn) hue = (gn - bn) / delta + (gn < bn ? 6 : 0);
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;

  hue /= 6;
  return {
    h: Math.round(hue * 360),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
};

const hslToRgb = (h, s, l) => {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clampChannel(s, 0, 100) / 100;
  const lightness = clampChannel(l, 0, 100) / 100;

  if (saturation === 0) {
    const value = Math.round(lightness * 255);
    return { r: value, g: value, b: value };
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const hk = hue / 360;

  const hueToRgb = (t) => {
    let tc = t;
    if (tc < 0) tc += 1;
    if (tc > 1) tc -= 1;
    if (tc < 1 / 6) return p + (q - p) * 6 * tc;
    if (tc < 1 / 2) return q;
    if (tc < 2 / 3) return p + (q - p) * (2 / 3 - tc) * 6;
    return p;
  };

  return {
    r: Math.round(hueToRgb(hk + 1 / 3) * 255),
    g: Math.round(hueToRgb(hk) * 255),
    b: Math.round(hueToRgb(hk - 1 / 3) * 255),
  };
};

const rgbToHsv = (r, g, b) => {
  const rn = clampChannel(r, 0, 255) / 255;
  const gn = clampChannel(g, 0, 255) / 255;
  const bn = clampChannel(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === rn) hue = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) hue = ((bn - rn) / delta + 2) / 6;
    else hue = ((rn - gn) / delta + 4) / 6;
  }

  const saturation = max === 0 ? 0 : delta / max;
  const value = max;

  return {
    h: Math.round(hue * 360),
    s: Math.round(saturation * 100),
    v: Math.round(value * 100),
  };
};

const hsvToRgb = (h, s, v) => {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clampChannel(s, 0, 100) / 100;
  const value = clampChannel(v, 0, 100) / 100;
  const c = value * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - c;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hue < 60) {
    rPrime = c;
    gPrime = x;
  } else if (hue < 120) {
    rPrime = x;
    gPrime = c;
  } else if (hue < 180) {
    gPrime = c;
    bPrime = x;
  } else if (hue < 240) {
    gPrime = x;
    bPrime = c;
  } else if (hue < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255),
  };
};

const hexToHsv = (hex) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return { h: 0, s: 100, v: 100 };
  return rgbToHsv(rgb.r, rgb.g, rgb.b);
};

const hsvToHex = (h, s, v) => {
  const rgb = hsvToRgb(h, s, v);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
};

const normalizeCustomPalette = (value) => {
  const normalized = Array.isArray(value)
    ? value.map((entry) => (typeof entry === "string" && entry.trim() ? entry : null))
    : [];

  while (normalized.length < CUSTOM_PALETTE_SLOTS) {
    normalized.push(null);
  }

  if (normalized.length % CUSTOM_PALETTE_SLOTS !== 0) {
    const missing = CUSTOM_PALETTE_SLOTS - (normalized.length % CUSTOM_PALETTE_SLOTS);
    for (let index = 0; index < missing; index += 1) normalized.push(null);
  }

  if (normalized.every((entry) => entry !== null)) {
    for (let index = 0; index < CUSTOM_PALETTE_SLOTS; index += 1) normalized.push(null);
  }

  return normalized;
};

const clampReferenceTransform = (transform) => {
  const source = transform && typeof transform === "object" ? transform : {};
  const layer = source.layer === "top" ? "top" : "behind";
  return {
    x: Math.max(-100, Math.min(100, Number(source.x) || 0)),
    y: Math.max(-100, Math.min(100, Number(source.y) || 0)),
    width: Math.max(5, Math.min(300, Number(source.width) || DEFAULT_REFERENCE_TRANSFORM.width)),
    height: Math.max(5, Math.min(300, Number(source.height) || DEFAULT_REFERENCE_TRANSFORM.height)),
    rotation: Math.max(1, Math.min(360, Number(source.rotation) || DEFAULT_REFERENCE_TRANSFORM.rotation)),
    layer,
    flipX: Boolean(source.flipX),
    flipY: Boolean(source.flipY),
  };
};

const getReferenceFitTransform = (imageWidth, imageHeight) => {
  const safeWidth = Math.max(1, Number(imageWidth) || 1);
  const safeHeight = Math.max(1, Number(imageHeight) || 1);
  const aspectRatio = safeWidth / safeHeight;

  if (aspectRatio >= 1) {
    return {
      ...DEFAULT_REFERENCE_TRANSFORM,
      width: 100,
      height: 100 / aspectRatio,
    };
  }

  return {
    ...DEFAULT_REFERENCE_TRANSFORM,
    width: 100 * aspectRatio,
    height: 100,
  };
};

const MIN_CANVAS_SIZE = 1;
const MAX_CANVAS_SIZE = 256;
const clampCanvasSize = (value) =>
  Math.max(MIN_CANVAS_SIZE, Math.min(MAX_CANVAS_SIZE, Math.round(Number(value) || CANVAS_SIZES[0])));
const getProjectDimensionsFromBucketKey = (bucketKey) => {
  if (typeof bucketKey !== "string") return null;
  const direct = /^(\d+)x(\d+)$/i.exec(bucketKey.trim());
  if (direct) {
    return {
      width: clampCanvasSize(Number(direct[1])),
      height: clampCanvasSize(Number(direct[2])),
    };
  }

  const legacySize = Number(bucketKey);
  if (Number.isInteger(legacySize) && legacySize >= MIN_CANVAS_SIZE) {
    const clamped = clampCanvasSize(legacySize);
    return { width: clamped, height: clamped };
  }

  return null;
};
const getProjectBucketKeys = (projectsBySize) => {
  const keys = new Set(CANVAS_SIZES.map((size) => getProjectBucketKey(size, size)));
  if (projectsBySize && typeof projectsBySize === "object") {
    Object.keys(projectsBySize).forEach((rawKey) => {
      const dimensions = getProjectDimensionsFromBucketKey(rawKey);
      if (!dimensions) return;
      keys.add(getProjectBucketKey(dimensions.width, dimensions.height));
    });
  }
  return [...keys].sort((a, b) => {
    const aDimensions = getProjectDimensionsFromBucketKey(a);
    const bDimensions = getProjectDimensionsFromBucketKey(b);
    if (!aDimensions || !bDimensions) return 0;
    if (aDimensions.width !== bDimensions.width) return aDimensions.width - bDimensions.width;
    return aDimensions.height - bDimensions.height;
  });
};
const getProjectsFromBucket = (sourceProjectsBySize, bucketKey) => {
  if (!sourceProjectsBySize || typeof sourceProjectsBySize !== "object") return [];
  const direct = sourceProjectsBySize[bucketKey];
  if (Array.isArray(direct)) return direct;

  const dimensions = getProjectDimensionsFromBucketKey(bucketKey);
  if (!dimensions || dimensions.width !== dimensions.height) return [];
  const legacy = sourceProjectsBySize[String(dimensions.width)];
  return Array.isArray(legacy) ? legacy : [];
};

const prepareStateForStorage = (state) => {
  if (!state || typeof state !== "object") return state;
  const sourceProjectsBySize = state.projectsBySize || {};
  const nextProjectsBySize = {};

  getProjectBucketKeys(sourceProjectsBySize).forEach((bucketKey) => {
    const projects = getProjectsFromBucket(sourceProjectsBySize, bucketKey);
    nextProjectsBySize[bucketKey] = projects.map((project) => {
      const frames = Array.isArray(project.frames) ? project.frames : [];
      const frameStrings = frames
        .filter((frame) => Array.isArray(frame))
        .map((frame) => JSON.stringify(frame));
      const { frames: _frames, ...projectWithoutFrames } = project;

      return {
        ...projectWithoutFrames,
        frameStrings,
      };
    });
  });

  return {
    ...state,
    projectsBySize: nextProjectsBySize,
  };
};

const normalizeProjectsBySize = (value) => {
  const normalized = createEmptyProjectsBySize();
  if (!value || typeof value !== "object") return normalized;

  getProjectBucketKeys(value).forEach((bucketKey) => {
    const bucketDimensions = getProjectDimensionsFromBucketKey(bucketKey);
    if (!bucketDimensions) return;
    const rawProjects = getProjectsFromBucket(value, bucketKey);
    normalized[bucketKey] = rawProjects
      .filter(
        (project) =>
          project &&
          typeof project.id === "string" &&
          typeof project.name === "string" &&
          (Array.isArray(project.frames) || Array.isArray(project.frameStrings))
      )
      .map((project) => {
        const dimensions = getProjectDimensions(project);
        const width = clampCanvasSize(dimensions.width || bucketDimensions.width);
        const height = clampCanvasSize(dimensions.height || bucketDimensions.height);
        const expectedLength = width * height;
        const rawFramesFromStrings = parseFrameStrings(project.frameStrings);
        const rawFrames =
          rawFramesFromStrings.length > 0
            ? rawFramesFromStrings
            : Array.isArray(project.frames)
              ? project.frames
              : [];
        const frames =
          rawFrames.length > 0
            ? rawFrames
                .filter((frame) => Array.isArray(frame))
                .map((frame) =>
                  Array.from({ length: expectedLength }, (_, index) => frame[index] || TRANSPARENT)
                )
            : [createBlankPixels(width, height)];

        return {
          id: project.id,
          name: project.name,
          width,
          height,
          frames: frames.length > 0 ? frames : [createBlankPixels(width, height)],
        };
      });
  });

  return normalized;
};

const getLineIndices = (startIndex, endIndex, width) => {
  const start = toXY(startIndex, width);
  const end = toXY(endIndex, width);
  const result = [];

  let x0 = start.x;
  let y0 = start.y;
  const x1 = end.x;
  const y1 = end.y;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  while (true) {
    result.push(toIndex(x0, y0, width));
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }

  return result;
};

const getSquareOutlineIndices = (startIndex, endIndex, width) => {
  const start = toXY(startIndex, width);
  const end = toXY(endIndex, width);
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);

  const indices = new Set();

  for (let x = minX; x <= maxX; x += 1) {
    indices.add(toIndex(x, minY, width));
    indices.add(toIndex(x, maxY, width));
  }

  for (let y = minY; y <= maxY; y += 1) {
    indices.add(toIndex(minX, y, width));
    indices.add(toIndex(maxX, y, width));
  }

  return [...indices];
};

const getRectFillIndices = (startIndex, endIndex, width) => {
  const start = toXY(startIndex, width);
  const end = toXY(endIndex, width);
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const indices = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      indices.push(toIndex(x, y, width));
    }
  }

  return indices;
};

const BRUSH_RADIUS_BY_SIZE = {
  1: 0,
  2: 1,
  3: 2,
  4: 2.6,
  5: 3.4,
};

const clampBrushSize = (value) =>
  Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE, Number(value) || MIN_BRUSH_SIZE));

const getBrushStampIndices = (centerIndex, width, height, thickness) => {
  const center = toXY(centerIndex, width);
  const brushSize = clampBrushSize(thickness);
  const radius = BRUSH_RADIUS_BY_SIZE[brushSize];
  if (radius <= 0) return [centerIndex];

  const searchRadius = Math.ceil(radius);
  const minX = Math.max(0, center.x - searchRadius);
  const maxX = Math.min(width - 1, center.x + searchRadius);
  const minY = Math.max(0, center.y - searchRadius);
  const maxY = Math.min(height - 1, center.y + searchRadius);
  const radiusSquared = radius * radius;

  const indices = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - center.x;
      const dy = y - center.y;
      if (dx * dx + dy * dy <= radiusSquared) {
        indices.push(toIndex(x, y, width));
      }
    }
  }

  return indices;
};

const expandIndicesWithThickness = (indices, width, height, thickness) => {
  if (thickness <= 1) return [...new Set(indices)];

  const expanded = new Set(indices);
  indices.forEach((index) => {
    const stamp = getBrushStampIndices(index, width, height, thickness);
    stamp.forEach((pixelIndex) => expanded.add(pixelIndex));
  });

  return [...expanded];
};

const floodFill = (pixels, startIndex, replacement, width, height) => {
  const target = pixels[startIndex];
  if (target === replacement) return pixels;

  const next = [...pixels];
  const queue = [startIndex];
  const seen = new Set([startIndex]);

  while (queue.length > 0) {
    const index = queue.shift();
    if (next[index] !== target) continue;
    next[index] = replacement;

    const { x, y } = toXY(index, width);
    const neighbors = [];
    if (x > 0) neighbors.push(toIndex(x - 1, y, width));
    if (x < width - 1) neighbors.push(toIndex(x + 1, y, width));
    if (y > 0) neighbors.push(toIndex(x, y - 1, width));
    if (y < height - 1) neighbors.push(toIndex(x, y + 1, width));

    neighbors.forEach((n) => {
      if (!seen.has(n) && next[n] === target) {
        seen.add(n);
        queue.push(n);
      }
    });
  }

  return next;
};

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [currentView, setCurrentView] = useState("home");
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [projectsBySize, setProjectsBySize] = useState(createEmptyProjectsBySize);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeFrameIndexByProject, setActiveFrameIndexByProject] = useState({});
  const [palette, setPalette] = useState(BASE_PALETTE);
  const [brushColor, setBrushColor] = useState(BASE_PALETTE[0]);
  const [pickerColor, setPickerColor] = useState(BASE_PALETTE[0]);
  const [isCustomColorPickerOpen, setIsCustomColorPickerOpen] = useState(false);
  const [customHue, setCustomHue] = useState(0);
  const [customSaturation, setCustomSaturation] = useState(100);
  const [customValue, setCustomValue] = useState(100);
  const [customHexInput, setCustomHexInput] = useState("#ffffff");
  const [isEyedropperArmed, setIsEyedropperArmed] = useState(false);
  const [isColorMenuPinnedOpen, setIsColorMenuPinnedOpen] = useState(false);
  const [eyedropperPreview, setEyedropperPreview] = useState(null);
  const [customPalette, setCustomPalette] = useState(() => normalizeCustomPalette());
  const [currentTool, setCurrentTool] = useState(TOOLS.BRUSH);
  const [toolThickness, setToolThickness] = useState(1);
  const [shapeStartIndex, setShapeStartIndex] = useState(null);
  const [shapeCurrentIndex, setShapeCurrentIndex] = useState(null);
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [clipboard, setClipboard] = useState(null);
  const [pendingPaste, setPendingPaste] = useState(null);
  const [lastPointerIndex, setLastPointerIndex] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectWidth, setNewProjectWidth] = useState(() => clampCanvasSize(CANVAS_SIZES[0]));
  const [newProjectHeight, setNewProjectHeight] = useState(() => clampCanvasSize(CANVAS_SIZES[0]));
  const [referenceOverlayByProject, setReferenceOverlayByProject] = useState({});
  const [isPainting, setIsPainting] = useState(false);
  const [isAnimationPanelOpen, setIsAnimationPanelOpen] = useState(false);
  const [isAnimationPlaying, setIsAnimationPlaying] = useState(false);
  const [isGridVisible, setIsGridVisible] = useState(true);
  const [fps, setFps] = useState(8);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [communityProjects, setCommunityProjects] = useState([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState("");
  const [publishedProjectIds, setPublishedProjectIds] = useState(new Set());
  const [projectCommunityLikes, setProjectCommunityLikes] = useState({});
  const [missingPreviewProjectIds, setMissingPreviewProjectIds] = useState(new Set());
  const [publishingProjectId, setPublishingProjectId] = useState(null);
  const referenceUploadInputRef = useRef(null);
  const customSvAreaRef = useRef(null);
  const undoStackRef = useRef([]);
  const pendingPasteDragRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser?.uid) {
      setCurrentView("home");
      undoStackRef.current = [];
      setSelectedIndices([]);
      setClipboard(null);
      setPendingPaste(null);
      pendingPasteDragRef.current = null;
      setReferenceOverlayByProject({});
      setHasHydrated(false);
      setSavedSnapshot("");
      setHasUnsavedChanges(false);
      setIsSaving(false);
      setSaveState("idle");
      return;
    }

    setCurrentView("home");
    let isCancelled = false;

    const applyPersistedState = (state) => {
      if (!state || isCancelled) return;
      const nextProjectsBySize = normalizeProjectsBySize(state.projectsBySize);
      const allLoadedProjects = Object.values(nextProjectsBySize).flat();
      const loadedProjectIds = new Set(allLoadedProjects.map((project) => project.id));
      const loadedActiveProjectId =
        typeof state.activeProjectId === "string" && loadedProjectIds.has(state.activeProjectId)
          ? state.activeProjectId
          : null;

      setProjectsBySize(nextProjectsBySize);
      setActiveProjectId(loadedActiveProjectId);
      setActiveFrameIndexByProject(
        state.activeFrameIndexByProject && typeof state.activeFrameIndexByProject === "object"
          ? state.activeFrameIndexByProject
          : {}
      );
      setPalette(Array.isArray(state.palette) ? state.palette : BASE_PALETTE);
      setBrushColor(typeof state.brushColor === "string" ? state.brushColor : BASE_PALETTE[0]);
      setPickerColor(typeof state.pickerColor === "string" ? state.pickerColor : BASE_PALETTE[0]);
      setCustomPalette(normalizeCustomPalette(state.customPalette));
      setCurrentTool(Object.values(TOOLS).includes(state.currentTool) ? state.currentTool : TOOLS.BRUSH);
      setToolThickness(clampBrushSize(state.toolThickness));
      setFps(Math.max(1, Math.min(60, Number(state.fps) || 8)));
      setIsAnimationPanelOpen(false);
      setIsGridVisible(state.isGridVisible !== false);

      return {
        projectsBySize: nextProjectsBySize,
        activeProjectId: loadedActiveProjectId,
        activeFrameIndexByProject:
          state.activeFrameIndexByProject && typeof state.activeFrameIndexByProject === "object"
            ? state.activeFrameIndexByProject
            : {},
        palette: Array.isArray(state.palette) ? state.palette : BASE_PALETTE,
        brushColor: typeof state.brushColor === "string" ? state.brushColor : BASE_PALETTE[0],
        pickerColor: typeof state.pickerColor === "string" ? state.pickerColor : BASE_PALETTE[0],
        customPalette: normalizeCustomPalette(state.customPalette),
        currentTool: Object.values(TOOLS).includes(state.currentTool) ? state.currentTool : TOOLS.BRUSH,
        toolThickness: clampBrushSize(state.toolThickness),
        fps: Math.max(1, Math.min(60, Number(state.fps) || 8)),
        isAnimationPanelOpen: false,
        isGridVisible: state.isGridVisible !== false,
      };
    };

    const hydrateFromPersistence = async () => {
      const stateRef = getUserStateRef(authUser.uid);
      let persistedState = null;

      try {
        const snapshot = await getDoc(stateRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          persistedState = data?.state || null;
        }
      } catch (_error) {
        // Ignore read errors and fallback to defaults/local migration.
      }

      if (!persistedState) {
        try {
          const raw = localStorage.getItem(getStorageKey(authUser.uid));
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.version === STORAGE_VERSION && parsed.state) {
              persistedState = parsed.state;
              await setDoc(
                stateRef,
                {
                  version: STORAGE_VERSION,
                  state: persistedState,
                  updatedAt: Date.now(),
                },
                { merge: true }
              );
            }
          }
        } catch (_error) {
          // Ignore migration errors.
        }
      }

      if (!isCancelled && persistedState) {
        const normalizedPersistedState = applyPersistedState(persistedState);
        if (normalizedPersistedState) {
          setSavedSnapshot(JSON.stringify(normalizedPersistedState));
          setSaveState("saved");
        }
      }

      if (!isCancelled && !persistedState) {
        const defaultState = {
          projectsBySize: createEmptyProjectsBySize(),
          activeProjectId: null,
          activeFrameIndexByProject: {},
          palette: BASE_PALETTE,
          brushColor: BASE_PALETTE[0],
          pickerColor: BASE_PALETTE[0],
          customPalette: normalizeCustomPalette(),
          currentTool: TOOLS.BRUSH,
          toolThickness: 1,
          fps: 8,
          isAnimationPanelOpen: false,
          isGridVisible: true,
        };
        setSavedSnapshot(JSON.stringify(defaultState));
        setSaveState("saved");
      }

      if (!isCancelled) {
        setHasHydrated(true);
      }
    };

    hydrateFromPersistence();
    return () => {
      isCancelled = true;
    };
  }, [authUser]);

  useEffect(() => {
    const onWheel = (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
    };

    const onKeyDown = (event) => {
      const commandKey = event.metaKey || event.ctrlKey;
      if (!commandKey) return;
      if (["+", "=", "-", "_", "0"].includes(event.key)) {
        event.preventDefault();
      }
    };

    const preventGestureZoom = (event) => event.preventDefault();

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("gesturestart", preventGestureZoom, { passive: false, capture: true });
    window.addEventListener("gesturechange", preventGestureZoom, { passive: false, capture: true });
    window.addEventListener("gestureend", preventGestureZoom, { passive: false, capture: true });
    document.addEventListener("gesturestart", preventGestureZoom, { passive: false, capture: true });
    document.addEventListener("gesturechange", preventGestureZoom, { passive: false, capture: true });
    document.addEventListener("gestureend", preventGestureZoom, { passive: false, capture: true });

    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("gesturestart", preventGestureZoom, { capture: true });
      window.removeEventListener("gesturechange", preventGestureZoom, { capture: true });
      window.removeEventListener("gestureend", preventGestureZoom, { capture: true });
      document.removeEventListener("gesturestart", preventGestureZoom, { capture: true });
      document.removeEventListener("gesturechange", preventGestureZoom, { capture: true });
      document.removeEventListener("gestureend", preventGestureZoom, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (!authUser?.uid) {
      setCommunityProjects([]);
      setPublishedProjectIds(new Set());
      setProjectCommunityLikes({});
      setMissingPreviewProjectIds(new Set());
      setCommunityError("");
      setCommunityLoading(false);
      return;
    }

    let isCancelled = false;
    setCommunityLoading(true);
    setCommunityError("");

    const loadCommunityProjects = async () => {
      try {
        const communityQuery = query(
          collection(db, COMMUNITY_COLLECTION),
          orderBy("upvotes", "desc"),
          limit(50)
        );
        const ownPublishedQuery = query(
          collection(db, COMMUNITY_COLLECTION),
          where("ownerUid", "==", authUser.uid),
          limit(100)
        );

        const [communitySnapshot, ownSnapshot] = await Promise.all([
          getDocs(communityQuery),
          getDocs(ownPublishedQuery),
        ]);

        if (isCancelled) return;

        const nextProjects = communitySnapshot.docs
          .map((projectDoc) => {
            const data = projectDoc.data() || {};
            const upvoterIds = Array.isArray(data.upvoterIds) ? data.upvoterIds : [];
            const width = clampCanvasSize(Number(data.width) || Number(data.size) || 16);
            const height = clampCanvasSize(Number(data.height) || Number(data.size) || 16);
            return {
              id: projectDoc.id,
              name: typeof data.name === "string" ? data.name : "Untitled Project",
              ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
              authorName: typeof data.authorName === "string" ? data.authorName : "Unknown creator",
              width,
              height,
              frameCount: Math.max(1, Number(data.frameCount) || 1),
              previewPixels: Array.isArray(data.previewPixels) ? data.previewPixels : [],
              previewFrames: parsePreviewFrameStrings(data.previewFrameStrings),
              upvotes: Math.max(0, Number(data.upvotes) || 0),
              hasUpvoted: upvoterIds.includes(authUser.uid),
            };
          })
          .filter((project) => project.ownerUid && project.ownerUid !== authUser.uid)
          .sort((a, b) => b.upvotes - a.upvotes);

        const ownedIds = new Set();
        const likesByProjectId = {};
        const missingPreviewIds = new Set();
        ownSnapshot.docs.forEach((docSnapshot) => {
          const rawId = docSnapshot.id || "";
          const prefix = `${authUser.uid}_`;
          if (rawId.startsWith(prefix)) {
            const projectId = rawId.slice(prefix.length);
            ownedIds.add(projectId);
            const data = docSnapshot.data() || {};
            likesByProjectId[projectId] = Math.max(0, Number(data.upvotes) || 0);
            const frameCount = Math.max(1, Number(data.frameCount) || 1);
            const hasPreviewPixels = Array.isArray(data.previewPixels) && data.previewPixels.length > 0;
            const hasAnimatedPreviewFrames =
              Array.isArray(data.previewFrameStrings) &&
              data.previewFrameStrings.filter((entry) => typeof entry === "string").length >= 2;
            const needsStaticPreview = !hasPreviewPixels;
            const needsAnimatedPreview = frameCount > 1 && !hasAnimatedPreviewFrames;

            if (needsStaticPreview || needsAnimatedPreview) {
              missingPreviewIds.add(projectId);
            }
          }
        });

        setCommunityProjects(nextProjects);
        setPublishedProjectIds(ownedIds);
        setProjectCommunityLikes(likesByProjectId);
        setMissingPreviewProjectIds(missingPreviewIds);
      } catch (_error) {
        if (!isCancelled) {
          setCommunityError("Could not load community projects.");
        }
      } finally {
        if (!isCancelled) {
          setCommunityLoading(false);
        }
      }
    };

    loadCommunityProjects();

    return () => {
      isCancelled = true;
    };
  }, [authUser]);

  const allProjects = useMemo(() => Object.values(projectsBySize).flat(), [projectsBySize]);

  useEffect(() => {
    if (!authUser?.uid || !hasHydrated || missingPreviewProjectIds.size === 0) return;

    const idsToBackfill = [...missingPreviewProjectIds];
    const updates = idsToBackfill
      .map((projectId) => {
        const project = allProjects.find((entry) => entry.id === projectId);
        if (!project) return null;
        return {
          projectId,
          ref: doc(db, COMMUNITY_COLLECTION, `${authUser.uid}_${projectId}`),
          data: {
            previewPixels: getProjectPreviewPixels(project),
            previewFrameStrings: getProjectPreviewFrameStrings(project),
            frameCount: project.frames?.length || 1,
            width: project.width,
            height: project.height,
            updatedAt: serverTimestamp(),
          },
        };
      })
      .filter(Boolean);

    if (updates.length === 0) return;

    Promise.all(updates.map((entry) => setDoc(entry.ref, entry.data, { merge: true })))
      .then(() => {
        setMissingPreviewProjectIds((prev) => {
          const next = new Set(prev);
          updates.forEach((entry) => next.delete(entry.projectId));
          return next;
        });
      })
      .catch(() => {
        // Best-effort backfill. If it fails, we'll retry on next load.
      });
  }, [authUser, hasHydrated, missingPreviewProjectIds, allProjects]);

  const persistedState = useMemo(
    () => ({
      projectsBySize,
      activeProjectId,
      activeFrameIndexByProject,
      palette,
      brushColor,
      pickerColor,
      customPalette,
      currentTool,
      toolThickness,
      fps,
      isGridVisible,
    }),
    [
    projectsBySize,
    activeProjectId,
    activeFrameIndexByProject,
    palette,
    brushColor,
    pickerColor,
    customPalette,
    currentTool,
    toolThickness,
    fps,
    isGridVisible,
    ]
  );

  const currentSnapshot = useMemo(() => JSON.stringify(persistedState), [persistedState]);

  const currentPickerColorInputValue = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(pickerColor)
    ? pickerColor
    : "#000000";
  const customPickerPreviewColor = useMemo(
    () => hsvToHex(customHue, customSaturation, customValue),
    [customHue, customSaturation, customValue]
  );

  useEffect(() => {
    setHasUnsavedChanges(hasHydrated && currentSnapshot !== savedSnapshot);
  }, [hasHydrated, currentSnapshot, savedSnapshot]);

  useEffect(() => {
    const normalized = normalizeHexColor(pickerColor);
    if (normalized) {
      setCustomHexInput(normalized);
    }
  }, [pickerColor]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = window.setTimeout(() => {
      setSaveState("idle");
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [saveState]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (hasUnsavedChanges && !isSaving) {
      setSaveState("idle");
    }
  }, [hasHydrated, hasUnsavedChanges, isSaving]);

  useEffect(() => {
    if (!authUser?.uid || !hasHydrated) return;

    const timer = window.setTimeout(() => {
      setDoc(
        getUserStateRef(authUser.uid),
        {
          version: STORAGE_VERSION,
          state: {
            customPalette,
          },
          updatedAt: Date.now(),
        },
        { merge: true }
      ).catch(() => {
        // Best-effort autosave for custom palette slots.
      });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [authUser, hasHydrated, customPalette]);

  const saveChanges = async () => {
    if (!authUser?.uid || !hasHydrated || isSaving || !hasUnsavedChanges) return;

    setIsSaving(true);
    setSaveState("saving");
    try {
      const payload = {
        version: STORAGE_VERSION,
        state: prepareStateForStorage(persistedState),
        updatedAt: Date.now(),
      };
      await setDoc(getUserStateRef(authUser.uid), payload, { merge: true });
      setSavedSnapshot(currentSnapshot);
      setHasUnsavedChanges(false);
      setAuthError("");
      setSaveState("saved");
    } catch (error) {
      setAuthError(error?.message || "Save failed. Please try again.");
      setSaveState("error");
    } finally {
      setIsSaving(false);
    }
  };

  const activeProject = useMemo(
    () => allProjects.find((project) => project.id === activeProjectId) || null,
    [allProjects, activeProjectId]
  );
  const activeDimensions = getProjectDimensions(activeProject);
  const activeWidth = activeDimensions.width;
  const activeHeight = activeDimensions.height;
  const activeProjectBucketKey = activeProject
    ? getProjectBucketKey(activeWidth, activeHeight)
    : getProjectBucketKey(CANVAS_SIZES[0], CANVAS_SIZES[0]);

  const activeFrameIndex = activeProject
    ? Math.min(
        activeFrameIndexByProject[activeProject.id] || 0,
        Math.max((activeProject.frames?.length || 1) - 1, 0)
      )
    : 0;

  const activeFrame =
    activeProject?.frames?.[activeFrameIndex] || createBlankPixels(activeWidth, activeHeight);
  const colorForTool = currentTool === TOOLS.ERASER ? TRANSPARENT : brushColor;
  const displayFrame = useMemo(() => {
    const isPreviewTool = currentTool === TOOLS.LINE || currentTool === TOOLS.SQUARE;
    if (!isPainting || !isPreviewTool || shapeStartIndex === null || shapeCurrentIndex === null) {
      return activeFrame;
    }

    const baseIndices =
      currentTool === TOOLS.LINE
        ? getLineIndices(shapeStartIndex, shapeCurrentIndex, activeWidth)
        : getSquareOutlineIndices(shapeStartIndex, shapeCurrentIndex, activeWidth);

    const indices = expandIndicesWithThickness(baseIndices, activeWidth, activeHeight, toolThickness);
    const next = [...activeFrame];
    indices.forEach((index) => {
      next[index] = colorForTool;
    });

    return next;
  }, [
    activeFrame,
    activeWidth,
    activeHeight,
    colorForTool,
    currentTool,
    isPainting,
    shapeStartIndex,
    shapeCurrentIndex,
    toolThickness,
  ]);

  const pendingPastePreviewIndices = useMemo(() => {
    if (!pendingPaste || !activeProject) return [];

    const indices = [];
    for (let y = 0; y < pendingPaste.height; y += 1) {
      for (let x = 0; x < pendingPaste.width; x += 1) {
        const targetX = pendingPaste.anchorX + x;
        const targetY = pendingPaste.anchorY + y;
        if (targetX < 0 || targetX >= activeWidth || targetY < 0 || targetY >= activeHeight) continue;
        indices.push(toIndex(targetX, targetY, activeWidth));
      }
    }
    return indices;
  }, [activeProject, activeWidth, activeHeight, pendingPaste]);

  const frameWithPendingPaste = useMemo(() => {
    if (!pendingPaste || !activeProject) return displayFrame;

    const next = [...displayFrame];
    for (let y = 0; y < pendingPaste.height; y += 1) {
      for (let x = 0; x < pendingPaste.width; x += 1) {
        const targetX = pendingPaste.anchorX + x;
        const targetY = pendingPaste.anchorY + y;
        if (targetX < 0 || targetX >= activeWidth || targetY < 0 || targetY >= activeHeight) continue;
        const sourceIndex = y * pendingPaste.width + x;
        next[toIndex(targetX, targetY, activeWidth)] = pendingPaste.pixels[sourceIndex];
      }
    }

    return next;
  }, [activeProject, activeWidth, activeHeight, displayFrame, pendingPaste]);

  const selectionPreviewIndices = useMemo(() => {
    if (
      currentTool !== TOOLS.SELECT ||
      !isPainting ||
      shapeStartIndex === null ||
      shapeCurrentIndex === null
    ) {
      return [];
    }

    return getRectFillIndices(shapeStartIndex, shapeCurrentIndex, activeWidth);
  }, [activeWidth, currentTool, isPainting, shapeStartIndex, shapeCurrentIndex]);

  const visibleSelectionIndices =
    selectionPreviewIndices.length > 0
      ? selectionPreviewIndices
      : pendingPastePreviewIndices.length > 0
        ? pendingPastePreviewIndices
        : selectedIndices;
  const selectedIndexSet = useMemo(() => new Set(visibleSelectionIndices), [visibleSelectionIndices]);

  const getProjectsByBucket = (bucketKey) => projectsBySize[bucketKey] || [];
  const cloneState = (value) => {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  };

  const pushUndoSnapshot = () => {
    undoStackRef.current.push({
      projectsBySize: cloneState(projectsBySize),
      activeProjectId,
      activeFrameIndexByProject: cloneState(activeFrameIndexByProject),
      selectedIndices: [...selectedIndices],
    });

    if (undoStackRef.current.length > 80) {
      undoStackRef.current.shift();
    }
  };

  const undoLastChange = () => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;

    setProjectsBySize(previous.projectsBySize);
    setActiveProjectId(previous.activeProjectId);
    setActiveFrameIndexByProject(previous.activeFrameIndexByProject);
    setSelectedIndices(previous.selectedIndices || []);
    setIsAnimationPlaying(false);
  };

  useEffect(() => {
    if (!isAnimationPlaying || !activeProject || (activeProject.frames?.length || 0) < 2) return;

    const intervalMs = Math.max(1000 / Math.max(fps, 1), 16);
    const timer = window.setInterval(() => {
      setActiveFrameIndexByProject((prev) => {
        const current = prev[activeProject.id] || 0;
        const next = (current + 1) % activeProject.frames.length;
        return { ...prev, [activeProject.id]: next };
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [isAnimationPlaying, fps, activeProject]);

  const updateActiveFrame = (updater) => {
    if (!activeProject) return;

    const updated = getProjectsByBucket(activeProjectBucketKey).map((project) => {
      if (project.id !== activeProject.id) return project;
      const frames = [...project.frames];
      const framePixels = [...frames[activeFrameIndex]];
      const nextPixels = updater(framePixels);
      frames[activeFrameIndex] = nextPixels;
      return { ...project, frames };
    });

    setProjectsBySize((prev) => ({
      ...prev,
      [activeProjectBucketKey]: updated,
    }));
  };

  const paintPixels = (indices) => {
    const targetIndices = expandIndicesWithThickness(indices, activeWidth, activeHeight, toolThickness);

    updateActiveFrame((framePixels) => {
      const next = [...framePixels];
      targetIndices.forEach((index) => {
        next[index] = colorForTool;
      });
      return next;
    });
  };

  const clearCanvas = () => {
    if (!activeProject) return;
    pushUndoSnapshot();

    const updated = getProjectsByBucket(activeProjectBucketKey).map((project) => {
      if (project.id !== activeProject.id) return project;
      const frames = [...project.frames];
      frames[activeFrameIndex] = createBlankPixels(project.width, project.height);
      return { ...project, frames };
    });

    setProjectsBySize((prev) => ({
      ...prev,
      [activeProjectBucketKey]: updated,
    }));
  };

  const clampPendingPasteAnchor = (x, y, width, height) => ({
    x: Math.max(-width + 1, Math.min(activeWidth - 1, x)),
    y: Math.max(-height + 1, Math.min(activeHeight - 1, y)),
  });

  const handlePointerDown = (index) => {
    if (!activeProject) return;

    if (isEyedropperArmed) {
      setLastPointerIndex(index);
      const sampledColor = activeFrame[index];

      if (sampledColor === TRANSPARENT) {
        setBrushColor(TRANSPARENT);
        setCurrentTool(TOOLS.ERASER);
      } else if (typeof sampledColor === "string") {
        handleSelectColor(sampledColor);
        setCurrentTool(TOOLS.BRUSH);
      }

      setIsEyedropperArmed(false);
      setIsColorMenuPinnedOpen(true);
      setEyedropperPreview(null);
      return;
    }

    if (isColorMenuPinnedOpen) {
      setIsColorMenuPinnedOpen(false);
    }

    setLastPointerIndex(index);
    setIsPainting(true);

    if (currentTool === TOOLS.SELECT && pendingPaste) {
      const pointer = toXY(index, activeWidth);
      const isInsidePendingPaste =
        pointer.x >= pendingPaste.anchorX &&
        pointer.x < pendingPaste.anchorX + pendingPaste.width &&
        pointer.y >= pendingPaste.anchorY &&
        pointer.y < pendingPaste.anchorY + pendingPaste.height;

      if (isInsidePendingPaste) {
        pendingPasteDragRef.current = {
          startPointerX: pointer.x,
          startPointerY: pointer.y,
          startAnchorX: pendingPaste.anchorX,
          startAnchorY: pendingPaste.anchorY,
        };
        setIsPainting(false);
        return;
      }
    }

    if (currentTool === TOOLS.SELECT) {
      setShapeStartIndex(index);
      setShapeCurrentIndex(index);
      return;
    }

    if (currentTool === TOOLS.BRUSH || currentTool === TOOLS.ERASER) {
      pushUndoSnapshot();
      paintPixels(getBrushStampIndices(index, activeWidth, activeHeight, toolThickness));
      return;
    }

    if (currentTool === TOOLS.BUCKET) {
      pushUndoSnapshot();
      updateActiveFrame((framePixels) => floodFill(framePixels, index, colorForTool, activeWidth, activeHeight));
      setIsPainting(false);
      return;
    }

    pushUndoSnapshot();
    setShapeStartIndex(index);
    setShapeCurrentIndex(index);
  };

  const handlePointerEnter = (index) => {
    setLastPointerIndex(index);

    if (!activeProject) return;

    if (pendingPasteDragRef.current && currentTool === TOOLS.SELECT && pendingPaste) {
      const pointer = toXY(index, activeWidth);
      const drag = pendingPasteDragRef.current;
      const deltaX = pointer.x - drag.startPointerX;
      const deltaY = pointer.y - drag.startPointerY;
      const nextAnchor = clampPendingPasteAnchor(
        drag.startAnchorX + deltaX,
        drag.startAnchorY + deltaY,
        pendingPaste.width,
        pendingPaste.height
      );
      setPendingPaste((previous) =>
        previous
          ? {
              ...previous,
              anchorX: nextAnchor.x,
              anchorY: nextAnchor.y,
            }
          : previous
      );
      return;
    }

    if (!isPainting) return;

    if (currentTool === TOOLS.BRUSH || currentTool === TOOLS.ERASER) {
      paintPixels(getBrushStampIndices(index, activeWidth, activeHeight, toolThickness));
      return;
    }

    if (currentTool === TOOLS.LINE || currentTool === TOOLS.SQUARE || currentTool === TOOLS.SELECT) {
      setShapeCurrentIndex(index);
    }
  };

  const handlePixelHover = (index, event) => {
    if (!isEyedropperArmed || !activeProject) return;
    const hoveredColor = activeFrame[index] || TRANSPARENT;
    setEyedropperPreview({
      x: event.clientX,
      y: event.clientY,
      color: hoveredColor,
    });
  };

  const selectTool = (nextTool) => {
    setIsColorMenuPinnedOpen(false);
    setIsEyedropperArmed(false);
    setEyedropperPreview(null);
    setCurrentTool(nextTool);
  };

  useEffect(() => {
    setSelectedIndices([]);
    setPendingPaste(null);
    pendingPasteDragRef.current = null;
  }, [activeProjectId, activeFrameIndex]);

  const commitShape = (endIndex) => {
    if (!activeProject || shapeStartIndex === null) return;
    const baseIndices =
      currentTool === TOOLS.LINE
        ? getLineIndices(shapeStartIndex, endIndex, activeWidth)
        : getSquareOutlineIndices(shapeStartIndex, endIndex, activeWidth);
    paintPixels(baseIndices);
  };

  const handlePointerUp = (index) => {
    if (index !== undefined && index !== null) {
      setLastPointerIndex(index);
    }

    if (pendingPasteDragRef.current) {
      pendingPasteDragRef.current = null;
      return;
    }

    if (isPainting && currentTool === TOOLS.SELECT) {
      const endIndex = index ?? shapeCurrentIndex ?? shapeStartIndex;
      if (endIndex !== null && shapeStartIndex !== null) {
        setSelectedIndices(getRectFillIndices(shapeStartIndex, endIndex, activeWidth));
      }
    }

    if (isPainting && (currentTool === TOOLS.LINE || currentTool === TOOLS.SQUARE)) {
      const endIndex = index ?? shapeCurrentIndex ?? shapeStartIndex;
      if (endIndex !== null) commitShape(endIndex);
    }

    if (isEyedropperArmed) {
      setEyedropperPreview(null);
    }

    setShapeStartIndex(null);
    setShapeCurrentIndex(null);
    setIsPainting(false);
  };

  useEffect(() => {
    const stopPendingPasteDrag = () => {
      pendingPasteDragRef.current = null;
    };

    window.addEventListener("pointerup", stopPendingPasteDrag);
    window.addEventListener("pointercancel", stopPendingPasteDrag);
    return () => {
      window.removeEventListener("pointerup", stopPendingPasteDrag);
      window.removeEventListener("pointercancel", stopPendingPasteDrag);
    };
  }, []);

  const addFrame = () => {
    if (!activeProject) return;
    pushUndoSnapshot();

    const insertIndex = activeFrameIndex + 1;
    const updated = getProjectsByBucket(activeProjectBucketKey).map((project) => {
      if (project.id !== activeProject.id) return project;

      const frames = [...project.frames];
      const sourceFrame = [...frames[activeFrameIndex]];
      frames.splice(insertIndex, 0, sourceFrame);
      return { ...project, frames };
    });

    setProjectsBySize((prev) => ({
      ...prev,
      [activeProjectBucketKey]: updated,
    }));
    setActiveFrameIndexByProject((prev) => ({
      ...prev,
      [activeProject.id]: insertIndex,
    }));
  };

  const deleteFrames = (frameIndices) => {
    if (!activeProject) return;
    const sourceFrames = Array.isArray(activeProject.frames) ? activeProject.frames : [];
    if (sourceFrames.length <= 1) return;

    const uniqueRequested = [...new Set(Array.isArray(frameIndices) ? frameIndices : [])]
      .filter((index) => Number.isInteger(index) && index >= 0 && index < sourceFrames.length)
      .sort((a, b) => b - a);

    const maxDeletions = Math.max(0, sourceFrames.length - 1);
    const deletions = uniqueRequested.slice(0, maxDeletions);
    if (deletions.length === 0) return;

    pushUndoSnapshot();

    const projectId = activeProject.id;
    const currentIndex = activeFrameIndexByProject[projectId] || 0;
    let nextFrameIndex = currentIndex;

    const updated = getProjectsByBucket(activeProjectBucketKey).map((project) => {
      if (project.id !== projectId) return project;

      const frames = [...project.frames];
      const validDeletions = deletions.filter((index) => index >= 0 && index < frames.length);
      if (validDeletions.length === 0) return project;

      const ascending = [...validDeletions].sort((a, b) => a - b);
      const removedBeforeCurrent = ascending.filter((index) => index < currentIndex).length;
      const deletedCurrent = ascending.includes(currentIndex);

      validDeletions.forEach((index) => {
        if (index >= 0 && index < frames.length) frames.splice(index, 1);
      });

      if (frames.length <= 0) {
        frames.push(createBlankPixels(project.width, project.height));
        nextFrameIndex = 0;
      } else if (deletedCurrent) {
        const candidate = currentIndex - removedBeforeCurrent;
        nextFrameIndex = Math.max(0, Math.min(candidate, frames.length - 1));
      } else {
        nextFrameIndex = Math.max(0, Math.min(currentIndex - removedBeforeCurrent, frames.length - 1));
      }

      return { ...project, frames };
    });

    setProjectsBySize((prev) => ({
      ...prev,
      [activeProjectBucketKey]: updated,
    }));
    setActiveFrameIndexByProject((prev) => ({
      ...prev,
      [projectId]: nextFrameIndex,
    }));
  };

  const deleteFrame = (frameIndex) => {
    deleteFrames([frameIndex]);
  };

  const getUniqueName = (bucketKey, baseName) => {
    const names = new Set(getProjectsByBucket(bucketKey).map((project) => project.name));
    let candidate = baseName;
    let suffix = 1;

    while (names.has(candidate)) {
      suffix += 1;
      candidate = `${baseName} ${suffix}`;
    }

    return candidate;
  };

  const openCreateModal = () => {
    setNewProjectWidth(clampCanvasSize(CANVAS_SIZES[0]));
    setNewProjectHeight(clampCanvasSize(CANVAS_SIZES[0]));
    setNewProjectName("");
    setIsCreateModalOpen(true);
  };

  const createProjectFromModal = () => {
    pushUndoSnapshot();
    const clampedWidth = clampCanvasSize(newProjectWidth);
    const clampedHeight = clampCanvasSize(newProjectHeight);
    const bucketKey = getProjectBucketKey(clampedWidth, clampedHeight);
    const baseName = newProjectName.trim() || `${clampedWidth} x ${clampedHeight} Pixel File`;
    const name = getUniqueName(bucketKey, baseName);
    const project = createProject(clampedWidth, clampedHeight, name);

    setProjectsBySize((prev) => ({
      ...prev,
      [bucketKey]: [...getProjectsByBucket(bucketKey), project],
    }));
    setActiveProjectId(project.id);
    setActiveFrameIndexByProject((prev) => ({ ...prev, [project.id]: 0 }));
    setIsCreateModalOpen(false);
    setCurrentView("editor");
  };

  const deleteProject = async (projectId) => {
    if (!projectId) return;
    pushUndoSnapshot();

    const nextProjectsBySize = {};
    let deletedProject = null;

    Object.entries(projectsBySize).forEach(([sizeKey, projects]) => {
      const currentProjects = Array.isArray(projects) ? projects : [];
      nextProjectsBySize[sizeKey] = currentProjects.filter((project) => {
        if (project.id === projectId) {
          deletedProject = project;
          return false;
        }
        return true;
      });
    });

    if (!deletedProject) return;

    setProjectsBySize(nextProjectsBySize);
    setActiveFrameIndexByProject((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, projectId)) return prev;
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
    setReferenceOverlayByProject((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, projectId)) return prev;
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
    setProjectCommunityLikes((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, projectId)) return prev;
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
    setPublishedProjectIds((prev) => {
      if (!prev.has(projectId)) return prev;
      const next = new Set(prev);
      next.delete(projectId);
      return next;
    });

    if (activeProjectId === projectId) {
      const fallbackProject = Object.values(nextProjectsBySize).flat()[0] || null;
      setActiveProjectId(fallbackProject?.id || null);
      setSelectedIndices([]);
      setIsAnimationPlaying(false);
      setShapeStartIndex(null);
      setShapeCurrentIndex(null);
      setLastPointerIndex(null);
    }

    if (authUser?.uid) {
      try {
        const communityProjectId = `${authUser.uid}_${projectId}`;
        await deleteDoc(doc(db, COMMUNITY_COLLECTION, communityProjectId));
      } catch (_error) {
        // Ignore cleanup errors. Local delete already succeeded.
      }
    }
  };

  const downloadBlob = (blob, extension) => {
    if (!blob || !activeProject) return;

    const safeName = activeProject.name.replace(/[\\/:"*?<>|]/g, "_");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${safeName}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportFile = async (format) => {
    if (!activeProject) return;

    if (format === "cur") {
      const blob = await buildCurBlob(activeProject, activeFrame);
      downloadBlob(blob, "cur");
      return;
    }

    if (format === "png") {
      const blob = await buildPngBlob(activeProject, activeFrame);
      downloadBlob(blob, "png");
      return;
    }

    if (format === "gif") {
      const blob = await buildGifBlob(activeProject, fps);
      downloadBlob(blob, "gif");
      return;
    }

    if (format === "sheet") {
      const blob = await buildSpriteSheetPngBlob(activeProject);
      downloadBlob(blob, "spritesheet.png");
      return;
    }

    if (format === "json") {
      const blob = buildJsonBlob(activeProject);
      downloadBlob(blob, "json");
    }
  };

  const handleReferenceUpload = (event) => {
    if (!activeProject?.id) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsColorMenuPinnedOpen(false);
    setIsEyedropperArmed(false);
    setEyedropperPreview(null);
    setCurrentTool(TOOLS.SELECT);

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) return;
      const image = new window.Image();
      image.onload = () => {
        const fittedTransform = getReferenceFitTransform(image.naturalWidth, image.naturalHeight);
        setReferenceOverlayByProject((prev) => ({
          ...(prev || {}),
          [activeProject.id]: {
            src: result,
            opacity: 0.5,
            ...clampReferenceTransform(fittedTransform),
          },
        }));
      };
      image.onerror = () => {
        setReferenceOverlayByProject((prev) => ({
          ...prev,
          [activeProject.id]: {
            src: result,
            opacity: 0.5,
            ...clampReferenceTransform(DEFAULT_REFERENCE_TRANSFORM),
          },
        }));
      };
      image.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleGoHome = () => {
    setActiveProjectId(null);
    setCurrentView("home");
    setSelectedIndices([]);
    setIsAnimationPlaying(false);
  };

  const openReferenceImagePicker = () => {
    if (!activeProject) return;
    referenceUploadInputRef.current?.click();
  };

  const setReferenceOpacity = (value) => {
    if (!activeProject?.id) return;
    setReferenceOverlayByProject((prev) => {
      const current = prev[activeProject.id];
      if (!current) return prev;
      return {
        ...prev,
        [activeProject.id]: {
          ...current,
          opacity: Math.max(0, Math.min(1, Number(value) || 0)),
        },
      };
    });
  };

  const setReferenceTransform = (nextTransform) => {
    if (!activeProject?.id) return;
    setReferenceOverlayByProject((prev) => {
      const current = prev[activeProject.id];
      if (!current) return prev;
      const sourceTransform =
        typeof nextTransform === "function"
          ? nextTransform({
              x: current.x,
              y: current.y,
              width: current.width,
              height: current.height,
              rotation: current.rotation,
              layer: current.layer,
              flipX: current.flipX,
              flipY: current.flipY,
            })
          : nextTransform;

      return {
        ...prev,
        [activeProject.id]: {
          ...current,
          ...clampReferenceTransform({
            ...current,
            ...sourceTransform,
          }),
        },
      };
    });
  };

  const resetReferenceTransform = () => {
    setReferenceTransform(DEFAULT_REFERENCE_TRANSFORM);
  };

  const toggleReferenceLayer = () => {
    setReferenceTransform((current) => ({
      layer: current?.layer === "top" ? "behind" : "top",
    }));
  };

  const clearReferenceOverlay = () => {
    if (!activeProject?.id) return;
    setReferenceOverlayByProject((prev) => {
      if (!prev[activeProject.id]) return prev;
      const next = { ...prev };
      delete next[activeProject.id];
      return next;
    });
  };

  const flipReferenceHorizontal = () => {
    setReferenceTransform((current) => ({
      flipX: !current?.flipX,
    }));
  };

  const flipReferenceVertical = () => {
    setReferenceTransform((current) => ({
      flipY: !current?.flipY,
    }));
  };

  const addPaletteColor = () => {
    if (palette.includes(pickerColor)) {
      setBrushColor(pickerColor);
      return;
    }

    setPalette((prev) => [...prev, pickerColor]);
    setBrushColor(pickerColor);
  };

  const handleSelectColor = (nextColor) => {
    const normalized = normalizeHexColor(nextColor);
    if (!normalized) return;
    setPickerColor(normalized);
    setBrushColor(normalized);
    setCustomHexInput(normalized);
    setIsEyedropperArmed(false);
  };

  const openCustomColorPicker = () => {
    const hsv = hexToHsv(currentPickerColorInputValue);
    setCustomHue(hsv.h);
    setCustomSaturation(hsv.s);
    setCustomValue(hsv.v);
    setCustomHexInput(currentPickerColorInputValue);
    setIsCustomColorPickerOpen(true);
  };

  const applyCustomHsvColor = (nextHue, nextSaturation, nextValue) => {
    const nextHex = hsvToHex(nextHue, nextSaturation, nextValue);
    handleSelectColor(nextHex);
  };

  const handleCustomHexInputChange = (value) => {
    setCustomHexInput(value);
    const normalized = normalizeHexColor(value);
    if (!normalized) return;

    const hsv = hexToHsv(normalized);
    setCustomHue(hsv.h);
    setCustomSaturation(hsv.s);
    setCustomValue(hsv.v);
    handleSelectColor(normalized);
  };

  const updateCustomSvFromPointer = (clientX, clientY) => {
    if (!customSvAreaRef.current) return;
    const rect = customSvAreaRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = clampChannel(clientX - rect.left, 0, rect.width);
    const y = clampChannel(clientY - rect.top, 0, rect.height);
    const nextSaturation = Math.round((x / rect.width) * 100);
    const nextValue = Math.round(100 - (y / rect.height) * 100);

    setCustomSaturation(nextSaturation);
    setCustomValue(nextValue);
    applyCustomHsvColor(customHue, nextSaturation, nextValue);
  };

  const handleCustomPaletteSlotClick = (slotIndex) => {
    const slotColor = customPalette[slotIndex];
    if (slotColor) {
      handleSelectColor(slotColor);
      return;
    }

    setCustomPalette((prev) => {
      const next = prev.map((entry, index) => (index === slotIndex ? pickerColor : entry));
      if (next.every((entry) => entry !== null)) {
        return [...next, ...Array.from({ length: CUSTOM_PALETTE_SLOTS }, () => null)];
      }
      return next;
    });
  };

  const getSelectionBounds = (indices) => {
    if (!indices || indices.length === 0) return null;

    let minX = activeWidth;
    let minY = activeHeight;
    let maxX = 0;
    let maxY = 0;

    indices.forEach((index) => {
      const { x, y } = toXY(index, activeWidth);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });

    return { minX, minY, maxX, maxY };
  };

  const copySelection = () => {
    if (pendingPaste) {
      setClipboard({
        width: pendingPaste.width,
        height: pendingPaste.height,
        pixels: [...pendingPaste.pixels],
      });
      return;
    }

    if (!activeProject || selectedIndices.length === 0) return;

    const bounds = getSelectionBounds(selectedIndices);
    if (!bounds) return;

    const width = bounds.maxX - bounds.minX + 1;
    const height = bounds.maxY - bounds.minY + 1;
    const pixels = [];

    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        pixels.push(activeFrame[toIndex(x, y, activeWidth)]);
      }
    }

    setClipboard({ width, height, pixels });
  };

  const pasteClipboard = () => {
    if (!activeProject || !clipboard) return;

    const anchorIndex = lastPointerIndex ?? selectedIndices[0] ?? 0;
    const anchor = toXY(anchorIndex, activeWidth);
    const clampedAnchor = clampPendingPasteAnchor(anchor.x, anchor.y, clipboard.width, clipboard.height);

    setPendingPaste({
      width: clipboard.width,
      height: clipboard.height,
      pixels: [...clipboard.pixels],
      anchorX: clampedAnchor.x,
      anchorY: clampedAnchor.y,
    });
    setCurrentTool(TOOLS.SELECT);
  };

  const commitPendingPaste = () => {
    if (!activeProject || !pendingPaste) return;
    pushUndoSnapshot();

    updateActiveFrame((framePixels) => {
      const next = [...framePixels];

      for (let y = 0; y < pendingPaste.height; y += 1) {
        for (let x = 0; x < pendingPaste.width; x += 1) {
          const targetX = pendingPaste.anchorX + x;
          const targetY = pendingPaste.anchorY + y;
          if (targetX < 0 || targetX >= activeWidth || targetY < 0 || targetY >= activeHeight) continue;
          const sourceIndex = y * pendingPaste.width + x;
          next[toIndex(targetX, targetY, activeWidth)] = pendingPaste.pixels[sourceIndex];
        }
      }

      return next;
    });

    setSelectedIndices(pendingPastePreviewIndices);
    setPendingPaste(null);
    pendingPasteDragRef.current = null;
  };

  useEffect(() => {
    const isEditableTarget = (target) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
    };

    const onKeyDown = (event) => {
      if (!authUser || isEditableTarget(event.target)) return;

      if (event.key === "Enter" && pendingPaste) {
        event.preventDefault();
        commitPendingPaste();
        return;
      }

      if (event.key === "Escape" && pendingPaste) {
        event.preventDefault();
        setPendingPaste(null);
        pendingPasteDragRef.current = null;
        return;
      }

      const commandKey = event.metaKey || event.ctrlKey;
      if (!commandKey) return;

      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        undoLastChange();
        return;
      }

      if (key === "c") {
        event.preventDefault();
        copySelection();
        return;
      }

      if (key === "v") {
        event.preventDefault();
        pasteClipboard();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [authUser, commitPendingPaste, copySelection, pasteClipboard, pendingPaste]);

  const signInWithGoogle = async () => {
    try {
      setAuthError("");
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      setAuthError(error?.message || "Login failed. Please try again.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      setAuthError(error?.message || "Logout failed. Please try again.");
    }
  };

  const publishProjectToCommunity = async (project) => {
    if (!authUser?.uid || !project) return;

    const communityProjectId = `${authUser.uid}_${project.id}`;
    const communityRef = doc(db, COMMUNITY_COLLECTION, communityProjectId);
    setPublishingProjectId(project.id);
    let existingUpvotes = 0;

    try {
      await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(communityRef);
        if (existing.exists()) {
          const existingData = existing.data() || {};
          existingUpvotes = Math.max(0, Number(existingData.upvotes) || 0);
        }
        const baseData = {
          ownerUid: authUser.uid,
          authorName: authUser.displayName || authUser.email || "Anonymous",
          name: project.name,
          width: project.width,
          height: project.height,
          frameCount: project.frames?.length || 1,
          previewPixels: getProjectPreviewPixels(project),
          previewFrameStrings: getProjectPreviewFrameStrings(project),
          updatedAt: serverTimestamp(),
        };

        if (existing.exists()) {
          transaction.update(communityRef, baseData);
        } else {
          transaction.set(communityRef, {
            ...baseData,
            upvoterIds: [],
            upvotes: 0,
          });
        }
      });
      setPublishedProjectIds((prev) => {
        const next = new Set(prev);
        next.add(project.id);
        return next;
      });
      setProjectCommunityLikes((prev) => ({
        ...prev,
        [project.id]: prev[project.id] ?? existingUpvotes ?? 0,
      }));
      setCommunityError("");
    } catch (_error) {
      setCommunityError("Could not publish project.");
    } finally {
      setPublishingProjectId(null);
    }
  };

  const toggleCommunityUpvote = async (projectId) => {
    if (!authUser?.uid || !projectId) return;

    const projectRef = doc(db, COMMUNITY_COLLECTION, projectId);
    let previousProject = null;

    setCommunityProjects((prev) => {
      const updated = prev
        .map((project) => {
          if (project.id !== projectId) return project;
          previousProject = project;
          const hasUpvoted = !project.hasUpvoted;
          return {
            ...project,
            hasUpvoted,
            upvotes: Math.max(0, project.upvotes + (hasUpvoted ? 1 : -1)),
          };
        })
        .sort((a, b) => b.upvotes - a.upvotes);
      return updated;
    });

    try {
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(projectRef);
        if (!snapshot.exists()) return;

        const data = snapshot.data() || {};
        const existingUpvoterIds = Array.isArray(data.upvoterIds) ? data.upvoterIds : [];
        const hasUpvoted = existingUpvoterIds.includes(authUser.uid);
        const shouldUpvote = !hasUpvoted;
        const nextUpvotes = Math.max(0, (Number(data.upvotes) || 0) + (shouldUpvote ? 1 : -1));

        transaction.update(projectRef, {
          upvotes: nextUpvotes,
          upvoterIds: shouldUpvote ? arrayUnion(authUser.uid) : arrayRemove(authUser.uid),
          updatedAt: serverTimestamp(),
        });
      });
    } catch (_error) {
      if (previousProject) {
        setCommunityProjects((prev) =>
          prev
            .map((project) => (project.id === projectId ? previousProject : project))
            .sort((a, b) => b.upvotes - a.upvotes)
        );
      }
      setCommunityError("Could not register vote.");
    }
  };

  if (authLoading) {
    return (
      <main className="app-shell">
        <div className="auth-card">
          <h1>Loading</h1>
        </div>
      </main>
    );
  }

  if (!authUser) {
    return (
      <main className="app-shell">
        <div className="auth-card">
          <p className="eyebrow">Pixel Forge</p>
          <h1>Sign in required</h1>
          <p className="subtitle">Please sign in before using the pixel editor.</p>
          <button className="primary-button auth-button" onClick={signInWithGoogle}>
            Continue with Google
          </button>
          {authError && <p className="auth-error">{authError}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      {(currentView === "home" && !activeProject) ? (
        <HomePage
          authUser={authUser}
          projects={allProjects}
          publishedProjectIds={publishedProjectIds}
          projectCommunityLikes={projectCommunityLikes}
          publishingProjectId={publishingProjectId}
          onCreateProject={openCreateModal}
          onOpenProject={(projectId) => {
            setActiveProjectId(projectId);
            setIsAnimationPlaying(false);
            setCurrentView("editor");
          }}
          onOpenEditor={() => setCurrentView("editor")}
          onPublishProject={publishProjectToCommunity}
          onDeleteProject={deleteProject}
          communityProjects={communityProjects}
          communityLoading={communityLoading}
          communityError={communityError}
          onToggleUpvote={toggleCommunityUpvote}
        />
      ) : (
        <div className="workspace">
          <input
            ref={referenceUploadInputRef}
            type="file"
            accept="image/*"
            className="reference-file-input"
            onChange={handleReferenceUpload}
            aria-hidden="true"
            tabIndex={-1}
          />
          <div className="icon-action-toolbar-left">
            <IconActionButton
              icon={House}
              iconSize={16}
              className="home-return-button"
              ariaLabel="Back to homescreen"
              title="Back to homescreen"
              onClick={handleGoHome}
            />
          </div>
          <div className="icon-action-toolbar-center">
            <div className={`icon-action-color-control ${(isEyedropperArmed || isColorMenuPinnedOpen) ? "menu-open" : ""}`}>
              <IconActionButton
                className="icon-action-color-button"
                ariaLabel="Color"
                title="Color"
                style={{
                  backgroundColor: brushColor === TRANSPARENT ? "#2a2d35" : brushColor,
                }}
              />
              <div className="icon-action-color-menu" role="menu" aria-label="Color options">
                <div className="icon-action-color-grid">
                  {palette.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`icon-action-color-swatch ${brushColor === color ? "active" : ""}`}
                      onClick={() => handleSelectColor(color)}
                      aria-label={`Select color ${color}`}
                      style={{
                        backgroundColor: color === TRANSPARENT ? "transparent" : color,
                      }}
                    />
                  ))}
                </div>
                <div className="icon-action-custom-picker-wrap">
                  <span className="icon-action-custom-label">Custom colors</span>
                  <div className="icon-action-custom-picker-actions">
                    <button
                      type="button"
                      className="icon-action-color-picker-gradient"
                      aria-label="Open custom color picker"
                      onClick={() => {
                        if (isCustomColorPickerOpen) {
                          setIsCustomColorPickerOpen(false);
                        } else {
                          openCustomColorPicker();
                        }
                      }}
                    />
                    <IconActionButton
                      icon={Pipette}
                      iconSize={14}
                      className="icon-action-color-pipette"
                      isActive={isEyedropperArmed}
                      ariaLabel="Eyedropper: click a canvas pixel to sample color"
                      title="Eyedropper"
                      onClick={() => {
                        setIsEyedropperArmed((prev) => {
                          const next = !prev;
                          if (next) {
                            setIsColorMenuPinnedOpen(true);
                          } else {
                            setIsColorMenuPinnedOpen(false);
                            setEyedropperPreview(null);
                          }
                          return next;
                        });
                      }}
                    />
                  </div>
                  <div className={`icon-action-custom-picker-popover ${isCustomColorPickerOpen ? "open" : ""}`}>
                    <div
                      ref={customSvAreaRef}
                      className="icon-action-custom-sv-area"
                      style={{ backgroundColor: `hsl(${customHue} 100% 50%)` }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        updateCustomSvFromPointer(event.clientX, event.clientY);

                        const onPointerMove = (moveEvent) => {
                          updateCustomSvFromPointer(moveEvent.clientX, moveEvent.clientY);
                        };

                        const onPointerUp = () => {
                          window.removeEventListener("pointermove", onPointerMove);
                        };

                        window.addEventListener("pointermove", onPointerMove);
                        window.addEventListener("pointerup", onPointerUp, { once: true });
                      }}
                    >
                      <span
                        className="icon-action-custom-sv-handle"
                        style={{
                          left: `${customSaturation}%`,
                          top: `${100 - customValue}%`,
                        }}
                      />
                    </div>
                    <div
                      className="icon-action-custom-preview"
                      style={{ backgroundColor: customPickerPreviewColor }}
                    />
                    <label className="icon-action-custom-hue-control">
                      <span>Hue</span>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={customHue}
                        onChange={(event) => {
                          const nextHue = Number(event.target.value);
                          setCustomHue(nextHue);
                          applyCustomHsvColor(nextHue, customSaturation, customValue);
                        }}
                      />
                    </label>
                    <label className="icon-action-custom-hex-control">
                      <span>HEX</span>
                      <input
                        type="text"
                        value={customHexInput}
                        onChange={(event) => handleCustomHexInputChange(event.target.value)}
                        onBlur={() => {
                          const normalized = normalizeHexColor(customHexInput);
                          if (!normalized) {
                            setCustomHexInput(currentPickerColorInputValue);
                          }
                        }}
                        placeholder="#ffffff"
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                      />
                    </label>
                  </div>
                </div>
                <span className="icon-action-custom-label icon-action-custom-palette-label">Custom pallete</span>
                <div className="icon-action-custom-grid">
                  {customPalette.map((color, index) => (
                    <button
                      key={`custom-color-slot-${index}`}
                      type="button"
                      className={`icon-action-custom-swatch ${color ? "filled" : "empty"} ${color && brushColor === color ? "active" : ""}`}
                      onClick={() => handleCustomPaletteSlotClick(index)}
                      aria-label={color ? `Use custom color ${color}` : "Save current color to custom slot"}
                      style={color ? { backgroundColor: color } : undefined}
                    />
                  ))}
                </div>
              </div>
            </div>
            <IconActionButton
              icon={Pencil}
              iconSize={16}
              isActive={currentTool === TOOLS.BRUSH}
              title="Pencil"
              ariaLabel="Pencil"
              onClick={() => selectTool(TOOLS.BRUSH)}
            />
            <IconActionButton
              icon={Eraser}
              iconSize={16}
              isActive={currentTool === TOOLS.ERASER}
              title="Eraser"
              ariaLabel="Eraser"
              onClick={() => selectTool(TOOLS.ERASER)}
            />
            <IconActionButton
              icon={Square}
              iconSize={16}
              isActive={currentTool === TOOLS.SQUARE}
              title="Square"
              ariaLabel="Square"
              onClick={() => selectTool(TOOLS.SQUARE)}
            />
            <IconActionButton
              icon={PaintBucket}
              iconSize={16}
              isActive={currentTool === TOOLS.BUCKET}
              title="Paint bucket"
              ariaLabel="Paint bucket"
              onClick={() => selectTool(TOOLS.BUCKET)}
            />
            <IconActionButton
              icon={ImageIcon}
              iconSize={16}
              title="Image"
              ariaLabel="Image"
              onClick={openReferenceImagePicker}
            />
            <IconActionButton
              icon={MousePointer2}
              iconSize={16}
              isActive={currentTool === TOOLS.SELECT}
              title="Select"
              ariaLabel="Select"
              onClick={() => selectTool(TOOLS.SELECT)}
            />
            <IconActionButton
              icon={Grid3x3}
              iconSize={16}
              isActive={isGridVisible}
              title={isGridVisible ? "Hide grid" : "Show grid"}
              ariaLabel={isGridVisible ? "Hide grid" : "Show grid"}
              onClick={() => setIsGridVisible((prev) => !prev)}
            />
            <IconActionButton
              icon={Clapperboard}
              iconSize={16}
              isActive={isAnimationPanelOpen}
              title={isAnimationPanelOpen ? "Hide animation drawer" : "Show animation drawer"}
              ariaLabel={isAnimationPanelOpen ? "Hide animation drawer" : "Show animation drawer"}
              onClick={() => setIsAnimationPanelOpen((prev) => !prev)}
            />
          </div>
          <div className="icon-action-toolbar-right">
            <IconActionButton
              icon={
                isSaving ? Loader2 : saveState === "saved" ? Check : Save
              }
              iconSize={16}
              iconClassName={isSaving ? "icon-action-spinner" : ""}
              className={saveState === "saved" ? "save-success" : ""}
              title={isSaving ? "Saving..." : saveState === "saved" ? "Saved" : "Save"}
              ariaLabel={isSaving ? "Saving..." : saveState === "saved" ? "Saved" : "Save"}
              disabled={isSaving || !hasUnsavedChanges}
              onClick={() => void saveChanges()}
            />
          </div>
          <EditorPanel
            activeProject={activeProject}
            projectCount={allProjects.length}
            activeFrame={frameWithPendingPaste}
            selectedIndices={selectedIndexSet}
            activeFrameIndex={activeFrameIndex}
            isGridVisible={isGridVisible}
            isPointerToolActive={currentTool === TOOLS.SELECT}
            onOpenCreateModal={openCreateModal}
            onPointerDown={handlePointerDown}
            onPointerEnter={handlePointerEnter}
            onPixelHover={handlePixelHover}
            onPointerUp={handlePointerUp}
            onStopPainting={() => handlePointerUp()}
            isAnimationPanelOpen={isAnimationPanelOpen}
            onAddFrame={addFrame}
            onAnimationPlayToggle={() => setIsAnimationPlaying((prev) => !prev)}
            isAnimationPlaying={isAnimationPlaying}
            fps={fps}
            onFpsChange={(value) => {
              const parsed = Number(value);
              if (Number.isNaN(parsed)) return;
              setFps(Math.max(1, Math.min(60, parsed)));
            }}
            onSelectFrame={(index) => {
              if (!activeProject) return;
              setIsAnimationPlaying(false);
              setActiveFrameIndexByProject((prev) => ({
                ...prev,
                [activeProject.id]: index,
              }));
            }}
            onDeleteFrame={(index) => {
              setIsAnimationPlaying(false);
              deleteFrame(index);
            }}
            onDeleteFrames={(indices) => {
              setIsAnimationPlaying(false);
              deleteFrames(indices);
            }}
            referenceImage={activeProject ? referenceOverlayByProject[activeProject.id]?.src : ""}
            referenceOpacity={activeProject ? referenceOverlayByProject[activeProject.id]?.opacity ?? 0.5 : 0.5}
            referenceTransform={
              activeProject
                ? clampReferenceTransform({
                    ...DEFAULT_REFERENCE_TRANSFORM,
                    ...referenceOverlayByProject[activeProject.id],
                  })
                : DEFAULT_REFERENCE_TRANSFORM
            }
            onReferenceUpload={handleReferenceUpload}
            onReferenceOpacityChange={setReferenceOpacity}
            onReferenceTransformChange={setReferenceTransform}
            onReferenceResetTransform={resetReferenceTransform}
            onReferenceLayerToggle={toggleReferenceLayer}
            onReferenceFlipHorizontal={flipReferenceHorizontal}
            onReferenceFlipVertical={flipReferenceVertical}
            onClearReference={clearReferenceOverlay}
          />
          {isEyedropperArmed && eyedropperPreview ? (
            <div
              className={`eyedropper-cursor-preview ${eyedropperPreview.color === TRANSPARENT ? "transparent" : ""}`}
              style={{
                left: `${eyedropperPreview.x}px`,
                top: `${eyedropperPreview.y}px`,
                backgroundColor: eyedropperPreview.color === TRANSPARENT ? undefined : eyedropperPreview.color,
              }}
              aria-hidden="true"
            />
          ) : null}

        </div>
      )}

      <CreateFileModal
        isOpen={isCreateModalOpen}
        newProjectName={newProjectName}
        setNewProjectName={setNewProjectName}
        newProjectWidth={newProjectWidth}
        setNewProjectWidth={setNewProjectWidth}
        newProjectHeight={newProjectHeight}
        setNewProjectHeight={setNewProjectHeight}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={createProjectFromModal}
      />
    </main>
  );
}

export default App;
