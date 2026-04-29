# 部署说明

本项目是零构建的纯静态单页应用，无需 Node.js 或任何构建步骤。

## 核心文件

```
index.html          # 入口页面
 css/main.css       # 样式
 js/app.js          # 主逻辑
 js/themes.js       # 主题与组件库
 js/wechat-renderer.js  # Markdown 渲染器
```

## 部署方式（任选一种）

### 方式一：Vercel（推荐，最简单）

1. 访问 [vercel.com](https://vercel.com) 注册/登录
2. 点击 "Add New Project"
3. 导入 GitHub 仓库，或直接把项目文件夹拖拽到部署区域
4. 默认配置即可，点击 Deploy
5. 1 分钟内即可上线，自动获得 `xxx.vercel.app` 域名

### 方式二：GitHub Pages（免费 + 自定义域名）

1. 把代码推送到 GitHub 仓库
2. 进入仓库 Settings > Pages
3. Source 选择 Deploy from a branch，Branch 选 main / (root)
4. 保存后即可通过 `https://用户名.github.io/仓库名` 访问
5. 如需自定义域名，在 Pages 设置里绑定即可

### 方式三：国内服务器 / COS / OSS

1. 把全部文件上传到服务器目录或对象存储 bucket
2. 开启静态网站托管
3. 配置 CDN 加速（可选）

推荐平台：
- 腾讯云 COS + CDN
- 阿里云 OSS + CDN
- 又拍云（有免费额度）

### 方式四：本地直接使用

直接双击 `index.html` 即可在浏览器中打开使用，所有功能正常（除图床上传需要联网外）。

## 注意事项

- 所有第三方资源（Monaco Editor、marked、highlight.js、KaTeX、Mermaid）均通过 CDN 加载，部署后需确保访问者网络能连接到相应 CDN
- 如需完全离线使用，可把 CDN 文件下载到本地并修改 `index.html` 中的引用路径
- 图片粘贴功能使用 base64 或图床，不受部署方式影响

## 文章素材

`article.md` 是一篇可直接复制到编辑器中测试排版效果的文章。
