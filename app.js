const os = require('os')
const fs = require('fs')
const sha1 = require('sha1')
const path = require('path')
const colors = require('colors')
const rimraf = require('rimraf')
const fad = require('fast-array-diff')
const randomInt = require('random-int')
const hasher = require('node-object-hash')()
const { default: PQueue } = require('p-queue')

const api = require('./source/api')
const lyric = require('./source/lyric')
const config = require('./source/config')
const logger = require('./source/logger')
const general = require('./source/general')
const metadata = require('./source/metadata')

const that = {
  downloaded: new Set(),
  downloadedFormat: {}
}

const uuid = require('uuid').v4
const tmpBasePath = path.resolve(os.tmpdir(), 'Azusa/')

let __root = ''

if (fs.existsSync(path.resolve('MUSIC'))) __root = path.resolve('MUSIC')
else __root = path.resolve('../MUSIC')

if (!fs.existsSync(__root = path.resolve(__root, 'Azusa/MUSIC'))) {
  fs.mkdirSync(__root, {
    recursive: true
  })
}

if (!fs.existsSync(path.resolve(__root, '.azusa/'))) {
  fs.mkdirSync(path.resolve(__root, '.azusa/'))
}

// Get downloaded list
{
  logger.info('Getting downloaded tracks...')
  const dirlist = fs.readdirSync(__root)
  for (const dirname of dirlist) {
    if (dirname.startsWith('.')) continue
    const filelist = fs.readdirSync(path.resolve(__root, dirname))
    for (const filename of filelist) {
      if (filename.startsWith('._')) continue
      const trackId = parseInt(filename.split('.')[0], 10)
      if (filename.endsWith('.mp3') || filename.endsWith('.flac')) that.downloaded.add(trackId)
      if (filename.endsWith('.mp3')) that.downloadedFormat[trackId] = 'mp3'
      else if (filename.endsWith('.flac')) that.downloadedFormat[trackId] = 'flac'
    }
  }
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
  await api.login(config('phone'), config('password'), config('saveCookie', true) ? path.resolve('account.json') : '')

  // Generate infomation for downloading
  const playlistList = []
  const trackList = {}
  const unfoundTrackList = {}
  {
    // Generate for playlist(歌单)
    {
      logger.info('Requesting user\'s playlists')
      const playlist = await api.getUserPlaylist()
      const list = new Set()
      for (const plist of playlist) list.add(plist.id)

      const extraPlaylist = config('extraPlaylist', [])
      extraPlaylist.forEach((item) => list.add(parseInt(item.trim(), 10)))

      const excludePlaylist = config('excludePlaylist', [])
      excludePlaylist.forEach((item) => list.delete(parseInt(item.trim(), 10)))

      for (const playlistId of list) {
        const playlistInfo = await api.getPlaylistInfo(playlistId)
        const trackIds = []
        for (const track of playlistInfo.trackIds) {
          trackList[track.id] = {}
          trackIds.push(parseInt(track.id, 10))
        }

        // 处理播放器歌单变动
        const playlistName = config('prefix', []).playlist + playlistInfo.name
        const syncConfig = config('syncPlaylist', [])
        const needSync = (playlistInfo.creator.userId === api._uid) && (syncConfig.includes(playlistId) || syncConfig.includes('all'))

        if (needSync) {
          const filePath = path.resolve(__root, '.azusa/') + `/${playlistId}.json`
          const playlistPath = path.resolve(__root, '../..', general.replaceChar(playlistName) + '  .m3u')
          if (fs.existsSync(filePath) && fs.existsSync(playlistPath)) {
            const oldTrackIds = JSON.parse(fs.readFileSync(filePath).toString())

            const playlistData = fs.readFileSync(playlistPath).toString()
            const modifiedTrackIds = playlistData.match(/[/\\](\d+)\./g).map(v => parseInt(v.match(/(\d+)/)[0], 10))

            const idDiff = fad.diff(oldTrackIds, modifiedTrackIds)
            await Promise.all([...(new Set(idDiff.added))].map(id => {
              if (!trackIds.includes(id)) {
                trackList[id] = {}
                trackIds.unshift(parseInt(id, 10))
              }
              return api.editPlaylist('add', playlistId, id)
            })).catch(console.trace)
            await Promise.all([...(new Set(idDiff.removed))].map(id => {
              general.removeValueFromArray(trackIds, id)
              return api.editPlaylist('del', playlistId, id)
            })).catch(console.trace)
          }
        }

        playlistList.push({
          saveForChange: needSync ? playlistId : null,
          name: playlistName,
          trackIds
        })
      }
    }

    // Generate for album(专辑)
    logger.info('Requesting user\'s albums')
    const list = new Set()
    if (config('downloadSubAlbum', false)) {
      const albumList = await api.getUserAlbum()
      for (const alist of albumList) list.add(alist.id)

      const extraAlbum = config('extraAlbum', [])
      extraAlbum.forEach((item) => list.add(parseInt(item.trim(), 10)))

      const excludeAlbum = config('excludeAlbum', [])
      excludeAlbum.forEach((item) => list.delete(parseInt(item.trim(), 10)))
    }

    for (const albumId of list) {
      const albumInfo = await api.getAlbumInfo(albumId)
      const trackIds = []

      for (const track of albumInfo.songs) {
        trackList[track.id] = {}
        trackIds.push(parseInt(track.id, 10))
      }

      playlistList.push({
        name: config('prefix', []).album + albumInfo.album.name,
        trackIds
      })
    }

    {
      // Generate for artist top songs(歌手热门)
      logger.info('Requesting user\'s atrists\' songs')
      const list = new Set()
      const nameMap = {}
      if (config('downloadSubAlbum', false)) {
        const artistList = await api.getUserArtist()
        for (const artist of artistList) {
          list.add(artist.id)
          nameMap[artist.id] = artist.name
        }

        const extraArtist = config('extraArtist', [])
        extraArtist.forEach((item) => list.add(parseInt(item.trim(), 10)))

        const excludeArtist = config('excludeArtist', [])
        excludeArtist.forEach((item) => list.delete(parseInt(item.trim(), 10)))
      }

      for (const artistId of list) {
        const artistTop = await api.getArtistTop(artistId)
        const trackIds = []

        for (const track of artistTop.songs.splice(0, config('downloadSubArtistTopNum', 30))) {
          trackList[track.id] = {}
          trackIds.push(parseInt(track.id, 10))
        }

        playlistList.push({
          name: config('prefix', []).artistTopN.replace('$', config('downloadSubArtistTopNum', 30)) + nameMap[artistId],
          trackIds
        })
      }
    }

    // Generate for history recommendation
    logger.info('Requesting user\'s daily recommendation')
    if (config('downloadRecommendation', false)) {
      const data = await api.getUserRecommendation()

      const trackIds = []

      for (const track of data) {
        trackList[track.id] = metadata.generateTrackMetadata(track)
        trackIds.push(parseInt(track.id, 10))
      }

      let month = (new Date()).getMonth() + 1
      month = (month < 10) ? `0${month}` : `${month}`

      let day = (new Date()).getDate()
      day = (day < 10) ? `0${day}` : `${day}`

      const date = `${(new Date()).getFullYear()}-${month}-${day}`

      playlistList.push({
        name: config('prefix', []).recommendation + date,
        trackIds
      })
    }

    // Generate for history recommendation
    if (config('downloadHistoryRecommendation', false)) {
      const historyData = await api.getUserHistoryRecommendation()

      for (const date of historyData.dates) {
        const trackIds = []

        for (const track of historyData.tracks[date]) {
          trackList[track.id] = metadata.generateTrackMetadata(track)
          trackIds.push(parseInt(track.id, 10))
        }

        playlistList.push({
          name: config('prefix', []).recommendation + date,
          trackIds
        })
      }
    }

    // Remove downloaded tracks
    for (let trackId in trackList) {
      trackId = parseInt(trackId, 10)
      if (that.downloaded.has(trackId)) {
        trackList[trackId].done = true
        trackList[trackId].format = that.downloadedFormat[trackId]
      } else unfoundTrackList[trackId] = trackList[trackId]
    }

    for (const trackId of that.downloaded) {
      if (!trackList[trackId]) {
        const realPath = path.resolve(__root, sha1(trackId).substr(0, 2))
        fs.unlink(path.join(realPath, trackId + '.lrc'), () => {
          fs.unlink(path.join(realPath, trackId + '.flac'), (error) => {
            if (error) {
              fs.unlink(path.join(realPath, trackId + '.mp3'), () => {})
            }
          })
        })
      }
    }

    logger.info('Download list:')
    playlistList.forEach((item) => logger.info('  ' + item.name + ` (${item.trackIds.length})`))
    logger.initBar(Object.keys(unfoundTrackList).length)
  }

  // Track processing
  const trackDownloadQueue = new PQueue({ concurrency: 3 })
  const trackProcessQueue = new PQueue({ concurrency: 1 })
  const trackCopyQueue = new PQueue({ concurrency: 1 })

  for (let trackId in unfoundTrackList) {
    trackId = parseInt(trackId, 10)
    let trackInfo = trackList[trackId]
    trackDownloadQueue.add(async () => {
      const tmpPath = path.resolve(tmpBasePath, uuid() + '/')
      const realPath = path.resolve(__root, sha1(trackId).substr(0, 2))
      const savePath = tmpPath

      logger.debug('Requesting details of track', trackId)

      if (!trackInfo.title) {
        trackInfo = metadata.generateTrackMetadata(await api.getTrackInfo(trackId))
      }
      logger.info(`[Track: ${colors.italic(trackInfo.title)}] ${colors.yellow('Downloading...')}`)

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
      }).catch(console.trace)

      {
        logger.debug('Requesting URL of track', trackInfo.title, trackId)
        const trackUrl = await api.getTrackUrl(trackId)

        if (!trackUrl) {
          logger.info(`[Track: ${colors.italic(trackInfo.title)}] ${colors.red('Not available due to copyright issue!')}`)
          logger._bar.tick(1)
          return
        }
        if (trackUrl.endsWith('mp3')) filetype = 'mp3'

        await general.downloadFile(trackInfo, trackUrl, savePath)

        if (trackInfo.albumImg) {
          try {
            await general.downloadFile(trackInfo, trackInfo.albumImg + '?param=640y640', savePath)
          } catch (error) {
            logger.warn(error)
            trackInfo.albumImg = ''
          }
        }
      }
      logger.info(`[Track: ${colors.italic(trackInfo.title)}] ${colors.blue('Downloaded!')}`)

      trackProcessQueue.add(async () => {
        logger.info(`[Track: ${colors.italic(trackInfo.title)}] ${colors.yellow('Processing...')}`)
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
        }).catch(console.trace)
        {
          logger.debug('Requesting lyric of track', trackInfo.name, trackId)
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
            }).catch(console.trace)
          }
        }
        logger.info(`[Track: ${colors.italic(trackInfo.title)}] ${colors.blue('Processed!')}`)

        trackCopyQueue.add(async () => {
          logger.info(`[Track: ${colors.italic(trackInfo.title)}] ${colors.yellow('Moving...')}`)

          return new Promise((resolve) => {
            const destPath = path.resolve(realPath, trackId + '.' + filetype)
            fs.copyFile(trackPath, destPath + '.tmp', (error) => {
              if (error) throw error

              fs.rename(destPath + '.tmp', destPath, (error) => {
                if (error) throw error
                fs.unlink(trackPath, () => {
                  logger.debug(`[Track: ${colors.italic(trackInfo.title)}] Moved!`)

                  that.downloaded.add(trackId)
                  trackList[trackId].done = true
                  trackList[trackId].format = filetype
                  logger._bar.tick(1)
                  logger.info(`[Track: ${colors.italic(trackInfo.title)}] ${colors.green('Success!')}`)

                  resolve()
                })
              })
            })
          }).catch(console.trace)
        })
      })
    })
  }

  // Generate playlist file
  const playlistWriteList = []
  {
    const filelist = fs.readdirSync(path.resolve(__root, '../'))
    for (const name of filelist) {
      if (name !== 'MUSIC') fs.unlinkSync(path.resolve(__root, '../', name))
    }
  }
  {
    const filelist = fs.readdirSync(path.resolve(__root, '../../'))
    for (const name of filelist) {
      if (name.endsWith('  .m3u')) fs.unlinkSync(path.resolve(__root, '../../', name))
    }
  }
  {
    const filelist = fs.readdirSync(path.resolve(__root, '.azusa/'))
    for (const name of filelist) {
      fs.unlinkSync(path.resolve(__root, '.azusa/', name))
    }
  }

  // Process user dir
  if (config('generatePlaylistFile', true)) {
    general.genUserPlaylistFile(__root)
  }

  for (const playlistInfo of playlistList) {
    let objHash = null
    const needSave = playlistInfo.saveForChange
    playlistWriteList.push(() => {
      const playlistPath = path.resolve(__root, needSave ? '../..' : '..', general.replaceChar(playlistInfo.name) + (needSave ? '  .m3u' : '.m3u'))

      const trackPathList = []
      const trackIdList = []

      for (const trackId of playlistInfo.trackIds) {
        if (trackList[trackId].done) {
          const trackFilename = trackId + '.' + trackList[trackId].format
          const trackPath = path.join(needSave ? 'Azusa/MUSIC' : 'MUSIC', sha1(trackId).substr(0, 2), trackFilename)
          trackPathList.push(trackPath)
          trackIdList.push(trackId)
        }
      }

      if (trackPathList.length === 0) return
      if (objHash !== (objHash = hasher.hash(trackPathList))) {
        const filecontent = '#EXTM3U\n\n' + trackPathList.join('\n')
        return new Promise((resolve) => {
          setTimeout(() => {
            fs.writeFile(playlistPath, filecontent, (error) => {
              if (error) throw error

              if (needSave) {
                fs.writeFile(path.resolve(__root, '.azusa/') + `/${needSave}.json`, JSON.stringify(trackIdList), (error) => {
                  if (error) throw error
                  resolve()
                })
              } else {
                resolve()
              }
            })
          }, randomInt(100, 1000)).catch(console.trace)
        })
      }
    })
  }

  const intervalId = setInterval(() => {
    Promise.all(playlistWriteList.map((fn) => fn ? fn() : Promise.resolve()))
  }, 5000)

  await trackDownloadQueue.onIdle()
  await trackCopyQueue.onIdle()

  clearInterval(intervalId)
  await Promise.all(playlistWriteList.map((fn) => fn ? fn() : Promise.resolve())).then(() => {
    setTimeout(() => {
      rimraf(tmpBasePath, () => {})
    }, 1200)
  })
})().catch(console.trace)
