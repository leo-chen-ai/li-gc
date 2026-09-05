# 山淮筑微信小程序

## 本地运行

1. 用微信开发者工具打开 `wx/` 目录。
2. AppID 使用 `wx27135eec1b9aedbd`。
3. 开发版请求本地 `http://192.168.2.22:8080/api/v1`，体验版和正式版自动请求 `https://shanhuai.top/api/v1`。
4. 编译后默认进入登录页，使用有效账号和密码登录。

## 发布

1. 在微信公众平台「开发管理 -> 开发设置 -> 服务器域名」配置：
   - `request` 合法域名：`https://shanhuai.top`
   - `uploadFile` 合法域名：`https://shanhuai.top`
   - `downloadFile` 合法域名：`https://shanhuai.top`、`https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com`
2. 在微信开发者工具清缓存并重新编译，确认体验版登录、项目切换和图片加载正常。
3. 点击工具栏「上传」，填写版本号和项目备注。
4. 登录微信公众平台，在「版本管理」中将开发版本选为体验版测试。
5. 测试通过后提交审核；审核通过后点击「发布」。

## 图片资产

页面图片和字体默认使用京东云 OSS：

```text
https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com/wx
```

旧的本地 `assets/illustrations/` 和 `assets/fonts/` 文件不再作为运行依赖；图片上传到 OSS 后不要保留在小程序包里。

### 上传图片到 OSS

小程序静态图上传到 OSS 的 `wx/` 前缀，路径要和 `config/assets.js` 拼出来的外链一致。源图可以临时放在桌面或 `tmp/`，上传校验完成后不要留在 `wx/assets/illustrations/`：

```text
module-teams.png -> wx/module-teams.png
https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com/wx/module-teams.png
```

上传凭据读取 `../api/.env`：

```text
JD_OSS_ACCESS_KEY_ID
JD_OSS_ACCESS_KEY_SECRET
JD_OSS_BUCKET
JD_OSS_ENDPOINT
JD_OSS_REGION
JD_OSS_PUBLIC_BASE_URL
```

如果本机没有 `aws`、`s3cmd`、`mc` 或 `ossutil`，用后端 `api/src/infrastructure/storage/jdcloud_oss.rs` 同款 AWS4 S3 签名直接 PUT。关键点：

- URL：`https://<JD_OSS_BUCKET>.<JD_OSS_ENDPOINT 去掉协议>/<object-key>`
- object-key：小程序静态图使用 `wx/<filename>`
- 签名 headers：`content-type`、`host`、`x-amz-content-sha256`、`x-amz-date`
- credential scope：`<YYYYMMDD>/<JD_OSS_REGION>/s3/aws4_request`
- 上传后用公开 URL `GET`，比对远端 SHA256 和本地 SHA256；可加 `?verify=<timestamp>` 绕过缓存。

注意：不要把 `JD_OSS_ACCESS_KEY_SECRET` 写进命令历史、脚本文件或提交内容。

## 页面布局

小程序页面使用自定义导航时，需要给顶部微信状态栏和右上胶囊按钮预留空间。新页面根容器默认从 `96rpx` 到 `112rpx` 起步，顶部有操作按钮时优先加大留白，避免内容贴到系统头部。

如果后续更换 OSS 路径，把 `config/assets.js` 里的 `ASSET_BASE_URL` 改成新的 OSS 前缀，例如：

```js
const ASSET_BASE_URL = "https://your-bucket.s3.cn-north-1.jdcloud-oss.com/wx";
```

OSS 需要在微信公众平台小程序后台配置为合法 `downloadFile` 域名，否则真机和正式版可能无法加载远程图片。

## 移动人脸机定位

- 打开人脸机拍照页面时重新获取一次 GCJ-02 定位；该页面内每次打卡上传定位快照，可点击「重新定位」手动刷新。
- 页面隐藏后清除旧定位；未授权或获取失败时仍可拍照打卡，也可开启位置权限后重新定位。
- 后端识别接口可选传入 `location`（`latitude`、`longitude`、`accuracy`、`captured_at`），服务端补充考勤点 ID 和名称，PC 考勤列表及工人考勤弹窗显示定位信息。历史记录显示「未记录定位」。
- 发布微信版本前，请在微信公众平台确认已开通 `getLocation` 接口，并在用户隐私保护指引中声明收集位置信息用于考勤定位；`app.json` 已声明所需权限和接口。
- K3s 发布不会更新微信客户端包，需同时上传包含定位功能的小程序版本；未携带定位的请求仍可识别打卡，记录显示「未记录定位」。

人脸机语音：打卡成功播报「打卡成功」，未匹配或识别请求失败播报「请重试」。WAV 音频在 `assets/audio/` 随包发布，无需联网下载；离开页面停止播放，音频播放异常不改变考勤结果。真机使用媒体音量播放。

## 人脸打卡照片存储

移动人脸机成功打卡的 JPEG Base64 存入 `construction_attendance_record_photos`（`photo_kind=closeup`、`source=miniapp_face`），与主表考勤记录在同一事务中写入。主表不再有 `closeup_photo` 列；API 仍返回同名照片字段，由照片表读取，兼容小程序和 PC。后台手工编辑使用 `admin_upload` 来源，清空照片只隐藏显示，不删除设备原始来源照片。厂家 B 仍在主表 `photo_path` 和照片表保存 OSS 地址。

迁移 061 删除旧列，上线必须先发布兼容新旧结构的 API（`--api --skip-migrate`）并更新本地 API，再执行迁移。回滚到依赖旧列的 API 前先运行 061 down。拆表不等于清理图片空间，考勤照片与保留 7 天的识别调试照片是两套数据。
