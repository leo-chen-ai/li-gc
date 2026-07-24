import logging
import os
import signal
import socket
import threading
import time
import uuid

from . import __version__
from .executor import RunExecutor
from .repository import Repository


POLL_SECONDS = float(os.environ.get("REPORT_FORWARD_POLL_SECONDS", "5"))
HEARTBEAT_SECONDS = float(os.environ.get("REPORT_FORWARD_HEARTBEAT_SECONDS", "30"))
WORKER_ID = os.environ.get("REPORT_FORWARD_WORKER_ID", f"{socket.gethostname()}-{uuid.uuid4().hex[:8]}")
stopping = threading.Event()


def heartbeat_loop(repository, current):
    while not stopping.wait(HEARTBEAT_SECONDS):
        try:
            repository.heartbeat(
                WORKER_ID, current.get("run_id"),
                "busy" if current.get("run_id") else "idle", __version__,
            )
        except Exception:
            logging.exception("Worker 心跳写入失败")


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    repository = Repository()
    current = {"run_id": None}
    threading.Thread(target=heartbeat_loop, args=(repository, current), daemon=True).start()
    repository.heartbeat(WORKER_ID, version=__version__)
    logging.info("数据报送 Worker 已启动: %s", WORKER_ID)

    while not stopping.is_set():
        try:
            repository.schedule_due()
            run = repository.claim_run(WORKER_ID)
            if not run:
                stopping.wait(POLL_SECONDS)
                continue
            current["run_id"] = run["id"]
            repository.heartbeat(WORKER_ID, run["id"], "busy", __version__)
            try:
                RunExecutor(repository, run).execute()
            except Exception as error:
                # Constructor failures (for example a missing/decrypt-failed
                # configuration) happen before RunExecutor can close the run.
                # Never leave such a claimed run cycling through lease expiry.
                logging.exception("任务初始化失败")
                try:
                    repository.event(run["id"], "starting", f"任务初始化失败: {error}", "error")
                    repository.complete(run["id"], "failed", str(error))
                except Exception:
                    logging.exception("任务失败状态写入失败")
        except Exception:
            logging.exception("Worker 主循环异常")
            stopping.wait(POLL_SECONDS)
        finally:
            current["run_id"] = None
            try:
                repository.heartbeat(WORKER_ID, version=__version__)
            except Exception:
                pass


def stop(*_args):
    stopping.set()


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    main()
