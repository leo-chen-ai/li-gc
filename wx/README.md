# 山淮筑微信小程序

## 本地运行

1. 用微信开发者工具打开 `wx/` 目录。
2. AppID 使用 `wx27135eec1b9aedbd`。
3. 在微信开发者工具里执行「工具 -> 构建 npm」。
4. 运行 `npm run localize:tdesign-font`，把 TDesign 图标字体改为京东云 OSS 资源。
5. 编译后默认进入登录页，输入任意账号和密码可进入首页预览。

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
