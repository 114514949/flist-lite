## Flist-lite 源码

这就是你现在看到的这个站点，纯静态、零依赖、不需要构建，改完文件刷新就生效。

### 目录结构

```text
flist-lite/
├─ index.html            页面骨架
├─ assets/
│  ├─ style.css          全部样式（浅色 / 深色主题）
│  ├─ app.js             路由、列表、文件介绍
│  ├─ markdown.js        Markdown 渲染器 + ```links 语法
│  └─ icons.js           文件类型图标
├─ data/
│  ├─ site.json          站点名、页脚、公告路径
│  ├─ files.json         文件清单（目录树）
│  ├─ announcement.md    全局公告
│  └─ notes/             每个文件的介绍（Markdown）
└─ tools/
   ├─ dev.mjs            本地预览服务器
   └─ check.mjs          清单校验
```

### 添加一个文件只要三步

1. 在 `data/notes/` 新建一个 `.md`，写介绍和 ` ```links ` 下载块
2. 在 `data/files.json` 里加一条记录，`note` 指向刚才的文件
3. 刷新页面

### 下载

```links
大陆主用 | https://pan.example.cn/d/flist-lite | 直连
海外主用 | https://github.com/example/flist-lite/archive/refs/heads/main.zip | GitHub
```

MIT 授权，随便改。
