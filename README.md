<p align="center">
  <img src="https://user-images.githubusercontent.com/20554060/107264211-aa90ba80-6a7d-11eb-8fef-6c3cf5b84bdf.png">
</p>

<p align="center">🎇 让可爱填满你的播放器(误</p>

<p align="center">
<a href="https://lyn.moe"><img alt="Author" src="https://img.shields.io/badge/Author-Lyn-blue.svg?style=for-the-badge"/></a>
<a href="https://github.com/kawaiilab/azusa"><img alt="Version" src="https://img.shields.io/github/package-json/v/kawaiilab/azusa?style=for-the-badge"/></a>
<img alt="License" src="https://img.shields.io/github/license/kawaiilab/azusa.svg?style=for-the-badge"/>
</p>

***

### Introduction

这个是用来帮助将你的网易云曲库搬到播放器的小程序，经过多次重构现已进入稳定状态，在 NW-ZX300 上亲测可正常使用

### Feature

- 同步收藏的歌单/歌手/专辑
- 自动填充文件元数据
- 生成歌词及翻译
- 多线程下载
- 为本地文件夹生成播放列表
- 本地化 NeteaseCloudMusicApi / 无依赖
- 可同步播放器端对歌单的修改

### Usage

#### Pre-build version

1. 前往 [release](https://github.com/kawaiilab/azusa/releases) 下载对应操作系统架构的包
2. 在播放器 `/MUSIC` 的同级目录创建文件夹 `Azusa` 或在 `/MUSIC` 目录同级目录克隆本项目
3. 将 `config.example.js` 重命名为 `config.js` 并按照 [Configuration](#Configuration) 小节的指示修改并保存
4. 打开命令行执行(Unix)或直接双击软件包运行程序
5. Enjoy~

#### Dev version

1. 直接在播放器 `/MUSIC` 的同级目录克隆本项目，进入后输入 `npm install` 安装依赖
2. 同上小节 `3.`
3. 输入 `npm start` 运行程序
4. Enjoy~

### Configuration

```javascript
module.exports = {
  // 日志等级
  logLevel: 'info',

  // 是否为 /MUSIC 目录中的文件夹生成播放列表
  generatePlaylistFile: false,

  // 网易云手机账号
  phone: 13912345678,
  // 网易云密码
  password: '1234567',
  // 是否保存 Cookie
  saveCookie: true,

  // 附加的歌单
  extraPlaylist: [
    12345,
    23345
  ],
  // 排除的歌单
  excludePlaylist: [],
  // 需要同步的歌单
  syncPlaylist: [
    233333
  ],

  // 是否下载收藏的专辑
  downloadSubAlbum: false,
  // 附加的专辑
  extraAlbum: [],
  // 排除的专辑
  excludeAlbum: [],

  // 是否下载收藏的歌手热门歌曲
  downloadSubArtist: false,
  // 下载的歌曲数量 (前 N 首)
  downloadSubArtistTopNum: 30,
  // 附加的歌手
  extraArtist: [
    456788
  ],
  // 排除的歌手
  excludeArtist: [],

  // 下载音质
  bitRate: 999000,

  // 是否将歌词与翻译合并为一行
  mergeTranslation: false,

  // 播放列表前缀
  prefix: {
    album: '[Album] ',
    artistTopN: '[Artist Top $] ',
    playlist: '[Playlist] ',
    userDir: '[Dir] '
  }
}
```

### Function Description

#### Flow

为本地目录创建播放列表文件 -> 登录&获取歌单列表&处理播放器端播放列表变动 -> 下载音乐及歌词至播放器&异步写入播放列表文件

#### Save Cookie

开启后运行时会在根目录下生成 `account.json` 用于存放账号 Cookie

#### Generate Playlist File

为本地 `/MUSIC` 目录下已有的目录中的文件生成播放列表文件，与文件夹同名

#### Sync Playlist

添加在这个列表中的播放列表会被程序监测并处理变动，用户必须有该播放列表的修改权限

逻辑: 生成播放列表时保存两份(一份 m3u 一份 JSON)，当播放器端进行更改(增加或删除曲目)时会对 m3u 文件进行修改，程序通过比对得到需要更改的项目

#### Merge Translation

据反馈([#1](https://github.com/kawaiilab/azusa/issues/1))某些机器不支持多行同时间歌词，开启次开关后程序会将原文及翻译整合为一行

### SensMe & Music Center for PC Support

本项目可和 Sony 官方的 Music Center for PC 配合使用，后者可为播放器中的音乐补全风格等元信息并可将歌曲加入 Sony 播放器中的 SensMe 频道

打开 Music Center for PC，在 `文件 -> 导入文件夹` 中选择播放器的 `MUSIC/Azusa` 文件夹，全选右键点击 `获取未知元素` 即可开始填充进程

### Credit

[Illustration: あずにゃん](https://www.pixiv.net/artworks/80257983)

### Name

[Azusa Nakano](https://myanimelist.net/character/21173/Azusa_Nakano) from [K-On!](https://myanimelist.net/anime/5680/K-On)

### LICENSE

MIT

