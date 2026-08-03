import io
import logging
import re
from collections import defaultdict
from functools import lru_cache

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

logger = logging.getLogger(__name__)

SOURCE_CHARSET = "0123456789+-xX*/=?"
TARGET_CHARSET_RANGE = 4  # lowercase letters + digits


@lru_cache(maxsize=8)
def _ocr_model(beta, charset):
    import ddddocr

    model = ddddocr.DdddOcr(show_ad=False, beta=beta)
    model.set_ranges(charset)
    return model


@lru_cache(maxsize=1)
def _target_legacy_model():
    """Target-site fallback matching the pre-consensus OCR behavior."""
    import ddddocr

    return ddddocr.DdddOcr(show_ad=False)


def _image_variants(image_bytes):
    """Return conservative variants; noisy binary thresholds are intentionally avoided."""
    yield "original", image_bytes
    image = Image.open(io.BytesIO(image_bytes)).convert("L")
    image = ImageOps.autocontrast(image)
    image = ImageEnhance.Contrast(image).enhance(1.5)
    image = image.resize((image.width * 3, image.height * 3), Image.Resampling.LANCZOS)
    image = image.filter(ImageFilter.SHARPEN)
    output = io.BytesIO()
    image.save(output, format="PNG")
    yield "enhanced", output.getvalue()


def _classify(model, image_bytes):
    result = model.classification(image_bytes, probability=True)
    if isinstance(result, str):
        return result, 0.0
    text = str(result.get("text") or "")
    confidence = result.get("confidence")
    if confidence is None:
        probabilities = result.get("probabilities") or result.get("probability")
        while isinstance(probabilities, list) and len(probabilities) == 1 and isinstance(probabilities[0], list):
            probabilities = probabilities[0]
        if isinstance(probabilities, list) and probabilities:
            rows = probabilities if isinstance(probabilities[0], list) else [probabilities]
            maxima = [max(float(value) for value in row) for row in rows if row]
            confidence = sum(maxima) / len(maxima) if maxima else None
    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        confidence = 0.0
    return text, confidence


def recognize_consensus(
    image_bytes,
    *,
    charset,
    normalize,
    is_valid,
    min_confidence=0.55,
    strong_confidence=0.82,
):
    """Use both bundled ddddocr models and only accept a stable prediction."""
    candidates = []
    rejected = []
    for beta in (False, True):
        model = _ocr_model(beta, charset)
        for variant_name, variant_bytes in _image_variants(image_bytes):
            try:
                raw, confidence = _classify(model, variant_bytes)
            except Exception as error:
                logger.warning("OCR 推理失败 (beta=%s, variant=%s): %s", beta, variant_name, error)
                continue
            text = normalize(raw)
            if is_valid(text):
                candidates.append((text, confidence, beta, variant_name, raw))
            elif raw:
                rejected.append({"raw": raw, "normalized": text, "beta": beta, "variant": variant_name})

    if not candidates:
        # Keep the raw OCR output in diagnostics.  This is essential for
        # distinguishing a bad model result from a blank/stale captcha image.
        return None, {"reason": "no_valid_candidate", "candidates": rejected[:8]}

    grouped = defaultdict(list)
    for candidate in candidates:
        grouped[candidate[0]].append(candidate)
    ranked = sorted(
        grouped.items(),
        key=lambda item: (len(item[1]), max(row[1] for row in item[1])),
        reverse=True,
    )
    text, votes = ranked[0]
    best_confidence = max(row[1] for row in votes)
    accepted = (
        (len(votes) >= 2 and best_confidence >= min_confidence)
        or best_confidence >= strong_confidence
    )
    details = {
        "reason": "accepted" if accepted else "low_consensus",
        "votes": len(votes),
        "confidence": round(best_confidence, 4),
        "alternatives": {value: len(rows) for value, rows in ranked},
    }
    return (text if accepted else None), details


def recognize_math_expression(image_bytes):
    def normalize(value):
        value = re.sub(r"\s+", "", value or "")
        return value.replace("×", "x").replace("÷", "/").replace("t", "x").replace("T", "x")

    return recognize_consensus(
        image_bytes,
        charset=SOURCE_CHARSET,
        normalize=normalize,
        is_valid=lambda value: re.search(r"\d[+\-xX*/]\d", value) is not None,
    )


def recognize_target_code(image_bytes):
    result, details = recognize_consensus(
        image_bytes,
        charset=TARGET_CHARSET_RANGE,
        normalize=lambda value: re.sub(r"[^a-z0-9]", "", (value or "").lower()),
        # Zhejiang's captcha has normally been four characters, but the
        # target site has also returned five/six-character variants.  Reject
        # only clearly unusable results; the login endpoint validates the
        # actual code and the retry loop will refresh on a wrong answer.
        is_valid=lambda value: 4 <= len(value) <= 6,
        min_confidence=0.62,
        strong_confidence=0.86,
    )
    if result:
        return result, details

    # The target captcha uses a font/charset that is not stable enough for
    # the source-site restricted model.  Preserve the old permissive path as
    # a target-only fallback so source OCR improvements cannot break login.
    model = _target_legacy_model()
    fallback = []
    for _, variant in _image_variants(image_bytes):
        try:
            raw = model.classification(variant)
            text = re.sub(r"[^a-z0-9]", "", (raw or "").lower())
            if 3 <= len(text) <= 8:
                fallback.append(text)
        except Exception as error:
            logger.warning("目标站兼容 OCR 推理失败: %s", error)
    if fallback:
        return fallback[0], {"reason": "legacy_fallback", "candidates": fallback}
    return None, details
