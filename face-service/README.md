# face-service 人脸识别服务

山淮「考勤机模式」的人脸识别后端，按项目隔离人脸库。

## 技术栈

- 人脸检测：SCRFD-500M（ONNX，InsightFace 开源）
- 特征提取：MobileFaceNet w600k（ONNX，512 维向量，余弦相似度 1:N 比对）
- Web 框架：Flask + gunicorn，纯 CPU 推理（ONNX Runtime）
- 存储：`FACE_DATA_DIR/<project_id>/faces.json` + `images/`（按项目独立人脸库）

## 本地运行

```bash
cd face-service
./download_models.sh          # 下载 ONNX 模型到 models/
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py                 # 默认监听 7100
```

## Docker

```bash
docker build -t shanhuai-face-service .
docker run -d -p 7100:7100 -v face_data:/data/faces shanhuai-face-service
```

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/status` | 服务与模型状态 |
| GET | `/api/faces?project_id=` | 项目人脸库列表 |
| POST | `/api/faces/enroll` | `{project_id, person_id, name, image(base64)}` 注册/更新人脸 |
| POST | `/api/faces/delete` | `{project_id, person_id}` 删除人脸 |
| POST | `/api/recognize` | `{project_id, image(base64), threshold?}` 1:N 识别 |

环境变量：`FACE_MODEL_DIR`、`FACE_DATA_DIR`、`FACE_SERVICE_PORT`、`FACE_REC_THRESHOLD`（默认 0.45）。

`FACE_DET_THRESHOLD` 控制找人脸的最低置信度，默认 0.30（范围 0.1–0.9），不改变人员匹配阈值。
识别时按检测框外扩 20% 裁剪、转换五官坐标后对齐提取特征；诊断返回检测峰值、阈值、人脸数、尺寸和裁剪图。
API 将上传照片及裁剪图保存到受项目权限保护的调试日志，不上传公开 OSS；照片保留 7 天，日志保留 30 天。

> 模型来自 InsightFace 开源发布，仅限内部/非商业研究使用。

近距离大脸回退：首次 640×640 检测无人脸时，将输入内容缩小到 75% 并补黑边重试一次。框和关键点恢复到原图坐标；检测阈值及匹配阈值不变。日志 `detection_input_scale` 和 `detection_attempts` 记录实际检测尺度及尝试分数。
