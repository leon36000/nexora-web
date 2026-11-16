#!/usr/bin/env python3
"""Fail-closed freshness guard for the Nexora Web Sonar analysis."""

from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import (
    HTTPSHandler,
    HTTPRedirectHandler,
    ProxyHandler,
    Request,
    build_opener,
)

BRANCH = "developpement"
BRANCHES_ENDPOINT = (
    "https://gitlab-nexora.tail0c55ff.ts.net/"
    "api/v4/projects/9/repository/branches"
)
SHA_PATTERN = re.compile(r"[0-9a-f]{40}\\Z")
RESPONSE_LIMIT = 1_000_000


class GuardError(RuntimeError):
    """A safe, actionable reason that the analysis must not be submitted."""


class GitLabAccessError(GuardError):
    """The branch head could not be read safely."""


class StaleCommitError(GuardError):
    """The current job does not target the latest developpement commit."""


class _RejectRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


def _open_without_proxy_or_redirect(request: Request, timeout: int):
    opener = build_opener(
        ProxyHandler({}),
        _RejectRedirect(),
        HTTPSHandler(context=ssl.create_default_context()),
    )
    return opener.open(request, timeout=timeout)


def read_development_head(job_token: str, opener=None) -> str:
    """Read the exact developpement head with a job token in a header only."""
    if not job_token:
        raise GitLabAccessError("CI_JOB_TOKEN absent; refusing the Sonar analysis.")

    query = urlencode({"search": BRANCH, "per_page": 100})
    try:
        request = Request(
            f"{BRANCHES_ENDPOINT}?{query}",
            headers={"JOB-TOKEN": job_token, "Accept": "application/json"},
            method="GET",
        )
    except (TypeError, ValueError):
        raise GitLabAccessError("Could not build the authenticated branches request.") from None

    open_request = opener or _open_without_proxy_or_redirect
    try:
        with open_request(request, timeout=15) as response:
            status = getattr(response, "status", None)
            if status is None:
                status = response.getcode()
            body = response.read(RESPONSE_LIMIT + 1)
    except HTTPError as error:
        raise GitLabAccessError(
            f"GitLab branches API returned HTTP {error.code}; refusing the Sonar analysis."
        ) from None
    except (URLError, TimeoutError, OSError, ValueError):
        raise GitLabAccessError(
            "GitLab branches API request failed; refusing the Sonar analysis."
        ) from None

    if status != 200:
        raise GitLabAccessError(
            f"GitLab branches API returned HTTP {status}; refusing the Sonar analysis."
        )
    if len(body) > RESPONSE_LIMIT:
        raise GitLabAccessError(
            "GitLab branches API response exceeded the safe size limit."
        )
    try:
        branches = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
        raise GitLabAccessError("GitLab branches API returned invalid JSON.") from None
    if not isinstance(branches, list):
        raise GitLabAccessError("GitLab branches API did not return a branch list.")

    matches = [
        item for item in branches
        if isinstance(item, dict) and item.get("name") == BRANCH
    ]
    if len(matches) != 1:
        raise GitLabAccessError(
            f"Expected exactly one {BRANCH} branch, received {len(matches)}."
        )

    commit = matches[0].get("commit")
    sha = commit.get("id") if isinstance(commit, dict) else None
    if not isinstance(sha, str) or not re.fullmatch(SHA_PATTERN, sha):
        raise GitLabAccessError(
            f"The {BRANCH} branch did not return one full 40-character SHA."
        )
    return sha


def assert_current_commit(
    expected_sha: str,
    branch: str,
    job_token: str,
    opener=None,
) -> str:
    if branch != BRANCH:
        raise GuardError(
            f"Expected CI branch {BRANCH}, received {branch or 'unset'}."
        )
    if not isinstance(expected_sha, str) or not re.fullmatch(SHA_PATTERN, expected_sha):
        raise GuardError("CI_COMMIT_SHA is missing or is not a full 40-character SHA.")

    current_sha = read_development_head(job_token, opener=opener)
    if current_sha != expected_sha:
        raise StaleCommitError(
            f"Refusing stale Sonar analysis: job SHA {expected_sha} is not the "
            f"current {BRANCH} head {current_sha}."
        )
    return current_sha


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--probe",
        action="store_true",
        help="read and print the branch SHA without comparing a job commit",
    )
    args = parser.parse_args(argv)

    token = os.environ.get("CI_JOB_TOKEN", "")
    try:
        if args.probe:
            sha = read_development_head(token)
            print(f"Lecture vérifiée : {BRANCH} à {sha}.")
            return 0
        sha = assert_current_commit(
            os.environ.get("CI_COMMIT_SHA", ""),
            os.environ.get("CI_COMMIT_BRANCH", ""),
            token,
        )
    except GuardError as error:
        print(f"Sonar refusé : {error}", file=sys.stderr)
        return 1

    print(f"SHA Sonar confirmé courant : {sha}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
