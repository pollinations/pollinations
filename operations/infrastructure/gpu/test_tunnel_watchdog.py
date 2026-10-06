"""Run with python3 -m unittest operations/infrastructure/gpu/test_tunnel_watchdog.py."""

import http.server
import shlex
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path


class TunnelWatchdogTest(unittest.TestCase):
    def test_restarts_only_its_connector_after_consecutive_unhealthy_checks(self):
        # Exercise the actual shell loop, HTTP metrics and process signals.
        # A healthy sample must reset the count; missing metrics count as down.
        samples = [0, 1, 4, 1, 0, None]
        checks = []
        fourth_check = threading.Event()

        class Metrics(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                sample = samples[min(len(checks), len(samples) - 1)]
                checks.append(sample)
                self.send_response(200)
                self.end_headers()
                if sample is not None:
                    self.wfile.write(
                        f"cloudflared_tunnel_ha_connections {sample}\n".encode()
                    )
                if len(checks) == 4:
                    fourth_check.set()

            def log_message(self, *args):
                pass

        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Metrics)
        address = f"127.0.0.1:{server.server_port}"
        threading.Thread(target=server.serve_forever, daemon=True).start()
        processes = []
        try:
            for name in [
                f"cloudflared tunnel --metrics {address} run test",
                f"cloudflared proxy-dns --metrics {address} run test",
            ]:
                processes.append(
                    subprocess.Popen(
                        ["bash", "-c", f"exec -a {shlex.quote(name)} sleep 120"]
                    )
                )
            connector, dns_helper = processes
            with tempfile.TemporaryDirectory() as directory:
                log = Path(directory) / "tunnel.log"
                processes.append(
                    subprocess.Popen(
                        [
                            "bash",
                            str(Path(__file__).with_name("watch-tunnel.sh")),
                            address,
                            str(log),
                        ]
                    )
                )
                self.assertTrue(fourth_check.wait(55), "watchdog did not poll")
                self.assertIsNone(connector.poll(), "healthy sample did not reset")
                self.assertEqual(connector.wait(timeout=30), -15)
                self.assertIsNone(dns_helper.poll(), "watchdog killed DNS helper")
                self.assertIn("Restarting cloudflared", log.read_text())
        finally:
            for process in processes:
                if process.poll() is None:
                    process.terminate()
                process.wait(timeout=5)
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
