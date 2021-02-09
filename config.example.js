module.exports = {
  // 日志等级
  logLevel: 'info',

  // 是否为 /MUSIC 目录中的文件夹生成播放列表
  generatePlaylistFile: false,

  // 网易云手机账号
  phone: 13912345678,
  // 网易云密码
  password: '1234567',

  // 附加的歌单
  extraPlaylist: [],
  // 排除的歌单
  excludePlaylist: [],
  // 需要同步的歌单
  syncPlaylist: [],

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
  extraArtist: [],
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
