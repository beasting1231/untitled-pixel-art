import { CANVAS_SIZES } from "../lib/pixelEditor";

const MIN_CANVAS_SIZE = 1;
const MAX_CANVAS_SIZE = 256;
const clampCanvasSize = (value) =>
  Math.max(MIN_CANVAS_SIZE, Math.min(MAX_CANVAS_SIZE, Math.round(Number(value) || CANVAS_SIZES[0])));

function CreateFileModal({
  isOpen,
  newProjectName,
  setNewProjectName,
  newProjectWidth,
  setNewProjectWidth,
  newProjectHeight,
  setNewProjectHeight,
  onClose,
  onCreate,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <form
        className="modal-card"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="panel-title">Create new file</h2>

        <label className="label" htmlFor="new-file-name">
          File name
        </label>
        <input
          id="new-file-name"
          className="file-input"
          value={newProjectName}
          onChange={(event) => setNewProjectName(event.target.value)}
          placeholder="Enter file name"
        />

        <label className="label" id="new-file-size-label">
          Size
        </label>
        <div className="size-button-grid" role="radiogroup" aria-labelledby="new-file-size-label">
          {CANVAS_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className={`size-button ${newProjectWidth === size && newProjectHeight === size ? "active" : ""}`}
              onClick={() => {
                setNewProjectWidth(size);
                setNewProjectHeight(size);
              }}
              role="radio"
              aria-checked={newProjectWidth === size && newProjectHeight === size}
              aria-label={`${size} by ${size}`}
            >
              <span className="size-button-value">{size}</span>
              <span className="size-button-unit">x {size}</span>
            </button>
          ))}
        </div>

        <label className="label" htmlFor="new-file-custom-width">
          Width
        </label>
        <input
          id="new-file-custom-width"
          type="number"
          min={MIN_CANVAS_SIZE}
          max={MAX_CANVAS_SIZE}
          step={1}
          className="file-input"
          value={newProjectWidth}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (Number.isNaN(parsed)) return;
            setNewProjectWidth(parsed);
          }}
          onBlur={() => setNewProjectWidth(clampCanvasSize(newProjectWidth))}
          aria-label={`Custom file width from ${MIN_CANVAS_SIZE} to ${MAX_CANVAS_SIZE}`}
        />

        <label className="label" htmlFor="new-file-custom-height">
          Height
        </label>
        <input
          id="new-file-custom-height"
          type="number"
          min={MIN_CANVAS_SIZE}
          max={MAX_CANVAS_SIZE}
          step={1}
          className="file-input"
          value={newProjectHeight}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (Number.isNaN(parsed)) return;
            setNewProjectHeight(parsed);
          }}
          onBlur={() => setNewProjectHeight(clampCanvasSize(newProjectHeight))}
          aria-label={`Custom file height from ${MIN_CANVAS_SIZE} to ${MAX_CANVAS_SIZE}`}
        />

        <div className="modal-actions">
          <button type="button" className="primary-button ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button">
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateFileModal;
