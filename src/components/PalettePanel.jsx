import { TRANSPARENT } from "../lib/pixelEditor";
import { Brush, Eraser, PaintBucket, Minus, Square, MousePointer2 } from "lucide-react";

function PalettePanel({
  palette,
  brushColor,
  pickerColor,
  setPickerColor,
  setBrushColor,
  onAddPaletteColor,
  currentTool,
  onSelectTool,
  toolThickness,
  onThicknessChange,
  tools,
}) {
  const toolButtons = [
    { id: tools.SELECT, label: "Select", icon: MousePointer2 },
    { id: tools.BRUSH, label: "Brush", icon: Brush },
    { id: tools.ERASER, label: "Eraser", icon: Eraser },
    { id: tools.SQUARE, label: "Square", icon: Square },
    { id: tools.LINE, label: "Line", icon: Minus },
    { id: tools.BUCKET, label: "Bucket", icon: PaintBucket },
  ];
  const isThicknessTool =
    currentTool === tools.BRUSH ||
    currentTool === tools.ERASER ||
    currentTool === tools.SQUARE ||
    currentTool === tools.LINE;

  return (
    <aside className="palette-column">
      <div className="panel">
        <h2 className="panel-title">Tools</h2>
        <div className="tool-toolbar icons-only">
          {toolButtons.map((tool) => {
            const Icon = tool.icon;

            return (
              <button
                key={tool.id}
                className={`tool-button ${currentTool === tool.id ? "active" : ""}`}
                onClick={() => onSelectTool(tool.id)}
                title={tool.label}
                aria-label={tool.label}
              >
                <Icon className="tool-button-icon" strokeWidth={2} aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <div className="tool-thickness">
          <label htmlFor="tool-thickness" className="label">
            Brush size: {Math.round(Number(toolThickness))}
          </label>
          <input
            id="tool-thickness"
            type="range"
            min={1}
            max={5}
            step={1}
            value={toolThickness}
            disabled={!isThicknessTool}
            onChange={(event) => onThicknessChange(event.target.value)}
            className="thickness-slider"
          />
        </div>

        <h2 className="panel-title">Color Palette</h2>

        <div className="palette-grid">
          {palette.map((color) => (
            <button
              key={color}
              className={`swatch ${brushColor === color ? "selected" : ""}`}
              style={{ backgroundColor: color }}
              onClick={() => {
                setBrushColor(color);
                setPickerColor(color);
              }}
              aria-label={`Select ${color}`}
            >
              {color}
            </button>
          ))}
          <button
            className={`swatch eraser ${brushColor === TRANSPARENT ? "selected" : ""}`}
            onClick={() => setBrushColor(TRANSPARENT)}
            aria-label="Select eraser"
          >
            ERASE
          </button>
        </div>

        <div className="picker-row">
          <label htmlFor="color-picker" className="label">
            Custom color
          </label>
          <div className="color-picker-control">
            <input
              id="color-picker"
              type="color"
              className="native-color-input"
              value={pickerColor}
              onChange={(event) => {
                setPickerColor(event.target.value);
                setBrushColor(event.target.value);
              }}
            />
            <label className="custom-color-swatch" htmlFor="color-picker" />
          </div>
          <button className="primary-button" onClick={onAddPaletteColor}>
            Add to palette
          </button>
        </div>

        <p className="tips">
          Drag across pixels with mouse down to paint quickly. Right click is disabled so every pointer drag paints.
        </p>
      </div>
    </aside>
  );
}

export default PalettePanel;
