"""Regression tests for issue #2625: tests must never touch the real books.db.

Two leak vectors existed:
1. Without pytest.ini (wrong cwd), pytest-asyncio falls back to strict mode,
   the async fixtures in conftest.py silently never run, DB_PATH is never
   monkeypatched, and tests write fixture rows into backend/books.db before
   erroring. The guard is the DB_PATH env override at the top of conftest.py,
   which runs at import time regardless of asyncio mode.
2. routers/admin.py imported DB_PATH by value at module top, capturing the
   real path at import time and bypassing the per-test monkeypatch entirely.
"""

import os

import routers.admin as admin_module
import services.db as db_module

_REAL_DB = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "books.db")
)


def test_db_path_env_override_is_active():
    """conftest.py must point DB_PATH away from the repo database before any
    services import — this holds even when per-test fixtures don't run."""
    assert os.environ.get("DB_PATH"), "conftest.py must set the DB_PATH env var"
    assert os.path.abspath(os.environ["DB_PATH"]) != _REAL_DB


def test_services_db_path_is_not_the_real_db():
    assert os.path.abspath(db_module.DB_PATH) != _REAL_DB


def test_admin_router_has_no_by_value_db_path_copy():
    """admin.py must resolve DB_PATH at call time via the services.db module
    so the per-test monkeypatch applies to admin routes too."""
    assert not hasattr(admin_module, "DB_PATH"), (
        "routers/admin.py holds a module-level DB_PATH copy; it must use "
        "db_module.DB_PATH at call time"
    )
