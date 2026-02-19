import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { FilePlus2 } from "lucide-react";
import { TRANSPARENT } from "../lib/pixelEditor";
import AnimationPanel from "./AnimationPanel";

function EditorPanel({
  activeProject,
  projectCount,
  activeFrame,
  selectedIndices,
  activeFrameIndex,
  brushColor,
  isGridVisible,
  onToggleGrid,
  onSave,
  saveDisabled,
  saveLabel,
  onClear,
  onExport,
  onOpenCreateModal,
  onPointerDown,
  onPointerEnter,
  onPointerUp,
  onStopPainting,
  onToggleAnimationPanel,
  isAnimationPanelOpen,
  onAddFrame,
  onAnimationPlayToggle,
  isAnimationPlaying,
  fps,
  onFpsChange,
  onSelectFrame,
  onDeleteFrame,
  referenceImage,
  referenceOpacity,
  referenceTransform,
  onReferenceUpload,
  onReferenceOpacityChange,
  onReferenceTransformChange,
  onReferenceResetTransform,
  onReferenceLayerToggle,
  onClearReference,
}) {
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 4;
  const ZOOM_STEP = 0.4;
  const PAN_SENSITIVITY = 0.45;
  const activeSize = activeProject?.size || 16;
  const pixelSizeStyle = { "--grid-size": activeSize };
  const frames = activeProject?.frames || [];
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const exportMenuRef = useRef(null);
  const referenceInputRef = useRef(null);
  const canvasFrameRef = useRef(null);
  const canvasScrollRef = useRef(null);
  const referenceDragRef = useRef(null);
  const lastCenteredProjectIdRef = useRef("");
  const lastGestureScaleRef = useRef(1);
  const zoomPercent = Math.round(zoomLevel * 100);
  const [isReferenceAdjustMode, setIsReferenceAdjustMode] = useState(false);
  const lastReferenceImageRef = useRef("");
  const activeReferenceTransform = {
    x: Number(referenceTransform?.x) || 0,
    y: Number(referenceTransform?.y) || 0,
    width: Number(referenceTransform?.width) || 100,
    height: Number(referenceTransform?.height) || 100,
    rotation: Number(referenceTransform?.rotation) || 360,
    layer: referenceTransform?.layer === "top" ? "top" : "behind",
  };
  const clampZoom = (value) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value) || 1));

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!isExportMenuOpen) return;
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setIsExportMenuOpen(false);
      }
    };

    const onEscape = (event) => {
      if (event.key === "Escape") setIsExportMenuOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [isExportMenuOpen]);

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

      onReferenceTransformChange({
        width: dragState.startWidth + deltaXPercent,
        height: dragState.startHeight + deltaYPercent,
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
        const pinchFactor = 1 - event.deltaY * 0.0036;
        setZoomLevel((prev) => clampZoom(prev * pinchFactor));
        return;
      }

      const step = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      setZoomLevel((prev) => clampZoom(Number((prev + step).toFixed(2))));
    };

    scrollContainer.addEventListener("wheel", onWheel, { passive: false });
    return () => scrollContainer.removeEventListener("wheel", onWheel);
  }, []);

  const beginReferenceTransform = (mode, event) => {
    if (!referenceImage || !isReferenceAdjustMode) return;
    if (event.button !== 0) return;
    const frame = canvasFrameRef.current;
    if (!frame) return;
    const frameRect = frame.getBoundingClientRect();
    event.preventDefault();
    event.stopPropagation();

    referenceDragRef.current = {
      mode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      frameWidth: frameRect.width,
      frameHeight: frameRect.height,
      startX: activeReferenceTransform.x,
      startY: activeReferenceTransform.y,
      startWidth: activeReferenceTransform.width,
      startHeight: activeReferenceTransform.height,
    };
  };

  const referenceOverlayNode = referenceImage ? (
    <div
      className={`reference-overlay-wrap ${
        isReferenceAdjustMode ? "adjust-mode" : ""
      } layer-${activeReferenceTransform.layer}`}
      style={{
        left: `${activeReferenceTransform.x}%`,
        top: `${activeReferenceTransform.y}%`,
        width: `${activeReferenceTransform.width}%`,
        height: `${activeReferenceTransform.height}%`,
        transform: `rotate(${activeReferenceTransform.rotation}deg)`,
        opacity: Math.max(0, Math.min(1, referenceOpacity ?? 0.5)),
      }}
      onPointerDown={(event) => beginReferenceTransform("move", event)}
    >
      <img
        src={referenceImage}
        alt=""
        className="reference-overlay"
        onDragStart={(event) => event.preventDefault()}
      />
      {isReferenceAdjustMode ? (
        <button
          type="button"
          className="reference-resize-handle"
          onPointerDown={(event) => beginReferenceTransform("resize", event)}
          aria-label="Resize reference image"
        />
      ) : null}
    </div>
  ) : null;

  const exportItems = [
    { id: "cur", label: "Cursor (.cur)" },
    { id: "png", label: "PNG (.png)" },
    { id: "gif", label: "Animated GIF (.gif)" },
    { id: "sheet", label: "Sprite Sheet (.png)" },
    { id: "json", label: "Frames JSON (.json)" },
  ];

  return (
    <section className={`editor-column${isAnimationPanelOpen ? " with-animation" : ""}`}>
      <div className="panel">
        <div className={`meta-row ${activeProject ? "floating-toolbar floating-toolbar-main" : ""}`}>
          <p className="meta">
            Active: <strong>{activeProject?.name || "No file selected"}</strong>
          </p>
          <p className="meta">
            Brush:
            <span className="brush-preview" style={{ backgroundColor: brushColor }} aria-hidden="true" />
          </p>
          <button className="primary-button clear-button" onClick={onToggleGrid}>
            {isGridVisible ? "Hide Grid" : "Show Grid"}
          </button>
          <button className="primary-button clear-button" onClick={onSave} disabled={saveDisabled}>
            {saveLabel}
          </button>
          <div className="zoom-controls" aria-label="Canvas zoom controls">
            <button
              className="primary-button zoom-button"
              onClick={() => setZoomLevel((prev) => clampZoom(Number((prev - ZOOM_STEP).toFixed(2))))}
              disabled={zoomLevel <= MIN_ZOOM}
              aria-label="Zoom out"
            >
              -
            </button>
            <span className="zoom-value" aria-live="polite">
              {zoomPercent}%
            </span>
            <button
              className="primary-button zoom-button"
              onClick={() => setZoomLevel((prev) => clampZoom(Number((prev + ZOOM_STEP).toFixed(2))))}
              disabled={zoomLevel >= MAX_ZOOM}
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
          <button className="primary-button clear-button" onClick={onClear}>
            Clear
          </button>
          <div className="export-menu-wrap" ref={exportMenuRef}>
            <button
              className="primary-button export-icon-button"
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              aria-label="Export options"
              title="Export"
            >
              <Download size={18} aria-hidden="true" />
            </button>

            {isExportMenuOpen && (
              <div className="export-menu" role="menu" aria-label="Export formats">
                {exportItems.map((item) => (
                  <button
                    key={item.id}
                    className="export-menu-item"
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      onExport(item.id);
                    }}
                    role="menuitem"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {activeProject && (
          <div className="reference-controls floating-toolbar floating-toolbar-reference">
            <button
              className="primary-button ghost-button"
              type="button"
              onClick={() => referenceInputRef.current?.click()}
            >
              Add reference
            </button>
            <button
              className="primary-button ghost-button"
              type="button"
              onClick={onClearReference}
              disabled={!referenceImage}
            >
              Clear reference
            </button>
            <label className="label reference-opacity-label" htmlFor="reference-opacity">
              Opacity
            </label>
            <input
              id="reference-opacity"
              className="reference-opacity-slider"
              type="range"
              min="0"
              max="100"
              value={Math.round((referenceOpacity ?? 0.5) * 100)}
              onChange={(event) => onReferenceOpacityChange(Number(event.target.value) / 100)}
              disabled={!referenceImage}
            />
            <span className="reference-opacity-value">{Math.round((referenceOpacity ?? 0.5) * 100)}%</span>
            <label className="label reference-opacity-label" htmlFor="reference-rotation">
              Rotate
            </label>
            <input
              id="reference-rotation"
              className="reference-opacity-slider reference-rotate-slider"
              type="range"
              min="1"
              max="360"
              value={Math.round(activeReferenceTransform.rotation)}
              onChange={(event) => onReferenceTransformChange({ rotation: Number(event.target.value) })}
              disabled={!referenceImage}
            />
            <span className="reference-opacity-value">{Math.round(activeReferenceTransform.rotation)}deg</span>
            <button
              className={`primary-button ghost-button ${isReferenceAdjustMode ? "active-adjust" : ""}`}
              type="button"
              onClick={() => setIsReferenceAdjustMode((prev) => !prev)}
              disabled={!referenceImage}
            >
              {isReferenceAdjustMode ? "Done adjust" : "Adjust reference"}
            </button>
            <button
              className="primary-button ghost-button"
              type="button"
              onClick={onReferenceResetTransform}
              disabled={!referenceImage}
            >
              Reset transform
            </button>
            <button
              className="primary-button ghost-button"
              type="button"
              onClick={onReferenceLayerToggle}
              disabled={!referenceImage}
            >
              {activeReferenceTransform.layer === "top" ? "Move behind" : "Move on top"}
            </button>
            <span className="reference-zoom-hint">Zoom: pinch or Shift + scroll</span>
            <input
              ref={referenceInputRef}
              type="file"
              accept="image/*"
              className="reference-file-input"
              onChange={onReferenceUpload}
            />
          </div>
        )}

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
                    className={`pixel-grid ${isReferenceAdjustMode && referenceImage ? "pointer-disabled" : ""}`}
                    data-grid-visible={isGridVisible ? "true" : "false"}
                    style={pixelSizeStyle}
                    onPointerUp={onStopPainting}
                    onPointerLeave={onStopPainting}
                  >
                    {activeFrame.map((color, index) => {
                      const x = (index % activeSize) + 1;
                      const y = Math.floor(index / activeSize) + 1;
                      const displayColor = color === TRANSPARENT ? undefined : color;
                      const isSelected = Boolean(selectedIndices?.has(index));

                      return (
                        <button
                          key={index}
                          type="button"
                          className={`pixel ${isSelected ? "selected-pixel" : ""}`}
                          style={displayColor ? { backgroundColor: displayColor } : undefined}
                          onPointerDown={() => onPointerDown(index)}
                          onPointerEnter={() => onPointerEnter(index)}
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
            size={activeSize}
            activeFrameIndex={activeFrameIndex}
            onToggle={onToggleAnimationPanel}
            onAddFrame={onAddFrame}
            onPlayToggle={onAnimationPlayToggle}
            onFpsChange={onFpsChange}
            onSelectFrame={onSelectFrame}
            onDeleteFrame={onDeleteFrame}
          />
        )}
      </div>
    </section>
  );
}

export default EditorPanel;
