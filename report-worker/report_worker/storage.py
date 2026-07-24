import hashlib
import mimetypes
import os
import re
import shutil
import uuid
from pathlib import Path

import boto3
from botocore.config import Config


class ArtifactStorage:
    def __init__(self):
        self.driver = os.environ.get("STORAGE_DRIVER", "local").strip().lower()
        self.bucket = os.environ.get("JD_OSS_BUCKET")
        endpoint = os.environ.get("JD_OSS_ENDPOINT")
        if endpoint and not endpoint.startswith(("http://", "https://")):
            endpoint = f"https://{endpoint}"
        self.client = None
        if self.driver == "jdcloud_oss":
            required = {
                "JD_OSS_BUCKET": self.bucket,
                "JD_OSS_ENDPOINT": endpoint,
                "JD_OSS_ACCESS_KEY_ID": os.environ.get("JD_OSS_ACCESS_KEY_ID"),
                "JD_OSS_ACCESS_KEY_SECRET": os.environ.get("JD_OSS_ACCESS_KEY_SECRET"),
            }
            missing = [name for name, value in required.items() if not value]
            if missing:
                raise RuntimeError(
                    "STORAGE_DRIVER=jdcloud_oss requires: " + ", ".join(missing)
                )
            self.client = boto3.client(
                "s3", endpoint_url=endpoint,
                aws_access_key_id=required["JD_OSS_ACCESS_KEY_ID"],
                aws_secret_access_key=required["JD_OSS_ACCESS_KEY_SECRET"],
                region_name=os.environ.get("JD_OSS_REGION", "cn-east-2"),
                config=Config(
                    signature_version="s3v4",
                    s3={"addressing_style": "virtual"},
                    retries={"max_attempts": 4, "mode": "standard"},
                    connect_timeout=15,
                    read_timeout=120,
                    request_checksum_calculation="when_required",
                    response_checksum_validation="when_required",
                ),
            )
        elif self.driver != "local":
            raise RuntimeError(f"unsupported STORAGE_DRIVER: {self.driver}")
        self.local_root = Path(os.environ.get("REPORT_FORWARD_LOCAL_STORAGE", "/data/artifacts"))

    def put(self, config_id, run_id, artifact_type, path):
        path = Path(path)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        safe_name = re.sub(r"[^0-9A-Za-z._\-\u4e00-\u9fff]+", "_", path.name)
        key = f"report-forward/{config_id}/{run_id}/{artifact_type}/{uuid.uuid4()}-{safe_name}"
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if self.client:
            self.client.upload_file(str(path), self.bucket, key, ExtraArgs={"ContentType": content_type})
        else:
            destination = self.local_root / key
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, destination)
        return {
            "object_key": key, "filename": path.name, "content_type": content_type,
            "byte_size": path.stat().st_size, "sha256": digest,
        }

    def get(self, object_key, destination):
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if self.client:
            self.client.download_file(self.bucket, object_key, str(destination))
        else:
            shutil.copy2(self.local_root / object_key, destination)
        return destination
