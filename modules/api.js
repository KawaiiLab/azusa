const config = require('./config')
const logger = require('./logger')

const NeteaseCloudMusicApi = require('NeteaseCloudMusicApi')

module.exports = {
  _uid: -1,
  _cookie: '',
  async login (username, password) {
    let result = await NeteaseCloudMusicApi.login_cellphone({
      phone: username,
      password
    })
    result = result.body
    logger.debug(result)
    if (result.code === 200 && result.profile) {
      logger.info('Login success!')
      this._uid = result.profile.userId
      this._cookie = result.cookie
    } else {
      logger.error('Login failed!')
      throw new Error(result.msg)
    }
  },

  async getUserPlaylist () {
    let result = await NeteaseCloudMusicApi.user_playlist({
      uid: this._uid,
      cookie: this._cookie
    })
    result = result.body
    logger.debug(result)

    return result.playlist
  },

  async getUserAlbum () {
    let result = await NeteaseCloudMusicApi.album_sublist({
      limit: 100,
      cookie: this._cookie
    })
    result = result.body
    logger.debug(result)

    return result.data
  },

  async getPlaylistInfo (playlistId) {
    let result = await NeteaseCloudMusicApi.playlist_detail({
      id: playlistId,
      cookie: this._cookie
    })
    result = result.body
    logger.debug(result)

    return result.playlist
  },

  async getAlbumInfo (albumId) {
    let result = await NeteaseCloudMusicApi.album({
      id: albumId,
      cookie: this._cookie
    })
    result = result.body
    logger.debug(result)

    return result
  },

  async getTrackInfo (trackId) {
    let result = await NeteaseCloudMusicApi.song_detail({
      ids: `${trackId}`,
      cookie: this._cookie
    })
    result = result.body
    logger.debug(result)

    return result.songs[0]
  },

  async getTrackUrl (trackId) {
    let result = await NeteaseCloudMusicApi.song_url({
      id: trackId,
      br: config('bitRate', 999000),
      cookie: this._cookie
    })
    result = result.body

    const trackUrl = result.data[0]
    if (!trackUrl || !trackUrl.url) {
      return null
    }

    return `${trackUrl.url}`
  },

  async getLyric (trackId) {
    let result = await NeteaseCloudMusicApi.lyric({
      id: trackId,
      cookie: this._cookie
    })
    result = result.body

    return result
  }
}
