"""Planner CRUD package."""
from .colors import (
    get_colors,
    save_color,
    reorder_colors,
    update_color,
    delete_color,
)

from .tasks import (
    get_tasks,
    create_task,
    update_task,
    complete_task,
    deactivate_task,
    trash_task,
    restore_task,
    delete_task_permanently,
    maintain_tasks,
)

from .events import (
    create_completed_record,
    get_events,
)

from .search import (
    search_planner,
)

from .previews import (
    get_event_preview,
)

__all__ = [
    "get_colors",
    "save_color",
    "reorder_colors",
    "update_color",
    "delete_color",
    "get_tasks",
    "create_task",
    "update_task",
    "complete_task",
    "create_completed_record",
    "deactivate_task",
    "trash_task",
    "restore_task",
    "delete_task_permanently",
    "get_events",
    "search_planner",
    "get_event_preview",
    "maintain_tasks",
]
