## 备份助手 BackupTool 1.8.0

把本地目录增量同步到 WebDAV / S3 / 坚果云的小工具，命令行 + 托盘两种用法。

### 功能

1. **增量备份**：只传输改动过的文件，1 TB 素材库首次之后每次几秒钟
2. **定时任务**：支持 `每天 03:00`、`每 6 小时` 这类简单表达式
3. **版本保留**：被覆盖的文件会在远端 `_history/` 里留 3 份
4. **零配置上手**：`backup.exe init` 会引导你填地址和密钥

```bash
# 首次初始化
backup.exe init --remote webdav --url https://dav.example.com/backup

# 立即备份一次
backup.exe sync "D:\素材"

# 查看计划任务
backup.exe status
```

### 下载

```links
大陆主用 | https://pan.example.cn/d/backuptool-1.8.0 | 直连
海外主用 | https://github.com/example/backuptool/releases/download/v1.8.0/backuptool-1.8.0.zip | GitHub Releases
```

### 注意事项

> 首次同步大目录会比较久，建议先跑 `backup.exe sync --dry-run` 看看会传多少文件。

配置文件在 `%APPDATA%\BackupTool\config.toml`，密钥是明文保存的，介意的话用系统自带的 BitLocker 保护一下磁盘。
