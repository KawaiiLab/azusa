require('dotenv').config()

const fs = require('fs')
const sha1 = require('sha1')
const path = require('path')
const { default: PQueue } = require('p-queue')

const api = require('./modules/api')
const lyric = require('./modules/lyric')
const config = require('./modules/config')
const logger = require('./modules/logger')
const general = require('./modules/general')
const metadata = require('./modules/metadata')

const that = {
  downloaded: new Set(),
  downloadedFormat: {}
}

let __root = ''

if (fs.existsSync(path.resolve('MUSIC'))) __root = path.resolve('MUSIC')
else __root = path.resolve('../MUSIC')

if (!fs.existsSync(__root = path.resolve(__root, 'CloudMan/MUSIC/'))) {
  fs.mkdirSync(__root, {
    recursive: true
  })
}

// Get downloaded list
{
  const dirlist = fs.readdirSync(__root)
  for (const dirname of dirlist) {
    const filelist = fs.readdirSync(path.resolve(__root, dirname))
    for (const filename of filelist) {
      if (filename.startsWith('._')) continue
      const trackId = parseInt(filename.split('.')[0])
      if (filename.endsWith('.lrc')) that.downloaded.add(trackId)
      if (filename.endsWith('.mp3')) that.downloadedFormat[trackId] = 'mp3'
      else if (filename.endsWith('.flac')) that.downloadedFormat[trackId] = 'flac'
    }
  }
}

// Process user dir
if (config('generatePlaylistFile', true)) {
  general.genUserPlaylistFile(__root)
}

(async () => {
  // Login to Cloudmusic
  logger.info('Logging in to Cloudmusic')
  await api.login(config('phone'), config('password'))

  // Generate infomation for downloading
  const playlistList = []
  const trackList = {}
  {
    // Generate for playlist(歌单)
    {
      logger.info('Requesting user\'s playlists')
      const playlist = await api.getUserPlaylist()
      const list = new Set()
      for (const plist of playlist) list.add(plist.id)

      const extraPlaylist = config('extraPlaylist', '').split(',')
      extraPlaylist.forEach((item) => list.add(parseInt(item.trim())))

      const excludePlaylist = config('excludePlaylist', '').split(',')
      excludePlaylist.forEach((item) => list.delete(parseInt(item.trim())))

      for (const playlistId of list) {
        const playlistInfo = await api.getPlaylistInfo(playlistId)
        const trackIds = []
        for (const track of playlistInfo.trackIds) {
          trackList[track.id] = {}
          trackIds.push(parseInt(track.id))
        }

        playlistList.push({
          name: playlistInfo.name,
          trackIds
        })
      }
    }

    // Generate for album(专辑)
    const list = new Set()
    if (config('downloadSubAlbum', false)) {
      const albumList = await api.getUserAlbum()
      for (const alist of albumList) list.add(alist.id)
    }

    const extraAlbum = config('extraAlbum', '').split(',')
    extraAlbum.forEach((item) => list.add(parseInt(item.trim())))

    const excludeAlbum = config('excludeAlbum', '').split(',')
    excludeAlbum.forEach((item) => list.delete(parseInt(item.trim())))

    for (const albumId of list) {
      const albumInfo = await api.getAlbumInfo(albumId)
      const trackIds = []

      let publishTime = false

      for (const track of albumInfo.songs) {
        if (publishTime === false) {
          const trackInfo = await api.getTrackInfo(track.id)
          publishTime = trackInfo.publishTime
        }

        trackList[track.id] = metadata.generateTrackMetadata(track, publishTime)
        trackIds.push(parseInt(track.id))
      }

      playlistList.push({
        name: 'Album: ' + albumInfo.album.name,
        trackIds
      })
    }

    logger.info('Download list:')
    playlistList.forEach((item) => logger.info('  ' + item.name))
  }

  // Track processing
  const trackDownloadQueue = new PQueue({ concurrency: config('trackDownloadConcurrency', 3) })
  for (let trackId in trackList) {
    trackId = parseInt(trackId)
    let trackInfo = trackList[trackId]
    trackDownloadQueue.add(async () => {
      const savePath = path.resolve(__root, sha1(trackId).substr(0, 2))

      if (that.downloaded.has(trackId)) {
        logger.info(`Track ${trackId} existed!`)
        trackList[trackId].done = true
        trackList[trackId].format = that.downloadedFormat[trackId]
        return
      }

      logger.debug('Requesting details of track', trackId)

      if (!trackInfo.title) {
        trackInfo = metadata.generateTrackMetadata(await api.getTrackInfo(trackId))
      }

      // Download files
      let filetype = 'flac'
      if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true })
      {
        logger.debug('Requesting URL of track', trackInfo.title)
        const trackUrl = await api.getTrackUrl(trackId)

        if (!trackUrl) {
          logger.info(`Track ${trackInfo.title} is not available due to copyright issue!`)
          return
        }
        if (trackUrl.endsWith('mp3')) filetype = 'mp3'

        logger.info(`[Track: ${trackInfo.title}][Music file] Start downloading...`)
        await general.downloadFile(trackInfo, trackUrl, savePath)

        if (trackInfo.albumImg) {
          logger.info(`[Track: ${trackInfo.title}][Cover] Start downloading...`)
          await general.downloadFile(trackInfo, trackInfo.albumImg + '?param=640y640', savePath)
        }
      }

      // Metadata processing
      {
        const trackPath = path.resolve(savePath, trackId + '.' + filetype)
        const coverPath = path.resolve(savePath, trackId + '.jpg')

        metadata.writeMetadata(trackInfo, trackPath, coverPath)
      }

      // Lyric processing
      {
        logger.debug('Requesting lyric of track', trackInfo.name)
        const lyricData = await api.getLyric(trackId)

        if (!lyricData.lrc || !lyricData.lrc.lyric) {
          logger.debug('No lyric for track', trackInfo.name)
        } else {
          const lyricStr = lyric.generateLyric(trackId, lyricData)
          fs.writeFileSync(path.resolve(savePath, trackId + '.lrc'), lyricStr)
        }
      }

      that.downloaded.add(trackId)
      trackList[trackId].done = true
      trackList[trackId].format = filetype
    })
  }

  // Generate playlist file
  const intervalIds = []
  {
    const filelist = fs.readdirSync(path.resolve(__root, '../'))
    for (const name of filelist) {
      if (name !== 'MUSIC') fs.unlinkSync(path.resolve(__root, '../', name))
    }
  }
  for (const playlistInfo of playlistList) {
    intervalIds.push(setInterval(() => {
      const playlistPath = path.resolve(__root, '..', general.replaceChar(playlistInfo.name) + '.m3u')

      const trackPathList = []

      for (const trackId of playlistInfo.trackIds) {
        if (trackList[trackId].done) {
          const trackFilename = trackId + '.' + trackList[trackId].format
          const trackPath = path.join('MUSIC', sha1(trackId).substr(0, 2), trackFilename)
          trackPathList.push(trackPath)
        }
      }

      if (trackPathList.length === 0) return
      const filecontent = '#EXTM3U\n\n' + trackPathList.join('\n')
      fs.writeFileSync(playlistPath, filecontent)
    }, 1500))
  }

  await trackDownloadQueue.onIdle()
  await trackDownloadQueue.onEmpty()

  setTimeout(() => {
    intervalIds.forEach((id) => clearInterval(id))
  }, 2000)
})()
