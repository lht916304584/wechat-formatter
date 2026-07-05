# WeChat Channels 视频号视频解密 WASM

本目录包含微信视频号加密视频的解密能力所需二进制文件。

## 文件来源

- `wasm_video_decode.wasm`：Tencent 官方 WebAssembly 模块，版本 v1.2.46
  - 原始 CDN：`https://aladin.wxqcloud.qq.com/aladin/ffmepeg/video-decode/1.2.46/wasm_video_decode.wasm`
  - 仓库参考：[Evil0ctal/WeChat-Channels-Video-File-Decryption](https://github.com/Evil0ctal/WeChat-Channels-Video-File-Decryption)
- `wasm_video_decode.js`：Emscripten 胶水脚本（MIT，Evil0ctal），位于 `js/vendor/wasm_video_decode.js`
- `js/channels-decoder.js`：本项目封装的懒加载与解密逻辑

## 使用方式

1. `index.html` 已引入 `js/channels-decoder.js`
2. 首次采集视频时，前端会动态插入 `js/vendor/wasm_video_decode.js` 脚本
3. 脚本加载完成后从 `assets/wasm/wasm_video_decode.wasm` 拉取 WASM 二进制
4. 解密流程：
   - 通过 TikHub Channels API 拿到 `media.full_url` 与 `media.decode_key`
   - 浏览器 fetch `full_url` 获得加密字节
   - 使用 `Module.WxIsaac64(decode_key)` 生成 128 KB 密钥流
   - 密钥流反转后与加密字节前 128 KB 做 XOR，剩余字节原样复制
   - 得到可播放的 MP4 文件

## 法律/授权说明

- Evil0ctal 的胶水脚本与浏览器工具采用 MIT 授权
- `wasm_video_decode.wasm` 是 Tencent 官方二进制，**非开源**，仅在本私有项目中作为运行时依赖使用
- 不要将该二进制重新分发到公开仓库或 CDN
- 本项目仅用于个人/内部文章采集与排版，不用于批量下载或二次传播

## 更新

- 2026-07-05：首次引入 v1.2.46
- SHA256：`dca796bacec37d8522c7983b3945e5d579bd74164e3b21f0ebc773be6dfc8b6e`
