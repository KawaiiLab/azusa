require('dotenv').config()

const os = require('os')
const fs = require('fs')
const sha1 = require('sha1')
const path = require('path')
const colors = require('colors')
const rimraf = require('rimraf')
const randomInt = require('random-int')
const hasher = require('node-object-hash')()
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

const uuid = require('uuid').v4
const tmpBasePath = path.resolve(os.tmpdir(), 'CloudMan/')

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
  logger.info('Getting downloaded tracks...')
  const dirlist = fs.readdirSync(__root)
  for (const dirname of dirlist) {
    const filelist = fs.readdirSync(path.resolve(__root, dirname))
    for (const filename of filelist) {
      if (filename.startsWith('._')) continue
      const trackId = parseInt(filename.split('.')[0], 10)
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
  await new Promise((resolve, reject) => {
    if (fs.existsSync(tmpBasePath)) {
      rimraf(tmpBasePath, (error) => {
        if (error) reject(error)
        else resolve()
      })
    } else resolve()
  })

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
      extraPlaylist.forEach((item) => list.add(parseInt(item.trim(), 10)))

      const excludePlaylist = config('excludePlaylist', '').split(',')
      excludePlaylist.forEach((item) => list.delete(parseInt(item.trim(), 10)))

      for (const playlistId of list) {
        const playlistInfo = await api.getPlaylistInfo(playlistId)
        const trackIds = []
        for (const track of playlistInfo.trackIds) {
          trackList[track.id] = {}
          trackIds.push(parseInt(track.id, 10))
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
    extraAlbum.forEach((item) => list.add(parseInt(item.trim(), 10)))

    const excludeAlbum = config('excludeAlbum', '').split(',')
    excludeAlbum.forEach((item) => list.delete(parseInt(item.trim(), 10)))

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
        trackIds.push(parseInt(track.id, 10))
      }

      playlistList.push({
        name: '[Album] ' + albumInfo.album.name,
        trackIds
      })
    }

    logger.info('Download list:')
    playlistList.forEach((item) => logger.info('  ' + item.name))
    logger.initBar(Object.keys(trackList).length)
  }

  // Track processing
  const trackDownloadQueue = new PQueue({ concurrency: config('trackDownloadConcurrency', 3) })
  const trackCopyQueue = new PQueue({ concurrency: 1 })
  for (let trackId in trackList) {
    trackId = parseInt(trackId, 10)
    let trackInfo = trackList[trackId]
    trackDownloadQueue.add(async () => {
      const tmpPath = path.resolve(tmpBasePath, uuid() + '/')
      const realPath = path.resolve(__root, sha1(trackId).substr(0, 2))
      const savePath = tmpPath

      if (that.downloaded.has(trackId)) {
        logger.info(`Track ${trackId} existed!`)
        trackList[trackId].done = true
        trackList[trackId].format = that.downloadedFormat[trackId]
        logger._bar.tick(1)
        return
      }

      logger.debug('Requesting details of track', trackId)

      if (!trackInfo.title) {
        trackInfo = metadata.generateTrackMetadata(await api.getTrackInfo(trackId))
      }
      logger.info(`[Track: ${trackInfo.title}] ${colors.yellow('Start downloading...')}`)

      // Download files
      let filetype = 'flac'
      await new Promise((resolve) => {
        fs.access(savePath, fs.constants.F_OK | fs.constants.W_OK, (error) => {
          if (error) {
            fs.mkdir(savePath, {
              recursive: true
            }, () => {
              resolve()
            })
          } else resolve()
        })
      })

      {
        logger.debug('Requesting URL of track', trackInfo.title)
        const trackUrl = await api.getTrackUrl(trackId)

        if (!trackUrl) {
          logger.info(`[Track: ${trackInfo.title}] ${colors.red('Not available')} due to copyright issue!`)
          logger._bar.tick(1)
          return
        }
        if (trackUrl.endsWith('mp3')) filetype = 'mp3'

        logger.debug(`[Track: ${trackInfo.title}][Music file] Start downloading...`)
        await general.downloadFile(trackInfo, trackUrl, savePath)

        if (trackInfo.albumImg) {
          logger.debug(`[Track: ${trackInfo.title}][Cover] Start downloading...`)
          await general.downloadFile(trackInfo, trackInfo.albumImg + '?param=640y640', savePath)
        }
      }
      logger.info(`[Track: ${trackInfo.title}] ${colors.green('Downloaded!')}`)

      trackCopyQueue.add(async () => {
        logger.info(`[Track: ${trackInfo.title}] ${colors.yellow('Start processing...')}`)
        // Metadata processing
        const trackPath = path.resolve(savePath, trackId + '.' + filetype)
        {
          const coverPath = path.resolve(savePath, trackId + '.jpg')

          metadata.writeMetadata(trackInfo, trackPath, coverPath)
        }

        // Lyric processing
        await new Promise((resolve) => {
          fs.access(realPath, fs.constants.F_OK | fs.constants.W_OK, (error) => {
            if (error) {
              fs.mkdir(realPath, {
                recursive: true
              }, () => {
                resolve()
              })
            } else resolve()
          })
        })
        {
          logger.debug('Requesting lyric of track', trackInfo.name)
          const lyricData = await api.getLyric(trackId)

          if (!lyricData.lrc || !lyricData.lrc.lyric) {
            logger.debug('No lyric for track', trackInfo.name)
          } else {
            const lyricStr = lyric.generateLyric(trackId, lyricData)
            await new Promise((resolve) => {
              fs.writeFile(path.resolve(realPath, trackId + '.lrc'), lyricStr, (error) => {
                if (error) throw error
                resolve()
              })
            })
          }
        }

        logger.debug(`[Track: ${trackInfo.title}] Moving...`)

        return new Promise((resolve) => {
          fs.copyFile(trackPath, path.resolve(realPath, trackId + '.' + filetype), (error) => {
            if (error) throw error

            fs.unlink(trackPath, () => {
              logger.debug(`[Track: ${trackInfo.title}] Moved!`)

              that.downloaded.add(trackId)
              trackList[trackId].done = true
              trackList[trackId].format = filetype
              logger._bar.tick(1)
              logger.info(`[Track: ${trackInfo.title}] ${colors.green('Success!')}`)

              resolve()
            })
          })
        })
      })
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
    let objHash = null
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
      if (objHash !== (objHash = hasher.hash(trackPathList))) {
        const filecontent = '#EXTM3U\n\n' + trackPathList.join('\n')
        setTimeout(() => {
          fs.writeFile(playlistPath, filecontent, (error) => {
            if (error) throw error
          })
        }, randomInt(1, 1000))
      }
    }, 5000))
  }

  await trackDownloadQueue.onIdle()
  await trackDownloadQueue.onEmpty()
  await trackCopyQueue.onIdle()
  await trackCopyQueue.onEmpty()

  setTimeout(() => {
    intervalIds.forEach((id) => clearInterval(id))
  }, 8000)
  rimraf(tmpBasePath, () => {})
})()
