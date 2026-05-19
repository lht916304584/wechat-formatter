# ZgEdit 本地启动说明

## 一键启动

双击 `start-zgedit.bat`。

启动后会自动打开浏览器，地址类似：

```text
http://127.0.0.1:4173/index.html
```

关闭启动窗口即可停止本地服务。

## 环境要求

Windows 通常自带 PowerShell，可直接双击启动。

如果 PowerShell 启动失败，脚本会自动尝试用 Node.js 作为备用方案。推荐安装 Node.js LTS：

```text
https://nodejs.org/
```

## 备用启动

也可以在项目目录里执行：

```bash
npm start
```
