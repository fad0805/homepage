import unittest
from types import SimpleNamespace

from routers.utils import is_admin, owner_or_admin_delete_scope


class PermissionScopeTests(unittest.TestCase):
    def test_owner_delete_scope_is_limited_to_the_user(self) -> None:
        user = SimpleNamespace(id=42, role="user")

        self.assertFalse(is_admin(user))
        self.assertEqual(owner_or_admin_delete_scope(user), 42)

    def test_admin_delete_scope_skips_the_owner_filter(self) -> None:
        admin = SimpleNamespace(id=1, role="admin")

        self.assertTrue(is_admin(admin))
        self.assertIsNone(owner_or_admin_delete_scope(admin))


if __name__ == "__main__":
    unittest.main()
