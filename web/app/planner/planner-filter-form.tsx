import type { FormEventHandler } from "react";

import { MagnifierIcon } from "./planner-icons";

interface PlannerFilterFormProps {
  searchFrom: string;
  searchTo: string;
  searchQuery: string;
  loading: boolean;
  searching: boolean;
  hasSearchFilter: boolean;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onReset: () => void;
}

export function PlannerFilterForm({
  searchFrom,
  searchTo,
  searchQuery,
  loading,
  searching,
  hasSearchFilter,
  onFromChange,
  onToChange,
  onQueryChange,
  onSubmit,
  onReset,
}: PlannerFilterFormProps) {
  return (
    <form className="planner-filter" onSubmit={onSubmit}>
      <div className="planner-filter__range">
        <label>
          <span>시작일</span>
          <input
            type="date"
            value={searchFrom}
            required
            onChange={(event) =>
              onFromChange(event.target.value)
            }
          />
        </label>
        <span className="planner-filter__dash">~</span>
        <label>
          <span>종료일</span>
          <input
            type="date"
            value={searchTo}
            required
            onChange={(event) =>
              onToChange(event.target.value)
            }
          />
        </label>
      </div>
      <label className="planner-filter__query">
        <span>검색어</span>
        <input
          type="search"
          value={searchQuery}
          placeholder="일정·이력 검색"
          aria-label="일정과 이력 검색"
          onChange={(event) =>
            onQueryChange(event.target.value)
          }
        />
      </label>
      <button
        type="submit"
        className="planner-filter__submit"
        disabled={loading || searching}
      >
        <MagnifierIcon />
        {searching ? "검색 중" : "검색"}
      </button>
      {hasSearchFilter ? (
        <button
          type="button"
          className="planner-filter__reset"
          onClick={onReset}
        >
          초기화
        </button>
      ) : null}
    </form>

  );
}
