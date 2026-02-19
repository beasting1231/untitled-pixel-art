import { CANVAS_SIZES } from "../lib/pixelEditor";

function CreateFileModal({ isOpen, newProjectName, setNewProjectName, newProjectSize, setNewProjectSize, onClose, onCreate }) {
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
              className={`size-button ${newProjectSize === size ? "active" : ""}`}
              onClick={() => setNewProjectSize(size)}
              role="radio"
              aria-checked={newProjectSize === size}
              aria-label={`${size} by ${size}`}
            >
              <span className="size-button-value">{size}</span>
              <span className="size-button-unit">x {size}</span>
            </button>
          ))}
        </div>

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
