"""Tests for the Sonar current-head guard, including loopback TLS."""

from __future__ import annotations

import contextlib
import io
import json
import os
import ssl
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request
import unittest
from urllib.error import HTTPError, URLError

import sonar_head_guard as guard


JOB_SHA = "a" * 40
NEWER_SHA = "b" * 40
TEST_TOKEN = "synthetic-test-token-never-real"


class FakeResponse:
    def __init__(self, body: bytes, status: int = 200) -> None:
        self.body = body
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, _limit: int = -1) -> bytes:
        return self.body


def branches_payload(sha: str) -> bytes:
    return json.dumps(
        [
            {"name": "feature-test", "commit": {"id": "c" * 40}},
            {"name": guard.BRANCH, "commit": {"id": sha}},
        ]
    ).encode("utf-8")


class SonarHeadGuardTests(unittest.TestCase):
    def test_invalid_private_descriptor_fails_with_controlled_error(self) -> None:
        with self.assertRaises(guard.GitLabAccessError) as raised:
            guard.read_job_token_fd(999999)
        self.assertIn("private descriptor", str(raised.exception))
    def test_job_token_is_read_from_private_descriptor(self) -> None:
        read_fd, write_fd = os.pipe()
        try:
            os.write(write_fd, TEST_TOKEN.encode("ascii") + bytes((10,)))
            os.close(write_fd)
            write_fd = -1
            self.assertEqual(guard.read_job_token_fd(read_fd), TEST_TOKEN)
        finally:
            os.close(read_fd)
            if write_fd >= 0:
                os.close(write_fd)
    def test_current_commit_is_allowed_and_token_is_header_only(self) -> None:
        captured = {}

        def opener(request, timeout):
            captured["url"] = request.full_url
            captured["method"] = request.get_method()
            captured["token_header"] = request.get_header("Job-token")
            captured["timeout"] = timeout
            return FakeResponse(branches_payload(JOB_SHA))

        current = guard.assert_current_commit(
            JOB_SHA, guard.BRANCH, TEST_TOKEN, opener=opener
        )

        self.assertEqual(current, JOB_SHA)
        self.assertEqual(captured["method"], "GET")
        self.assertIn("/api/v4/projects/9/repository/branches?", captured["url"])
        self.assertNotIn(TEST_TOKEN, captured["url"])
        self.assertEqual(captured["token_header"], TEST_TOKEN)
        self.assertEqual(captured["timeout"], 15)

    def test_outdated_commit_fails_closed(self) -> None:
        def opener(_request, timeout):
            return FakeResponse(branches_payload(NEWER_SHA))

        with self.assertRaises(guard.StaleCommitError) as raised:
            guard.assert_current_commit(
                JOB_SHA, guard.BRANCH, TEST_TOKEN, opener=opener
            )

        self.assertIn(JOB_SHA, str(raised.exception))
        self.assertIn(NEWER_SHA, str(raised.exception))
        self.assertNotIn(TEST_TOKEN, str(raised.exception))

    def test_api_access_error_fails_closed_without_token_in_error(self) -> None:
        def opener(request, timeout):
            raise HTTPError(request.full_url, 403, "Forbidden", None, None)

        with self.assertRaises(guard.GitLabAccessError) as raised:
            guard.assert_current_commit(
                JOB_SHA, guard.BRANCH, TEST_TOKEN, opener=opener
            )

        self.assertIn("HTTP 403", str(raised.exception))
        self.assertNotIn(TEST_TOKEN, str(raised.exception))

    def test_transport_errors_remain_closed_and_redacted(self) -> None:
        for failure in (URLError("untrusted"), TimeoutError("timeout"),
                        OSError("I/O"), ValueError("invalid")):
            with self.subTest(kind=type(failure).__name__):
                def opener(_request, timeout):
                    raise failure
                with self.assertRaises(guard.GitLabAccessError) as raised:
                    guard.read_development_head(TEST_TOKEN, opener=opener)
                self.assertNotIn(TEST_TOKEN, str(raised.exception))

    def test_missing_or_duplicate_branch_is_an_error(self) -> None:
        body = json.dumps(
            [
                {"name": guard.BRANCH, "commit": {"id": JOB_SHA}},
                {"name": guard.BRANCH, "commit": {"id": NEWER_SHA}},
            ]
        ).encode("utf-8")

        with self.assertRaises(guard.GitLabAccessError):
            guard.read_development_head(
                TEST_TOKEN, opener=lambda _request, timeout: FakeResponse(body)
            )

    def test_incomplete_branch_sha_is_an_error(self) -> None:
        body = json.dumps(
            [{"name": guard.BRANCH, "commit": {"id": "a" * 8}}]
        ).encode("utf-8")

        with self.assertRaises(guard.GitLabAccessError):
            guard.read_development_head(
                TEST_TOKEN, opener=lambda _request, timeout: FakeResponse(body)
            )


class GuardFailureCases(unittest.TestCase):
    def token_from_bytes(self, value: bytes) -> str:
        # A real private descriptor; no token in arguments or environment.
        with tempfile.TemporaryFile() as stream:
            stream.write(value)
            stream.seek(0)
            return guard.read_job_token_fd(stream.fileno())

    def test_private_descriptor_rejects_empty_oversized_and_non_ascii(self) -> None:
        for value in (b"", b"\r\n", b"x" * 4097, b"\xff"):
            with self.subTest(length=len(value)), self.assertRaises(guard.GitLabAccessError) as caught:
                self.token_from_bytes(value)
            self.assertNotIn(TEST_TOKEN, str(caught.exception))
        self.assertEqual(self.token_from_bytes(b"fake-token\r\n"), "fake-token")

    def test_missing_token_prevents_any_request(self) -> None:
        opener = unittest.mock.Mock()
        with self.assertRaises(guard.GitLabAccessError):
            guard.read_development_head("", opener=opener)
        opener.assert_not_called()

    def test_api_invalid_status_size_and_payload_fail_closed(self) -> None:
        cases = (
            (FakeResponse(b"[]", 403), "HTTP 403"),
            (FakeResponse(b"x" * (guard.RESPONSE_LIMIT + 1)), "size limit"),
            (FakeResponse(b"{bad"), "invalid JSON"),
            (FakeResponse(b"\xff"), "invalid JSON"),
            (FakeResponse(b"{}"), "branch list"),
            (FakeResponse(b"[]"), "exactly one"),
            (FakeResponse(json.dumps([{"name": guard.BRANCH, "commit": None}]).encode()), "SHA"),
        )
        for response, expected in cases:
            with self.subTest(expected=expected), self.assertRaises(guard.GitLabAccessError) as caught:
                guard.read_development_head(TEST_TOKEN, opener=lambda _request, timeout: response)
            self.assertIn(expected, str(caught.exception))
            self.assertNotIn(TEST_TOKEN, str(caught.exception))

    def test_no_status_attribute_uses_response_getcode(self) -> None:
        class LegacyResponse:
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def getcode(self): return 200
            def read(self, _limit): return branches_payload(JOB_SHA)
        self.assertEqual(guard.read_development_head(TEST_TOKEN, opener=lambda _request, timeout: LegacyResponse()), JOB_SHA)

    def test_invalid_branch_or_sha_do_not_contact_gitlab(self) -> None:
        opener = unittest.mock.Mock()
        for sha, branch in ((JOB_SHA, "main"), ("", guard.BRANCH), ("g" * 40, guard.BRANCH)):
            with self.subTest(branch=branch, length=len(sha)), self.assertRaises(guard.GuardError) as caught:
                guard.assert_current_commit(sha, branch, TEST_TOKEN, opener=opener)
            self.assertNotIn(TEST_TOKEN, str(caught.exception))
        opener.assert_not_called()

    def test_cli_success_probe_and_refusals_are_redacted(self) -> None:
        cases = (
            (False, guard.BRANCH, JOB_SHA, JOB_SHA, 0, "SHA Sonar confirmé"),
            (True, "", "", JOB_SHA, 0, "Lecture vérifiée"),
            (False, "main", JOB_SHA, JOB_SHA, 1, "Sonar refusé"),
            (False, guard.BRANCH, JOB_SHA, NEWER_SHA, 1, "Sonar refusé"),
        )
        for probe, branch, expected, head, code, marker in cases:
            with self.subTest(probe=probe, branch=branch, head=head):
                out, err = io.StringIO(), io.StringIO()
                env = {"CI_COMMIT_BRANCH": branch, "CI_COMMIT_SHA": expected}
                with tempfile.TemporaryFile() as token_file:
                    token_file.write(TEST_TOKEN.encode()); token_file.seek(0)
                    args = ["--token-fd", str(token_file.fileno())]
                    if probe: args.append("--probe")
                    with patch.dict(os.environ, env, clear=True), patch.object(guard, "read_development_head", return_value=head), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                        self.assertEqual(guard.main(args), code)
                self.assertIn(marker, out.getvalue() + err.getvalue())
                self.assertNotIn(TEST_TOKEN, out.getvalue() + err.getvalue())

    def test_real_cli_refuses_wrong_branch_without_network(self) -> None:
        with tempfile.TemporaryFile() as token_file:
            token_file.write(TEST_TOKEN.encode()); token_file.seek(0)
            env = {"PATH": os.defpath, "CI_COMMIT_BRANCH": "main", "CI_COMMIT_SHA": JOB_SHA}
            result = subprocess.run([sys.executable, str(Path(guard.__file__)), "--token-fd", str(token_file.fileno())],
                                    pass_fds=(token_file.fileno(),), env=env, text=True, capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 1)
        self.assertIn("Sonar refusé", result.stderr)
        self.assertNotIn(TEST_TOKEN, result.stdout + result.stderr)


class LoopbackTlsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.directory = tempfile.TemporaryDirectory(prefix="sonar-guard-tls-")
        root = Path(cls.directory.name)
        cls.ca = root / "ca.pem"
        server_cert = root / "server.pem"
        server_key = root / "server.key"
        ca_key = root / "ca.key"
        req = root / "server.csr"
        extension = root / "extensions.cnf"
        extension.write_text(
            "basicConstraints=critical,CA:FALSE\n"
            "keyUsage=critical,digitalSignature,keyEncipherment\n"
            "extendedKeyUsage=serverAuth\n"
            "subjectAltName=DNS:localhost\n"
            "subjectKeyIdentifier=hash\n"
            "authorityKeyIdentifier=keyid,issuer\n"
        )
        def openssl(*args: str) -> None:
            subprocess.run(["openssl", *args], check=True, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=30)
        try:
            openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                    "-subj", "/CN=Ephemeral test CA", "-keyout", str(ca_key), "-out", str(cls.ca),
                    "-addext", "basicConstraints=critical,CA:TRUE",
                    "-addext", "keyUsage=critical,keyCertSign,cRLSign",
                    "-addext", "subjectKeyIdentifier=hash")
            openssl("req", "-new", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=localhost",
                    "-keyout", str(server_key), "-out", str(req))
            openssl("x509", "-req", "-in", str(req), "-CA", str(cls.ca), "-CAkey", str(ca_key),
                    "-CAcreateserial", "-days", "1", "-extfile", str(extension), "-out", str(server_cert))
            class Handler(BaseHTTPRequestHandler):
                requests = []
                def do_GET(self):
                    self.requests.append(self.path)
                    if self.path == "/redirect":
                        self.send_response(302)
                        self.send_header("Location", "/followed")
                        self.end_headers()
                        return
                    body = branches_payload(JOB_SHA)
                    self.send_response(200)
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                def log_message(self, *_args):
                    pass
            cls.handler = Handler
            cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(server_cert, server_key)
            cls.server.socket = context.wrap_socket(cls.server.socket, server_side=True)
            cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
            cls.thread.start()
        except BaseException:
            cls.directory.cleanup()
            raise

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)
        cls.directory.cleanup()

    def setUp(self) -> None:
        self.handler.requests.clear()

    def url(self, hostname="localhost", path="/") -> str:
        return f"https://{hostname}:{self.server.server_port}{path}"

    def trusted_factory(self):
        return ssl.create_default_context(cafile=str(self.ca))

    def test_unknown_ca_rejected(self) -> None:
        def untrusted():
            return ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        with patch.object(guard.ssl, "create_default_context", side_effect=untrusted):
            with self.assertRaises(URLError):
                guard._open_without_proxy_or_redirect(Request(self.url()), timeout=3)
        self.assertEqual(self.handler.requests, [])

    def test_wrong_hostname_rejected_even_when_ca_trusted(self) -> None:
        trusted = self.trusted_factory()
        with patch.object(guard.ssl, "create_default_context", return_value=trusted):
            with self.assertRaises(OSError):
                guard._open_without_proxy_or_redirect(Request(self.url("127.0.0.1")), timeout=3)
        self.assertEqual(self.handler.requests, [])

    def test_approved_ca_and_hostname_accepted(self) -> None:
        trusted = self.trusted_factory()
        with patch.object(guard.ssl, "create_default_context", return_value=trusted):
            with guard._open_without_proxy_or_redirect(Request(self.url()), timeout=3) as response:
                self.assertEqual(response.status, 200)
        self.assertEqual(trusted.minimum_version, ssl.TLSVersion.TLSv1_2)
        self.assertEqual(trusted.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(trusted.check_hostname)

    def test_stricter_tls_minimum_is_not_weakened(self) -> None:
        trusted = self.trusted_factory()
        trusted.minimum_version = ssl.TLSVersion.TLSv1_3
        with patch.object(guard.ssl, "create_default_context", return_value=trusted):
            with guard._open_without_proxy_or_redirect(Request(self.url()), timeout=3) as response:
                self.assertEqual(response.status, 200)
        self.assertEqual(trusted.minimum_version, ssl.TLSVersion.TLSv1_3)

    def test_redirect_rejected(self) -> None:
        trusted = self.trusted_factory()
        with patch.object(guard.ssl, "create_default_context", return_value=trusted):
            with self.assertRaises(HTTPError) as raised:
                guard._open_without_proxy_or_redirect(Request(self.url(path="/redirect")), timeout=3)
        self.assertEqual(raised.exception.code, 302)
        self.assertEqual(self.handler.requests, ["/redirect"])

    def test_proxy_environment_ignored(self) -> None:
        trusted = self.trusted_factory()
        proxy = "http://127.0.0.1:1"
        variables = {"https_proxy": proxy, "HTTPS_PROXY": proxy, "no_proxy": "", "NO_PROXY": ""}
        with patch.dict(os.environ, variables), patch.object(guard.ssl, "create_default_context", return_value=trusted):
            with guard._open_without_proxy_or_redirect(Request(self.url()), timeout=3) as response:
                self.assertEqual(response.status, 200)
        self.assertEqual(self.handler.requests, ["/"])


if __name__ == "__main__":
    unittest.main()
