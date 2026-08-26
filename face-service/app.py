# -*- coding: utf-8 -*-
"""山淮人脸识别服务（考勤机模式）。

- 人脸检测：SCRFD-500M（ONNX）
- 特征提取：MobileFaceNet w600k（ONNX，512 维向量）
- 比对方式：余弦相似度，1:N
- 人脸库：按项目隔离存储在 DATA_DIR/<project_id>/ 下（JSON + 图片）

仅用于内部考勤场景；模型来自 InsightFace 开源发布，遵循其非商业许可约束。
"""

import base64
import json
import os
import threading
import time

import cv2
import numpy as np
from flask import Flask, jsonify, request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.environ.get("FACE_MODEL_DIR", os.path.join(BASE_DIR, "models"))
DATA_DIR = os.environ.get("FACE_DATA_DIR", os.path.join(BASE_DIR, "data"))
DET_MODEL_PATH = os.path.join(MODEL_DIR, "scrfd_500m_bnkps_shape640x640.onnx")
REC_MODEL_PATH = os.path.join(MODEL_DIR, "w600k_mbf.onnx")

DET_INPUT_SIZE = 640
REC_THRESHOLD = float(os.environ.get("FACE_REC_THRESHOLD", "0.45"))
MAX_IMAGE_BYTES = int(os.environ.get("FACE_MAX_IMAGE_BYTES", str(8 * 1024 * 1024)))

# ArcFace 标准对齐模板（112x112）
ARCFACE_TEMPLATE = np.array(
    [
        [38.2946, 51.6963],
        [73.5318, 51.5014],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.2041],
    ],
    dtype=np.float32,
)

app = Flask(__name__)

_det_session = None
_rec_session = None
_library_lock = threading.Lock()


# ---------------------------------------------------------------------------
# 模型加载
# ---------------------------------------------------------------------------

def _create_session(path):
    import onnxruntime as ort

    if not os.path.exists(path):
        raise RuntimeError(f"模型文件缺失: {path}，请先运行 download_models.sh")
    opts = ort.SessionOptions()
    opts.log_severity_level = 3
    return ort.InferenceSession(path, sess_options=opts, providers=["CPUExecutionProvider"])


def ensure_models():
    global _det_session, _rec_session
    if _det_session is None:
        _det_session = _create_session(DET_MODEL_PATH)
    if _rec_session is None:
        _rec_session = _create_session(REC_MODEL_PATH)


# ---------------------------------------------------------------------------
# SCRFD 人脸检测
# ---------------------------------------------------------------------------

def _distance2bbox(points, distance):
    x1 = points[:, 0] - distance[:, 0]
    y1 = points[:, 1] - distance[:, 1]
    x2 = points[:, 0] + distance[:, 2]
    y2 = points[:, 1] + distance[:, 3]
    return np.stack([x1, y1, x2, y2], axis=-1)


def _distance2kps(points, distance):
    preds = []
    for i in range(0, distance.shape[1], 2):
        px = points[:, i % 2] + distance[:, i]
        py = points[:, i % 2 + 1] + distance[:, i + 1]
        preds.append(px)
        preds.append(py)
    return np.stack(preds, axis=-1)


def detect_faces(image, score_threshold=0.5):
    """返回 [(bbox[x1,y1,x2,y2,score], kps[5,2]), ...]，按得分降序。"""
    ensure_models()
    img, ratio = _letterbox(image, DET_INPUT_SIZE)

    blob = cv2.dnn.blobFromImage(
        img, 1.0 / 128.0, (DET_INPUT_SIZE, DET_INPUT_SIZE),
        (127.5, 127.5, 127.5), swapRB=True,
    )
    session = _det_session
    outputs = session.run(None, {session.get_inputs()[0].name: blob})

    fmc = 3
    strides = [8, 16, 32]
    scores_list, bboxes_list, kps_list = [], [], []
    use_kps = len(outputs) == fmc * 3

    for idx, stride in enumerate(strides):
        scores = outputs[idx]
        bbox_preds = outputs[idx + fmc] * stride
        height = DET_INPUT_SIZE // stride
        width = DET_INPUT_SIZE // stride
        anchor_x = (np.arange(width) + 0.5) * stride
        anchor_y = (np.arange(height) + 0.5) * stride
        xv, yv = np.meshgrid(anchor_x, anchor_y)
        anchors = np.stack([xv, yv], axis=-1).reshape(-1, 2)

        pos = np.where(scores >= score_threshold)[0]
        scores_list.append(scores[pos])
        bboxes_list.append(_distance2bbox(anchors[pos], bbox_preds[pos]))
        if use_kps:
            kps_preds = outputs[idx + fmc * 2] * stride
            kps_list.append(_distance2kps(anchors[pos], kps_preds[pos]))

    if not scores_list or all(len(s) == 0 for s in scores_list):
        return []

    scores = np.concatenate(scores_list).ravel()
    bboxes = np.concatenate(bboxes_list, axis=0) / ratio
    kps = np.concatenate(kps_list, axis=0) / ratio if use_kps else None

    keep = cv2.dnn.NMSBoxes(
        bboxes[:, :4].tolist(), scores.tolist(), score_threshold, 0.4
    )
    results = []
    for i in np.array(keep).ravel():
        box = np.concatenate([bboxes[i][:4], [scores[i]]])
        results.append((box, kps[i].reshape(5, 2) if kps is not None else None))
    results.sort(key=lambda item: item[0][4], reverse=True)
    return results


def _letterbox(image, size):
    height, width = image.shape[:2]
    ratio = float(size) / max(height, width)
    new_w, new_h = int(round(width * ratio)), int(round(height * ratio))
    resized = cv2.resize(image, (new_w, new_h))
    canvas = np.zeros((size, size, 3), dtype=np.uint8)
    canvas[:new_h, :new_w] = resized
    return canvas, ratio


# ---------------------------------------------------------------------------
# 对齐 + 特征提取
# ---------------------------------------------------------------------------

def align_face(image, kps):
    if kps is None:
        return cv2.resize(image, (112, 112))
    matrix, _ = cv2.estimateAffinePartial2D(
        np.array(kps, dtype=np.float32), ARCFACE_TEMPLATE, method=cv2.LMEDS
    )
    if matrix is None:
        return cv2.resize(image, (112, 112))
    return cv2.warpAffine(image, matrix, (112, 112), borderValue=0.0)


def face_embedding(image):
    """对图像中得分最高的人脸提取 512 维归一化特征；无人脸返回 None。"""
    ensure_models()
    faces = detect_faces(image)
    if not faces:
        return None, None
    _, kps = faces[0]
    aligned = align_face(image, kps)
    blob = cv2.dnn.blobFromImage(
        aligned, 1.0 / 127.5, (112, 112), (127.5, 127.5, 127.5), swapRB=True
    )
    session = _rec_session
    embedding = session.run(None, {session.get_inputs()[0].name: blob})[0][0]
    norm = np.linalg.norm(embedding)
    if norm <= 0:
        return None, None
    return (embedding / norm).astype(np.float32), aligned


# ---------------------------------------------------------------------------
# 人脸库（按项目隔离，JSON + 图片持久化）
# ---------------------------------------------------------------------------

def _project_dir(project_id):
    safe = "".join(c for c in str(project_id) if c.isalnum() or c in "-_")
    if not safe:
        raise ValueError("project_id 无效")
    path = os.path.join(DATA_DIR, safe)
    os.makedirs(os.path.join(path, "images"), exist_ok=True)
    return path


def _library_path(project_id):
    return os.path.join(_project_dir(project_id), "faces.json")


def load_library(project_id):
    path = _library_path(project_id)
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as fh:
        raw = json.load(fh)
    library = {}
    for person_id, entry in raw.items():
        library[person_id] = {
            "name": entry.get("name", ""),
            "photo": entry.get("photo", ""),
            "updated_at": entry.get("updated_at", ""),
            "embedding": np.array(entry["embedding"], dtype=np.float32),
        }
    return library


def save_library(project_id, library):
    path = _library_path(project_id)
    raw = {
        person_id: {
            "name": entry.get("name", ""),
            "photo": entry.get("photo", ""),
            "updated_at": entry.get("updated_at", ""),
            "embedding": np.asarray(entry["embedding"], dtype=np.float32).tolist(),
        }
        for person_id, entry in library.items()
    }
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(raw, fh)
    os.replace(tmp_path, path)


# ---------------------------------------------------------------------------
# 工具
# ---------------------------------------------------------------------------

def decode_image(payload):
    data = payload
    if isinstance(data, str) and "," in data and data.startswith("data:"):
        data = data.split(",", 1)[1]
    try:
        raw = base64.b64decode(data, validate=False)
    except Exception:
        return None, "图片 Base64 解码失败"
    if len(raw) > MAX_IMAGE_BYTES:
        return None, "图片超过大小限制"
    array = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        return None, "图片格式无法识别"
    return image, None


def err(message, status=400, **extra):
    body = {"ok": False, "error": message}
    body.update(extra)
    return jsonify(body), status


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

@app.get("/api/status")
def status():
    models_ready = os.path.exists(DET_MODEL_PATH) and os.path.exists(REC_MODEL_PATH)
    if models_ready:
        try:
            ensure_models()
        except Exception as exc:  # pragma: no cover
            return jsonify({"ok": False, "models_ready": False, "error": str(exc)}), 500
    return jsonify(
        {
            "ok": models_ready,
            "models_ready": models_ready,
            "threshold": REC_THRESHOLD,
            "data_dir": DATA_DIR,
            "time": int(time.time()),
        }
    )


@app.get("/api/faces")
def list_faces():
    project_id = request.args.get("project_id", "").strip()
    if not project_id:
        return err("缺少 project_id")
    with _library_lock:
        library = load_library(project_id)
        items = [
            {
                "person_id": person_id,
                "name": entry.get("name", ""),
                "photo": entry.get("photo", ""),
                "updated_at": entry.get("updated_at", ""),
            }
            for person_id, entry in library.items()
        ]
    return jsonify({"ok": True, "project_id": project_id, "count": len(items), "items": items})


@app.post("/api/faces/enroll")
def enroll_face():
    body = request.get_json(silent=True) or {}
    project_id = str(body.get("project_id") or "").strip()
    person_id = str(body.get("person_id") or "").strip()
    name = str(body.get("name") or "").strip()
    image_b64 = body.get("image")
    if not project_id or not person_id or not image_b64:
        return err("project_id、person_id、image 均为必填")

    image, error = decode_image(image_b64)
    if error:
        return err(error)

    embedding, aligned = face_embedding(image)
    if embedding is None:
        return err("未检测到人脸，注册失败", status=422, matched=False)

    photo_name = f"{person_id}.jpg"
    photo_path = os.path.join(_project_dir(project_id), "images", photo_name)
    cv2.imwrite(photo_path, aligned, [cv2.IMWRITE_JPEG_QUALITY, 92])

    with _library_lock:
        library = load_library(project_id)
        library[person_id] = {
            "name": name,
            "photo": f"images/{photo_name}",
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "embedding": embedding,
        }
        save_library(project_id, library)
        count = len(library)
    return jsonify({"ok": True, "person_id": person_id, "library_size": count})


@app.post("/api/faces/delete")
def delete_face():
    body = request.get_json(silent=True) or {}
    project_id = str(body.get("project_id") or "").strip()
    person_id = str(body.get("person_id") or "").strip()
    if not project_id or not person_id:
        return err("project_id、person_id 均为必填")
    with _library_lock:
        library = load_library(project_id)
        existed = library.pop(person_id, None) is not None
        save_library(project_id, library)
        count = len(library)
    return jsonify({"ok": True, "existed": existed, "library_size": count})


@app.post("/api/recognize")
def recognize():
    body = request.get_json(silent=True) or {}
    project_id = str(body.get("project_id") or "").strip()
    image_b64 = body.get("image")
    threshold = float(body.get("threshold") or REC_THRESHOLD)
    if not project_id or not image_b64:
        return err("project_id、image 均为必填")

    image, error = decode_image(image_b64)
    if error:
        return err(error)

    started = time.time()
    embedding, _ = face_embedding(image)
    if embedding is None:
        return jsonify({"ok": True, "matched": False, "reason": "no_face"})

    with _library_lock:
        library = load_library(project_id)

    best_person, best_score = None, -1.0
    for person_id, entry in library.items():
        score = float(np.dot(embedding, entry["embedding"]))
        if score > best_score:
            best_person, best_score = person_id, score

    matched = best_person is not None and best_score >= threshold
    result = {
        "ok": True,
        "matched": matched,
        "score": round(best_score, 4),
        "threshold": threshold,
        "library_size": len(library),
        "elapsed_ms": int((time.time() - started) * 1000),
    }
    if matched:
        result["person_id"] = best_person
        result["name"] = library[best_person].get("name", "")
    elif best_person is not None:
        result["reason"] = "low_score"
    else:
        result["reason"] = "empty_library"
    return jsonify(result)


@app.get("/health")
def health():
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.environ.get("FACE_SERVICE_PORT", "7100"))
    app.run(host="0.0.0.0", port=port)
