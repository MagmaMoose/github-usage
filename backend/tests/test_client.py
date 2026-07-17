from __future__ import annotations

import pytest

from app.github.client import GitHubClient, GitHubError

ADV_SEC_PATH = "/orgs/acme/settings/billing/advanced-security"


class _FakeTokens:
    async def token(self) -> str:
        return "t"


def _client() -> GitHubClient:
    return GitHubClient(_FakeTokens(), "https://api.github.com")


async def test_org_advanced_security_retries_with_code_security_product():
    """Standalone GHAS billing 422s the bare call asking for the product; we
    retry once for code_security and return that payload."""
    client = _client()
    calls: list[tuple[str, dict | None]] = []

    async def fake_get(path, params=None):
        calls.append((path, params))
        if params is None:
            raise GitHubError(
                422, "You must specify 'advanced_security_product' in this request."
            )
        return {"repositories": [], "total_advanced_security_committers": 0}

    client._get = fake_get  # type: ignore[assignment]
    result = await client.org_advanced_security("acme")

    assert result == {"repositories": [], "total_advanced_security_committers": 0}
    assert calls == [
        (ADV_SEC_PATH, None),
        (ADV_SEC_PATH, {"advanced_security_product": "code_security"}),
    ]


async def test_org_advanced_security_no_retry_when_bare_call_succeeds():
    """Bundled/legacy plans accept the bare call (and reject the param), so a
    successful bare response must not trigger the retry."""
    client = _client()
    calls: list[tuple[str, dict | None]] = []

    async def fake_get(path, params=None):
        calls.append((path, params))
        return {"repositories": []}

    client._get = fake_get  # type: ignore[assignment]
    result = await client.org_advanced_security("acme")

    assert result == {"repositories": []}
    assert calls == [(ADV_SEC_PATH, None)]


async def test_org_advanced_security_reraises_unrelated_422():
    """A 422 that isn't about the missing product is a real error, not a cue to
    blindly retry."""
    client = _client()

    async def fake_get(path, params=None):
        raise GitHubError(422, "Validation failed: something else")

    client._get = fake_get  # type: ignore[assignment]
    with pytest.raises(GitHubError) as excinfo:
        await client.org_advanced_security("acme")
    assert excinfo.value.status == 422
