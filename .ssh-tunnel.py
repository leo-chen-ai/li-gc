import os
from sshtunnel import SSHTunnelForwarder
import time

host = os.environ["VPS_HOST"]
port = int(os.environ.get("VPS_SSH_PORT", "22"))
user = os.environ["VPS_USER"]
password = os.environ["VPS_PASSWORD"]

server = SSHTunnelForwarder(
    (host, port),
    ssh_username=user,
    ssh_password=password,
    remote_bind_addresses=[
        ("127.0.0.1", 15432),  # VPS kubectl port-forward for postgres
        ("127.0.0.1", 16379),  # VPS kubectl port-forward for redis
    ],
    local_bind_addresses=[
        ("127.0.0.1", 5432),
        ("127.0.0.1", 6379),
    ],
)

server.start()
print(f"SSH tunnel started: local 5432 -> VPS 15432 -> postgres, local 6379 -> VPS 16379 -> redis")
while True:
    time.sleep(60)
