from app.rag.ingestion import _chunk_words


def test_chunking_is_bounded_and_overlapping() -> None:
    words = [f"word-{index}" for index in range(30)]
    chunks = _chunk_words(" ".join(words), size=10, overlap=2)
    assert len(chunks) == 4
    assert chunks[0].split()[-2:] == chunks[1].split()[:2]
    assert all(len(chunk.split()) <= 10 for chunk in chunks)


def test_chunking_ignores_empty_text() -> None:
    assert _chunk_words("") == []
