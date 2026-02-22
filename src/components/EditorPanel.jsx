import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Blend,
  FilePlus2,
  FlipHorizontal2,
  FlipVertical2,
  Trash2,
} from "lucide-react";
import { TRANSPARENT } from "../lib/pixelEditor";
import AnimationPanel from "./AnimationPanel";

const REFERENCE_MIN_SIZE_PERCENT = 2;
const REFERENCE_RESIZE_HANDLES = [
  { direction: "nw", label: "Resize from top left corner" },
  { direction: "n", label: "Resize from top edge" },
  { direction: "ne", label: "Resize from top right corner" },
  { direction: "e", label: "Resize from right edge" },
  { direction: "se", label: "Resize from bottom right corner" },
  { direction: "s", label: "Resize from bottom edge" },
  { direction: "sw", label: "Resize from bottom left corner" },
  { direction: "w", label: "Resize from left edge" },
];

function EditorPanel({
  activeProject,
  projectCount,
  activeFrame,
  selectedIndices,
  activeFrameIndex,
  isGridVisible,
  isPointerToolActive,
  onOpenCreateModal,
  onPointerDown,
  onPointerEnter,
  onPixelHover,
  onPointerUp,
  onStopPainting,
  isAnimationPanelOpen,
  onAddFrame,
  onAnimationPlayToggle,
  isAnimationPlaying,
  fps,
  onFpsChange,
  onSelectFrame,
  onDeleteFrame,
  onDeleteFrames,
  referenceImage,
  referenceOpacity,
  referenceTransform,
  onReferenceUpload,
  onReferenceOpacityChange,
  onReferenceTransformChange,
  onReferenceResetTransform,
  onReferenceLayerToggle,
  onReferenceFlipHorizontal,
  onReferenceFlipVertical,
  onClearReference,
}) {
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 4;
  const ZOOM_STEP = 0.4;
  const PAN_SENSITIVITY = 0.45;
  const PINCH_ZOOM_FACTOR = 0.006;
  const activeWidth = Math.max(1, Number(activeProject?.width) || Number(activeProject?.size) || 16);
  const activeHeight = Math.max(1, Number(activeProject?.height) || Number(activeProject?.size) || 16);
  const pixelSizeStyle = { "--grid-width": activeWidth, "--grid-height": activeHeight };
  const frames = activeProject?.frames || [];
  const [zoomLevel, setZoomLevel] = useState(1);
  const referenceInputRef = useRef(null);
  const canvasFrameRef = useRef(null);
  const canvasScrollRef = useRef(null);
  const referenceDragRef = useRef(null);
  const lastCenteredProjectIdRef = useRef("");
  const lastGestureScaleRef = useRef(1);
  const [isReferenceAdjustMode, setIsReferenceAdjustMode] = useState(false);
  const lastReferenceImageRef = useRef("");
  const activeReferenceTransform = {
    x: Number(referenceTransform?.x) || 0,
    y: Number(referenceTransform?.y) || 0,
    width: Number(referenceTransform?.width) || 100,
    height: Number(referenceTransform?.height) || 100,
    rotation: Number(referenceTransform?.rotation) || 360,
    layer: referenceTransform?.layer === "top" ? "top" : "behind",
    flipX: Boolean(referenceTransform?.flipX),
    flipY: Boolean(referenceTransform?.flipY),
  };
  const canAdjustReference = Boolean(referenceImage) && (isReferenceAdjustMode || isPointerToolActive);
  const clampZoom = (value) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value) || 1));

  useEffect(() => {
    const onPointerMove = (event) => {
      const dragState = referenceDragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      event.preventDefault();

      const dx = event.clientX - dragState.startClientX;
      const dy = event.clientY - dragState.startClientY;
      const deltaXPercent = dragState.frameWidth > 0 ? (dx / dragState.frameWidth) * 100 : 0;
      const deltaYPercent = dragState.frameHeight > 0 ? (dy / dragState.frameHeight) * 100 : 0;

      if (dragState.mode === "move") {
        onReferenceTransformChange({
          x: dragState.startX + deltaXPercent,
          y: dragState.startY + deltaYPercent,
        });
        return;
      }

      if (dragState.mode === "rotate") {
        const currentAngle =
          (Math.atan2(event.clientY - dragState.centerClientY, event.clientX - dragState.centerClientX) * 180) /
          Math.PI;
        const angleDelta = currentAngle - dragState.startPointerAngle;
        let nextRotation = dragState.startRotation + angleDelta;
        if (event.shiftKey) {
          nextRotation = Math.round(nextRotation / 15) * 15;
        }
        let normalizedRotation = ((nextRotation % 360) + 360) % 360;
        if (normalizedRotation === 0) normalizedRotation = 360;
        onReferenceTransformChange({ rotation: normalizedRotation });
        return;
      }

      const direction = dragState.resizeDirection || "se";
      const hasNorth = direction.includes("n");
      const hasSouth = direction.includes("s");
      const hasWest = direction.includes("w");
      const hasEast = direction.includes("e");
      const isHorizontalOnly = !hasNorth && !hasSouth && (hasEast || hasWest);
      const isVerticalOnly = !hasWest && !hasEast && (hasNorth || hasSouth);
      const aspectRatio = dragState.startAspectRatio || 1;

      let nextWidth = dragState.startWidth;
      let nextHeight = dragState.startHeight;

      if (hasEast) nextWidth += deltaXPercent;
      if (hasWest) nextWidth -= deltaXPercent;
      if (hasSouth) nextHeight += deltaYPercent;
      if (hasNorth) nextHeight -= deltaYPercent;

      if (event.shiftKey) {
        if (isHorizontalOnly) {
          nextHeight = nextWidth / aspectRatio;
        } else if (isVerticalOnly) {
          nextWidth = nextHeight * aspectRatio;
        } else {
          const widthDeltaRatio = dragState.startWidth > 0 ? Math.abs((nextWidth - dragState.startWidth) / dragState.startWidth) : 0;
          const heightDeltaRatio = dragState.startHeight > 0 ? Math.abs((nextHeight - dragState.startHeight) / dragState.startHeight) : 0;

          if (widthDeltaRatio >= heightDeltaRatio) {
            nextHeight = nextWidth / aspectRatio;
          } else {
            nextWidth = nextHeight * aspectRatio;
          }
        }
      }

      nextWidth = Math.max(REFERENCE_MIN_SIZE_PERCENT, nextWidth);
      nextHeight = Math.max(REFERENCE_MIN_SIZE_PERCENT, nextHeight);

      let nextX = dragState.startX;
      let nextY = dragState.startY;

      if (hasWest) {
        nextX = dragState.startX + (dragState.startWidth - nextWidth);
      } else if (event.shiftKey && isVerticalOnly) {
        nextX = dragState.startX - (nextWidth - dragState.startWidth) / 2;
      }

      if (hasNorth) {
        nextY = dragState.startY + (dragState.startHeight - nextHeight);
      } else if (event.shiftKey && isHorizontalOnly) {
        nextY = dragState.startY - (nextHeight - dragState.startHeight) / 2;
      }

      onReferenceTransformChange({
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
      });
    };

    const stopDrag = (event) => {
      const dragState = referenceDragRef.current;
      if (!dragState) return;
      if (event.pointerId !== undefined && event.pointerId !== dragState.pointerId) return;
      referenceDragRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [onReferenceTransformChange]);

  useEffect(() => {
    if (!referenceImage) {
      setIsReferenceAdjustMode(false);
      lastReferenceImageRef.current = "";
      return;
    }

    if (referenceImage !== lastReferenceImageRef.current) {
      setIsReferenceAdjustMode(true);
      lastReferenceImageRef.current = referenceImage;
    }
  }, [referenceImage]);

  useEffect(() => {
    if (!isReferenceAdjustMode || !referenceImage) return;

    const onKeyDown = (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      setIsReferenceAdjustMode(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isReferenceAdjustMode, referenceImage]);

  useEffect(() => {
    if (isPointerToolActive) return;
    setIsReferenceAdjustMode(false);
  }, [isPointerToolActive]);

  useEffect(() => {
    const scrollContainer = canvasScrollRef.current;
    if (!scrollContainer) return;

    const onGestureStart = (event) => {
      event.preventDefault();
      lastGestureScaleRef.current = event.scale || 1;
    };

    const onGestureChange = (event) => {
      event.preventDefault();
      const currentScale = event.scale || 1;
      const lastScale = lastGestureScaleRef.current || 1;
      const scaleDelta = currentScale / lastScale;
      lastGestureScaleRef.current = currentScale;
      setZoomLevel((prev) => clampZoom(prev * scaleDelta));
    };

    const onGestureEnd = (event) => {
      event.preventDefault();
      lastGestureScaleRef.current = 1;
    };

    scrollContainer.addEventListener("gesturestart", onGestureStart, { passive: false });
    scrollContainer.addEventListener("gesturechange", onGestureChange, { passive: false });
    scrollContainer.addEventListener("gestureend", onGestureEnd, { passive: false });

    return () => {
      scrollContainer.removeEventListener("gesturestart", onGestureStart);
      scrollContainer.removeEventListener("gesturechange", onGestureChange);
      scrollContainer.removeEventListener("gestureend", onGestureEnd);
    };
  }, []);

  useEffect(() => {
    const scrollContainer = canvasScrollRef.current;
    const projectId = activeProject?.id || "";
    if (!scrollContainer || !projectId) return;
    if (lastCenteredProjectIdRef.current === projectId) return;
    lastCenteredProjectIdRef.current = projectId;

    const centerCanvasView = () => {
      scrollContainer.scrollLeft = Math.max(0, (scrollContainer.scrollWidth - scrollContainer.clientWidth) / 2);
      scrollContainer.scrollTop = Math.max(0, (scrollContainer.scrollHeight - scrollContainer.clientHeight) / 2);
    };

    centerCanvasView();
    window.requestAnimationFrame(centerCanvasView);
  }, [activeProject?.id]);

  useEffect(() => {
    const scrollContainer = canvasScrollRef.current;
    if (!scrollContainer) return;

    const onWheel = (event) => {
      const isPinchGesture = event.ctrlKey;
      const isShiftScrollZoom = event.shiftKey;
      if (!isPinchGesture && !isShiftScrollZoom) {
        event.preventDefault();
        event.stopPropagation();
        scrollContainer.scrollLeft += event.deltaX * PAN_SENSITIVITY;
        scrollContainer.scrollTop += event.deltaY * PAN_SENSITIVITY;
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (isPinchGesture) {
        const deltaY = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 800 : event.deltaY;
        const pinchFactor = Math.exp(-deltaY * PINCH_ZOOM_FACTOR);
        setZoomLevel((prev) => clampZoom(prev * pinchFactor));
        return;
      }

      const step = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      setZoomLevel((prev) => clampZoom(Number((prev + step).toFixed(2))));
    };

    scrollContainer.addEventListener("wheel", onWheel, { passive: false });
    return () => scrollContainer.removeEventListener("wheel", onWheel);
  }, []);

  const beginReferenceTransform = (mode, event, resizeDirection = "se") => {
    if (!canAdjustReference) return;
    if (event.button !== 0) return;
    const frame = canvasFrameRef.current;
    if (!frame) return;
    const frameRect = frame.getBoundingClientRect();
    event.preventDefault();
    event.stopPropagation();

    const startCenterClientX =
      frameRect.left + ((activeReferenceTransform.x + activeReferenceTransform.width / 2) / 100) * frameRect.width;
    const startCenterClientY =
      frameRect.top + ((activeReferenceTransform.y + activeReferenceTransform.height / 2) / 100) * frameRect.height;
    const startPointerAngle =
      (Math.atan2(event.clientY - startCenterClientY, event.clientX - startCenterClientX) * 180) / Math.PI;

    referenceDragRef.current = {
      mode,
      resizeDirection,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      frameWidth: frameRect.width,
      frameHeight: frameRect.height,
      startX: activeReferenceTransform.x,
      startY: activeReferenceTransform.y,
      startWidth: activeReferenceTransform.width,
      startHeight: activeReferenceTransform.height,
      startRotation: activeReferenceTransform.rotation,
      centerClientX: startCenterClientX,
      centerClientY: startCenterClientY,
      startPointerAngle,
      startAspectRatio:
        activeReferenceTransform.height > 0
          ? activeReferenceTransform.width / activeReferenceTransform.height
          : 1,
    };
  };

  const referenceOverlayNode = referenceImage ? (
    <div
      className={`reference-overlay-wrap ${
        canAdjustReference ? "adjust-mode" : ""
      } layer-${activeReferenceTransform.layer}`}
      style={{
        left: `${activeReferenceTransform.x}%`,
        top: `${activeReferenceTransform.y}%`,
        width: `${activeReferenceTransform.width}%`,
        height: `${activeReferenceTransform.height}%`,
      }}
      onPointerDown={(event) => beginReferenceTransform("move", event)}
    >
      <div className="reference-overlay-actions">
        <button
          type="button"
          className="icon-action-button reference-action-button"
          title="Bring above pixels"
          aria-label="Bring above pixels"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onReferenceTransformChange?.({ layer: "top" });
          }}
        >
          <ArrowUpToLine size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-action-button reference-action-button"
          title="Send below pixels"
          aria-label="Send below pixels"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onReferenceTransformChange?.({ layer: "behind" });
          }}
        >
          <ArrowDownToLine size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-action-button reference-action-button"
          title="Flip horizontal"
          aria-label="Flip horizontal"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onReferenceFlipHorizontal?.();
          }}
        >
          <FlipHorizontal2 size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-action-button reference-action-button"
          title="Flip vertical"
          aria-label="Flip vertical"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onReferenceFlipVertical?.();
          }}
        >
          <FlipVertical2 size={14} aria-hidden="true" />
        </button>
        <div className="reference-opacity-control">
          <button
            type="button"
            className="icon-action-button reference-action-button"
            title="Opacity"
            aria-label="Opacity"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <Blend size={14} aria-hidden="true" />
          </button>
          <div className="reference-opacity-slider-popover">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={Math.max(0, Math.min(1, Number(referenceOpacity) || 0.5))}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
              }}
              onChange={(event) => {
                onReferenceOpacityChange?.(event.target.value);
              }}
              aria-label="Reference opacity"
            />
          </div>
        </div>
        <button
          type="button"
          className="icon-action-button reference-action-button"
          title="Remove image"
          aria-label="Remove image"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClearReference?.();
          }}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
      <div
        className="reference-transform-layer"
        style={{
          transform: `rotate(${activeReferenceTransform.rotation}deg) scale(${activeReferenceTransform.flipX ? -1 : 1}, ${activeReferenceTransform.flipY ? -1 : 1})`,
        }}
      >
        <img
          src={referenceImage}
          alt=""
          className="reference-overlay"
          style={{
            opacity: Math.max(0, Math.min(1, referenceOpacity ?? 0.5)),
          }}
          onDragStart={(event) => event.preventDefault()}
        />
        <div className="reference-hover-outline" aria-hidden="true" />
        {canAdjustReference ? (
          <>
            {REFERENCE_RESIZE_HANDLES.map(({ direction, label }) => (
              <button
                key={direction}
                type="button"
                className={`reference-resize-handle reference-resize-handle-${direction}`}
                onPointerDown={(event) => beginReferenceTransform("resize", event, direction)}
                aria-label={label}
                title="Hold Shift to keep aspect ratio"
              />
            ))}
            <button
              type="button"
              className="reference-rotate-handle"
              onPointerDown={(event) => beginReferenceTransform("rotate", event)}
              aria-label="Rotate reference image"
              title="Rotate reference image (hold Shift to snap to 15°)"
            />
          </>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <section className={`editor-column${isAnimationPanelOpen ? " with-animation" : ""}`}>
      <div className="panel">
        {activeProject ? (
          <div ref={canvasScrollRef} className="canvas-scroll-wrap">
            <div className="canvas-stage">
              <div
                ref={canvasFrameRef}
                className="canvas-frame fullscreen-canvas-frame canvas-stage-frame"
                style={{ "--canvas-zoom": zoomLevel }}
              >
                <div className="pixel-canvas-wrap">
                  {activeReferenceTransform.layer === "behind" ? referenceOverlayNode : null}
                  <div
                    className={`pixel-grid ${canAdjustReference ? "pointer-disabled" : ""}`}
                    data-grid-visible={isGridVisible ? "true" : "false"}
                    style={pixelSizeStyle}
                    onPointerUp={onStopPainting}
                    onPointerLeave={onStopPainting}
                  >
                    {activeFrame.map((color, index) => {
                      const x = (index % activeWidth) + 1;
                      const y = Math.floor(index / activeWidth) + 1;
                      const displayColor = color === TRANSPARENT ? undefined : color;
                      const isSelected = Boolean(selectedIndices?.has(index));

                      return (
                        <button
                          key={index}
                          type="button"
                          className={`pixel ${isSelected ? "selected-pixel" : ""}`}
                          style={displayColor ? { backgroundColor: displayColor } : undefined}
                          onPointerDown={() => onPointerDown(index)}
                          onPointerEnter={(event) => {
                            onPointerEnter(index);
                            onPixelHover?.(index, event);
                          }}
                          onPointerMove={(event) => onPixelHover?.(index, event)}
                          onPointerUp={() => onPointerUp(index)}
                          onContextMenu={(event) => event.preventDefault()}
                          title={`${x}, ${y}`}
                          aria-label={`Pixel ${x}, ${y}`}
                        />
                      );
                    })}
                  </div>
                  {activeReferenceTransform.layer === "top" ? referenceOverlayNode : null}
                  {isGridVisible ? <div className="grid-overlay" style={pixelSizeStyle} aria-hidden="true" /> : null}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-editor-state">
            <FilePlus2 size={38} aria-hidden="true" />
            <p className="empty-editor-title">
              {projectCount > 0 ? "Select a file to start editing" : "Create your first file"}
            </p>
            <p className="empty-editor-subtitle">
              {projectCount > 0
                ? "Choose a file from the left sidebar, or create a new one."
                : "Start by creating a new file from the sidebar and pick a canvas size."}
            </p>
            <button className="primary-button" onClick={onOpenCreateModal}>
              {projectCount > 0 ? "Create New File" : "Create First File"}
            </button>
          </div>
        )}

        {activeProject && (
          <AnimationPanel
            isOpen={isAnimationPanelOpen}
            isPlaying={isAnimationPlaying}
            fps={fps}
            frames={frames}
            width={activeWidth}
            height={activeHeight}
            activeFrameIndex={activeFrameIndex}
            onAddFrame={onAddFrame}
            onPlayToggle={onAnimationPlayToggle}
            onFpsChange={onFpsChange}
            onSelectFrame={onSelectFrame}
            onDeleteFrame={onDeleteFrame}
            onDeleteFrames={onDeleteFrames}
          />
        )}
      </div>
    </section>
  );
}

export default EditorPanel;
