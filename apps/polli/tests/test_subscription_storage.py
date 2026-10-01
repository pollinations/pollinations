import os
import sqlite3
import stat
import tempfile
import unittest
from pathlib import Path

from src.integrations.subscriptions import SubscriptionManager


class SubscriptionStorageTests(unittest.IsolatedAsyncioTestCase):
    async def test_reopen_preserves_subscriptions_and_user_isolation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "data" / "subscriptions.db"
            manager = SubscriptionManager(db_path)
            try:
                await manager.initialize()
                self.assertTrue(await manager.subscribe(101, 1, 1001))
                self.assertTrue(await manager.subscribe(202, 2, 2002))
            finally:
                await manager.close()

            reopened = SubscriptionManager(db_path)
            try:
                await reopened.initialize()
                self.assertEqual(
                    [1],
                    [sub["issue_number"] for sub in await reopened.get_user_subscriptions(101)],
                )
                self.assertEqual(
                    [2],
                    [sub["issue_number"] for sub in await reopened.get_user_subscriptions(202)],
                )
                self.assertEqual(1, await reopened.unsubscribe_all(101))
                self.assertFalse(await reopened.is_subscribed(101, 1))
                self.assertTrue(await reopened.is_subscribed(202, 2))
            finally:
                await reopened.close()

    async def test_initialization_enables_secure_delete(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = SubscriptionManager(Path(temp_dir) / "data" / "subscriptions.db")
            try:
                await manager.initialize()
                db = await manager._ensure_initialized()
                cursor = await db.execute("PRAGMA secure_delete")
                self.assertEqual(1, (await cursor.fetchone())[0])
            finally:
                await manager.close()

    async def test_initialization_failure_propagates_and_closes_connection(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "data" / "subscriptions.db"
            db_path.parent.mkdir()
            db = sqlite3.connect(db_path)
            try:
                db.execute("CREATE VIEW subscriptions AS SELECT 1 AS id")
            finally:
                db.close()

            manager = SubscriptionManager(db_path)
            with self.assertRaises(sqlite3.OperationalError):
                await manager.initialize()
            self.assertIsNone(manager._db)
            self.assertFalse(manager._initialized)

    @unittest.skipUnless(os.name == "posix", "POSIX permission modes are not available on Windows")
    async def test_initialization_sets_private_data_database_and_sidecar_modes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "subscriptions.db"
            manager = SubscriptionManager(db_path)
            try:
                await manager.initialize()
                self.assertTrue(await manager.subscribe(101, 1, 1001))

                self.assertEqual(0o700, stat.S_IMODE(data_dir.stat().st_mode))
                self.assertEqual(0o600, stat.S_IMODE(db_path.stat().st_mode))
                for suffix in ("-wal", "-shm"):
                    sidecar = Path(f"{db_path}{suffix}")
                    self.assertTrue(sidecar.exists(), f"expected SQLite {suffix} sidecar")
                    self.assertEqual(0o600, stat.S_IMODE(sidecar.stat().st_mode))
            finally:
                await manager.close()

    @unittest.skipUnless(os.name == "posix", "POSIX permission modes are not available on Windows")
    async def test_reopen_repairs_existing_database_mode(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "subscriptions.db"
            data_dir.mkdir()
            with sqlite3.connect(db_path):
                pass
            data_dir.chmod(0o755)
            db_path.chmod(0o644)

            manager = SubscriptionManager(db_path)
            try:
                await manager.initialize()
                self.assertEqual(0o700, stat.S_IMODE(data_dir.stat().st_mode))
                self.assertEqual(0o600, stat.S_IMODE(db_path.stat().st_mode))
            finally:
                await manager.close()


if __name__ == "__main__":
    unittest.main()
