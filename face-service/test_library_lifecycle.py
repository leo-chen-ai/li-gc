import json
import os
import tempfile
import unittest
import uuid

import app as service


class LibraryLifecycleTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original_dir = service.DATA_DIR
        service.DATA_DIR = self.temp.name
        self.client = service.app.test_client()

    def tearDown(self):
        service.DATA_DIR = self.original_dir
        self.temp.cleanup()

    def seed(self, project):
        path = service._project_dir(project)
        with open(os.path.join(path, "faces.json"), "w") as output:
            json.dump({"worker": {"name": "测试工人", "embedding": [1.0], "photo": "images/worker.jpg"}}, output)
        with open(os.path.join(path, "images", "worker.jpg"), "wb") as output:
            output.write(b"test-photo")
        return path

    def test_clear_removes_features_and_photos_only_for_target_project(self):
        project, other = str(uuid.uuid4()), str(uuid.uuid4())
        target = self.seed(project)
        preserved = self.seed(other)
        for _ in range(2):
            response = self.client.post("/api/faces/clear-project", json={"project_id": project})
            self.assertTrue(response.json["ok"])
        self.assertFalse(os.path.exists(target))
        self.assertTrue(os.path.isfile(os.path.join(preserved, "images", "worker.jpg")))
        self.assertEqual(self.client.get("/api/faces", query_string={"project_id": project}).json["count"], 0)
        self.assertFalse(os.path.exists(target), "reading progress must not recreate cleared data")

    def test_clear_rejects_missing_and_traversal_targets(self):
        for project in ("", "..", "../other", "/", "bad-id"):
            response = self.client.post("/api/faces/clear-project", json={"project_id": project})
            self.assertFalse(response.json["ok"])

    def test_delete_worker_removes_photo_as_well_as_feature(self):
        project = str(uuid.uuid4())
        target = self.seed(project)
        response = self.client.post("/api/faces/delete", json={"project_id": project, "person_id": "worker"})
        self.assertTrue(response.json["ok"])
        self.assertFalse(os.path.exists(os.path.join(target, "images", "worker.jpg")))
        self.assertEqual(service.load_library(project), {})


if __name__ == "__main__":
    unittest.main()
