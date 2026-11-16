"""Unit tests for the Sonar current-head guard; all API responses are mocked."""

from __future__ import annotations

import json
import unittest
from urllib.error import HTTPError

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
        def opener(_request, _timeout):
            return FakeResponse(branches_payload(NEWER_SHA))

        with self.assertRaises(guard.StaleCommitError) as raised:
            guard.assert_current_commit(
                JOB_SHA, guard.BRANCH, TEST_TOKEN, opener=opener
            )

        self.assertIn(JOB_SHA, str(raised.exception))
        self.assertIn(NEWER_SHA, str(raised.exception))
        self.assertNotIn(TEST_TOKEN, str(raised.exception))

    def test_api_access_error_fails_closed_without_token_in_error(self) -> None:
        def opener(request, _timeout):
            raise HTTPError(request.full_url, 403, "Forbidden", None, None)

        with self.assertRaises(guard.GitLabAccessError) as raised:
            guard.assert_current_commit(
                JOB_SHA, guard.BRANCH, TEST_TOKEN, opener=opener
            )

        self.assertIn("HTTP 403", str(raised.exception))
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
                TEST_TOKEN, opener=lambda _request, _timeout: FakeResponse(body)
            )

    def test_incomplete_branch_sha_is_an_error(self) -> None:
        body = json.dumps(
            [{"name": guard.BRANCH, "commit": {"id": "a" * 8}}]
        ).encode("utf-8")

        with self.assertRaises(guard.GitLabAccessError):
            guard.read_development_head(
                TEST_TOKEN, opener=lambda _request, _timeout: FakeResponse(body)
            )


if __name__ == "__main__":
    unittest.main()
