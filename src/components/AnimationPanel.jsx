function AnimationPanel({
  isOpen,
  isPlaying,
  fps,
  frames,
  size,
  activeFrameIndex,
  onToggle,
  onAddFrame,
  onPlayToggle,
  onFpsChange,
  onSelectFrame,
  onDeleteFrame,
}) {
  return (
    <div className="animation-wrap">
      <button className="primary-button" onClick={onToggle}>
        {isOpen ? "Hide Animation" : "Animate"}
      </button>

      {isOpen && (
        <div className="animation-panel">
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
            <input
              id="fps-input"
              className="fps-input"
              type="number"
              min="1"
              max="60"
              value={fps}
              onChange={(event) => onFpsChange(event.target.value)}
            />
          </div>

          <div className="frames-scroll">
            {frames.map((frame, index) => (
              <button
                key={index}
                className={`frame-chip ${activeFrameIndex === index ? "active" : ""}`}
                onClick={() => onSelectFrame(index)}
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
                <span
                  className="frame-delete"
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
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AnimationPanel;
