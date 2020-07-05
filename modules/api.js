const fetch = require('./fetch')
const config = require('./config')
const logger = require('./logger')

module.exports = {
  _uid: -1,
  async login (username, password) {
    let login = await fetch(config('api') + `/login/cellphone?phone=${username}&password=${password}`)
    login = await login.json()
    logger.debug(login)
    if (login.code === 200 && login.profile) {
      logger.info('Login success!')
      this._uid = login.profile.userId
    } else {
      logger.error('Login failed!')
      throw new Error(login.msg)
    }
  },

  async getUserPlaylist () {
    let result = await fetch(config('api') + '/user/playlist?uid=' + this._uid)
    result = await result.json()
    logger.debug(result)

    return result.playlist
  },

  async getPlaylistInfo (playlistId) {
    let result = await fetch(config('api') + '/playlist/detail?id=' + playlistId)
    result = await result.json()
    logger.debug(result)

    return result.playlist
  },

  async getAlbumInfo (albumId) {
    let result = await fetch(config('api') + '/album?id=' + albumId)
    result = await result.json()
    logger.debug(result)

    return result
  },

  async getTrackInfo (trackId) {
    let result = await fetch(config('api') + '/song/detail?ids=' + trackId)
    result = await result.json()
    logger.debug(result)

    return result.songs[0]
  },

  async getTrackUrl (trackId) {
    let result = await fetch(config('api') + `/song/url?id=${trackId}&br=${config('bitRate', 999000)}`)
    result = await result.json()

    const trackUrl = result.data[0]
    if (!trackUrl || !trackUrl.url) {
      return null
    }

    return `${trackUrl.url}`
  },

  async getLyric (trackId) {
    let result = await fetch(config('api') + `/lyric?id=${trackId}`)
    result = await result.json()

    return result
  }
}
