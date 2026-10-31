from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest

from floret.tools import bash, media
from floret.toolset import dispatch


@pytest.mark.skipif(os.name != "posix", reason="The hosted shell runs on Linux")
async def test_files_and_background_processes_survive_between_real_bash_calls(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-only-placeholder")
    with bash.workspace(str(tmp_path)):
        assert await bash.run('printf %s "$OPENAI_API_KEY"') == ""
        assert await bash.run("cat > input.txt", stdin="persistent") == ""
        assert await bash.run("sleep 30 >/dev/null 2>&1 & echo $! > pid") == ""
        try:
            assert (
                await bash.run('cat input.txt; kill -0 "$(cat pid)" && printf alive')
                == "persistentalive"
            )
        finally:
            await bash.run('kill "$(cat pid)"')
        assert (await dispatch("bash", {"command": "exit 7"})).brain.startswith(
            "ERROR: command exited 7"
        )


@pytest.mark.skipif(os.name != "posix", reason="The hosted shell runs on Linux")
async def test_shell_cancellation_stops_the_process_group_and_bounds_output(
    tmp_path: Path,
) -> None:
    with bash.workspace(str(tmp_path)):
        task = asyncio.create_task(bash.run("echo $$ > pid; sleep 30"))
        while not (tmp_path / "pid").exists():
            await asyncio.sleep(0.01)
        pid = int((tmp_path / "pid").read_text())
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        with pytest.raises(ProcessLookupError):
            os.kill(pid, 0)
        result = await bash.run("head -c 100000 /dev/zero")
        assert len(result) <= bash.OUTPUT_LIMIT + 20
        assert result.endswith("[output truncated]")


async def test_publish_real_local_file_and_enforce_upload_limit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    file = tmp_path / "output.txt"
    file.write_bytes(b"result")
    assert await media._read_source(str(file), None) == (b"result", "output.txt")
    monkeypatch.setattr(media, "MAX_UPLOAD_BYTES", 3)
    with pytest.raises(ValueError, match="upload limit"):
        await media._read_source(str(file), None)


async def test_local_published_file_is_attached_before_vm_cleanup(
    tmp_path, monkeypatch
):
    from floret.api import _build_content

    path = tmp_path / "proof.txt"
    path.write_text("persistent")

    async def publish(source, filename=None):
        assert await media._read_source(source, filename) == (
            b"persistent",
            "proof.txt",
        )
        return "https://media.pollinations.ai/proof"

    monkeypatch.setattr(media, "upload_media", publish)
    result = await dispatch("upload_media", {"source": str(path)})
    assert result.artifacts == [
        {"type": "file", "url": "https://media.pollinations.ai/proof"}
    ]
    path.unlink()
    markdown, _ = await _build_content("done", result.artifacts)
    assert "[Download file](https://media.pollinations.ai/proof)" in markdown
