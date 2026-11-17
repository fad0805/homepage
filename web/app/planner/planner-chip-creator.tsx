interface PlannerChipCreatorProps {
  color: string;
  name: string;
  saving: boolean;
  onColorChange: (color: string) => void;
  onNameChange: (name: string) => void;
  onCreate: () => void;
  onCancel?: () => void;
}

export function PlannerChipCreator({
  color,
  name,
  saving,
  onColorChange,
  onNameChange,
  onCreate,
  onCancel,
}: PlannerChipCreatorProps) {
  return (
      <div className="planner-color-creator">
        <input
          type="color"
          value={color}
          aria-label="새 색상 칩 색상"
          onChange={(event) => onColorChange(event.target.value)}
        />
        <span className="planner-color-value">
          {color.toUpperCase()}
        </span>
        <input
          type="text"
          className="planner-color-name-input"
          value={name}
          maxLength={80}
          placeholder="칩 이름 (선택)"
          aria-label="새 색상 칩 이름"
          onChange={(event) => onNameChange(event.target.value)}
        />
        <button
          type="button"
          className="planner-text-button"
          disabled={saving}
          onClick={() => void onCreate()}
        >
          {saving ? "추가 중" : "칩 추가"}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="planner-text-button"
            onClick={() => onCancel?.()}
          >
            취소
          </button>
        ) : null}
      </div>
  );
}
