<h1 align="center">CloudMan</h1>
用来为 Sony WalkMan 播放器生成播放列表的小程序

🎆for and by Music Lovers

![Lisence](https://img.shields.io/badge/license-MIT-blue.svg) ![Version](https://img.shields.io/badge/Version-v0.6-yellow.svg) ![Last Commit](https://img.shields.io/github/last-commit/LoliLin/CloudMan.svg) ![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg) ![Codacy](https://img.shields.io/codacy/grade/bc1e4b82b99148aca374b22108847f47)

## 简介

本来是只想写一个下载网易云歌单并自动添加元数据 (曲名、专辑名、封面图等) 的小程序的, 歌词由某位 dalao 写的 `ZonyLrcToolsX` 来处理, 但是发现这个程序的逻辑有点小问题 (大概也不算小, 翻译基本上没对上过原文, 除了少数几首开头没有作词作曲信息的曲子), 导致翻译与原文对不上, 于是就顺带把歌词处理也给加上了

~~之前没用过 Python, 使用 Py 是为了使用 `mutagen` 库, 代码不精还请多多指教~~

用熟悉的 Node 重构了一遍, 旧功能已基本实现, 因为熟悉所以后续可能会加更多新功能

经测试现在的代码应该已经基本稳定了，如果还是有 BUG 或者有可以改进的地方欢迎提 IS 或 PR 嗷 (小声

## Features / TODOs
-   [x] 下载用户歌单
-   [x] 填充音乐元数据
-   [x] 下载并格式化歌词及翻译
-   [x] 允许排除 / 附加歌单
-   [ ] 为本地文件夹生成列表
-   [x] 登陆后下载无损格式音乐
-   [x] 自定义下载质量 (默认最高[若未开通会员仅可下载少量无损歌曲])
-   [x] 多线程下载
-   [x] 下载错误自动重试
-   [x] 处理云端歌单变动
-   [ ] 处理播放器端列表变动
-   [ ] 指定为某几个歌单生成组合列表

## 依赖

-   Node.js 10+
-   [Binaryify/NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi)
  -   本项目现使用所有 API 均依赖于此项目
  -   推荐使用 Docker 安装: `docker run -d -p 3000:3000 binaryify/netease_cloud_music_api`

## 配置

```ini
cm_logLevel = info
# 日志等级

cm_api = http://10.0.0.120:3000
# NeteaseCloudMusicApi 服务地址
cm_phone = 13912345678
# 网易云手机账号
cm_password = 123456
# 网易云密码

cm_extraPlaylist = 
# 附加的歌单 (用,分割)
cm_excludePlaylist = 
# 排除的歌单 (用,分割)

cm_bitRate = 9900000
# 下载音质

cm_downloadThreads = 4
# 下载文件的线程数
cm_playlistConcurrency = 3
# 处理/下载歌曲的并发数
```

## 食用方法

1. 在 WalkMan 根目录输入 `git clone https://github.com/LoliLin/CloudMan.git -b node`
2. 进入 `CloudMan` 目录, 输入 `npm i`
3. 将 `.env.example` 重命名为 `.env` 并按需修改
4. 输入 `npm start` 即可

下载线程数建议设置为 4 及 4 以下, 若超过 4 疑似会被强制断开

## 运行方式

程序运行时自动在根目录的 `/MUSIC` 中生成 `CloudMan` 文件夹, 该文件夹中 `MUSIC` 文件夹用于存放歌曲文件及歌词文件, 父目录用于存放播放列表文件

所有歌曲文件均以歌曲 ID 命名并统一存放至 `MUSIC` 文件夹中, 以便于不同播放列表引用同一文件

## 更新日志

### v0.6

Node.js 第一版
