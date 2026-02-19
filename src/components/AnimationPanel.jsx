import { useEffect, useRef, useState } from "react";

function AnimationPanel({
  isOpen,
  isPlaying,
  fps,
  frames,
  size,
  activeFrameIndex,
  onAddFrame,
  onPlayToggle,
  onFpsChange,
  onSelectFrame,
  onDeleteFrame,
  onDeleteFrames,
}) {
  const [selectedFrameIndices, setSelectedFrameIndices] = useState([activeFrameIndex]);
  const isDraggingSelectionRef = useRef(false);
  const dragStartIndexRef = useRef(null);
  const dragMovedRef = useRef(false);
  const selectionAnchorRef = useRef(activeFrameIndex);
  const drawerContentRef = useRef(null);
  const wasOpenRef = useRef(isOpen);
  const [drawerMaxHeight, setDrawerMaxHeight] = useState("0px");

  const buildFrameRange = (startIndex, endIndex) => {
    const min = Math.min(startIndex, endIndex);
    const max = Math.max(startIndex, endIndex);
    return Array.from({ length: max - min + 1 }, (_, offset) => min + offset);
  };

  useEffect(() => {
    setSelectedFrameIndices((prev) => {
      const clamped = prev.filter((index) => index >= 0 && index < frames.length);
      if (clamped.length > 0) return clamped;
      return frames.length > 0 ? [Math.min(activeFrameIndex, frames.length - 1)] : [];
    });
  }, [frames.length, activeFrameIndex]);

  useEffect(() => {
    if (activeFrameIndex >= 0) {
      selectionAnchorRef.current = activeFrameIndex;
    }
  }, [activeFrameIndex]);

  useEffect(() => {
    const stopDraggingSelection = () => {
      isDraggingSelectionRef.current = false;
      dragStartIndexRef.current = null;
    };

    window.addEventListener("pointerup", stopDraggingSelection);
    window.addEventListener("pointercancel", stopDraggingSelection);
    return () => {
      window.removeEventListener("pointerup", stopDraggingSelection);
      window.removeEventListener("pointercancel", stopDraggingSelection);
    };
  }, []);

  useEffect(() => {
    const isEditableTarget = (target) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
    };

    const onKeyDown = (event) => {
      if (isEditableTarget(event.target)) return;
      const commandKey = event.metaKey || event.ctrlKey;
      if (!commandKey) return;
      if (event.key !== "Backspace") return;

      const uniqueSelected = [...new Set(selectedFrameIndices)]
        .filter((index) => Number.isInteger(index) && index >= 0 && index < frames.length)
        .sort((a, b) => b - a);

      if (uniqueSelected.length === 0 || frames.length <= 1) return;

      event.preventDefault();
      event.stopPropagation();

      const maxDeletions = Math.max(0, frames.length - 1);
      const deletions = uniqueSelected.slice(0, maxDeletions).sort((a, b) => a - b);
      if (typeof onDeleteFrames === "function") {
        onDeleteFrames(deletions);
      } else {
        [...deletions].sort((a, b) => b - a).forEach((index) => onDeleteFrame(index));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [frames.length, selectedFrameIndices, onDeleteFrame, onDeleteFrames]);

  useEffect(() => {
    const content = drawerContentRef.current;
    if (!content) return;
    const wasOpen = wasOpenRef.current;
    const measuredHeight = `${content.scrollHeight}px`;

    if (isOpen) {
      if (!wasOpen) {
        setDrawerMaxHeight("0px");
        requestAnimationFrame(() => {
          setDrawerMaxHeight(measuredHeight);
        });
      } else {
        setDrawerMaxHeight(measuredHeight);
      }
    } else if (wasOpen) {
      const currentHeight = content.getBoundingClientRect().height;
      setDrawerMaxHeight(`${Math.max(0, Math.round(currentHeight))}px`);
      requestAnimationFrame(() => {
        setDrawerMaxHeight("0px");
      });
    }

    wasOpenRef.current = isOpen;
  }, [isOpen, frames.length]);

  const beginFrameDragSelection = (index, event) => {
    if (event.button !== 0) return;
    isDraggingSelectionRef.current = true;
    dragStartIndexRef.current = index;
    dragMovedRef.current = false;
  };

  const updateFrameDragSelection = (index) => {
    if (!isDraggingSelectionRef.current || dragStartIndexRef.current === null) return;
    if (index !== dragStartIndexRef.current) {
      dragMovedRef.current = true;
    }
    setSelectedFrameIndices(buildFrameRange(dragStartIndexRef.current, index));
  };

  const handleFrameClick = (index, event) => {
    if (dragMovedRef.current) {
      event.preventDefault();
      dragMovedRef.current = false;
      return;
    }

    const isMetaSelection = event.metaKey || event.ctrlKey;
    const isShiftSelection = event.shiftKey;

    if (isShiftSelection) {
      const anchor = selectionAnchorRef.current ?? activeFrameIndex ?? index;
      setSelectedFrameIndices(buildFrameRange(anchor, index));
    } else if (isMetaSelection) {
      setSelectedFrameIndices((prev) => {
        if (prev.includes(index)) {
          const next = prev.filter((value) => value !== index);
          return next.length > 0 ? next : [index];
        }
        return [...prev, index].sort((a, b) => a - b);
      });
      selectionAnchorRef.current = index;
    } else {
      setSelectedFrameIndices([index]);
      selectionAnchorRef.current = index;
    }

    onSelectFrame(index);
    dragMovedRef.current = false;
  };

  const handleFpsStep = (direction) => {
    const numericFps = Number(fps);
    const safeFps = Number.isFinite(numericFps) ? numericFps : 1;
    const nextFps = Math.min(60, Math.max(1, safeFps + direction));
    onFpsChange(String(nextFps));
  };

  return (
    <div className={`animation-drawer ${isOpen ? "open" : "closed"}`} aria-hidden={!isOpen}>
      <div className="animation-drawer-viewport" style={{ maxHeight: drawerMaxHeight }}>
        <div ref={drawerContentRef} className="animation-panel">
          <div className="animation-controls">
            <button className="primary-button" onClick={onAddFrame}>
              + Frame
            </button>
            <button className="primary-button" onClick={onPlayToggle}>
              {isPlaying ? "Pause" : "Play"}
            </button>
            <label className="label" htmlFor="fps-input">
              FPS
            </label>
            <div className="fps-input-wrap">
              <input
                id="fps-input"
                className="fps-input"
                type="number"
                min="1"
                max="60"
                value={fps}
                onChange={(event) => onFpsChange(event.target.value)}
              />
              <div className="fps-stepper">
                <button
                  type="button"
                  className="fps-stepper-button"
                  onClick={() => handleFpsStep(1)}
                  aria-label="Increase FPS"
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="fps-stepper-button"
                  onClick={() => handleFpsStep(-1)}
                  aria-label="Decrease FPS"
                >
                  ▼
                </button>
              </div>
            </div>
          </div>

          <div className="frames-scroll">
            {frames.map((frame, index) => (
              <div key={index} className="frame-item">
                <button
                  className={`frame-chip ${activeFrameIndex === index ? "active" : ""} ${selectedFrameIndices.includes(index) ? "range-selected" : ""}`}
                  onPointerDown={(event) => beginFrameDragSelection(index, event)}
                  onPointerEnter={() => updateFrameDragSelection(index)}
                  onClick={(event) => handleFrameClick(index, event)}
                  aria-label={`Frame ${index + 1}`}
                >
                  <div className="frame-preview" style={{ "--preview-grid-size": size }}>
                    {frame.map((color, pixelIndex) => (
                      <span
                        key={pixelIndex}
                        className="frame-preview-pixel"
                        style={color ? { backgroundColor: color } : undefined}
                      />
                    ))}
                  </div>
                  {frames.length > 1 ? (
                    <span
                      className="frame-delete"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteFrame(index);
                      }}
                      role="button"
                      aria-label={`Delete frame ${index + 1}`}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          onDeleteFrame(index);
                        }
                      }}
                    >
                      X
                    </span>
                  ) : null}
                </button>
                <span className="frame-index-label">{index + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnimationPanel;
