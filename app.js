const _ = require('lodash')
const fs = require('fs')
require('dotenv').config()
const log4js = require('log4js')
const logger = log4js.getLogger('CloudMan')
const nodeFetch = require('node-fetch')
const fetch = require('fetch-cookie')(nodeFetch)
const pRetry = require('p-retry')
const sha1 = require('sha1')
const MultipartDownload = require('multipart-download')
const nodeID3 = require('node-id3')
const Metaflac = require('metaflac-js2')
const { default: PQueue } = require('p-queue')

const config = (name, defaultValue = '') => {
  if (process.env['cm_' + name]) {
    const value = `${process.env['cm_' + name]}`.trim()
    return _.isNumber(defaultValue) ? parseInt(value) : value
  }
  else return defaultValue
}

const that = {
  downloaded: new Set(),
  downloadedFormat: {},
  uid: 0,

  replaceChar(str) {
    // eslint-disable-next-line no-useless-escape
    return `${str}`.replace(/[\\\/:\*\?"<>\|\t]/gm, ' ')
  },

  downloadFile(trackInfo, fileURL, savePath) {
    fileURL = fileURL.replace('https', 'http')
    logger.debug('File URL', fileURL)
    let isPhoto = false, msg = 'Music file'
    if (fileURL.endsWith('640')) {
      isPhoto = true
      msg = 'Cover'
    }

    const filename = trackInfo['id'] + ((isPhoto) ? '.jpg' : ((fileURL.endsWith('mp3')) ? '.mp3' : '.flac'))

    return pRetry(async () => {
      return await new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Timeout')), (isPhoto) ? 5000 : 20000)

        if (isPhoto) {
          fetch(fileURL).then((res) => {
            const fileStream = fs.createWriteStream(savePath + filename)
            res.body.pipe(fileStream)

            res.body.on('error', (error) => {
              logger.warn(`[Track: ${trackInfo['name']}][${msg}]`, error)
              reject(error)
            })
  
            fileStream.on('finish', () => {
              logger.info(`[Track: ${trackInfo['name']}][${msg}] Download completed!`)
              resolve()
            })
          })
        } else {
          new MultipartDownload()
            .start(fileURL, {
              numOfConnections: config('downloadThreads', 4),
              saveDirectory: savePath,
              fileName: filename
            })
            .on('error', (error) => {
              logger.warn(`[Track: ${trackInfo['name']}][${msg}]`, error)
              reject(error)
            })
            .on('end', () => {
              logger.info(`[Track: ${trackInfo['name']}][${msg}] Download completed!`)
              resolve()
            })
        }
      })
    }, {
      retries: 3,
      onFailedAttempt: (error) => {
        logger.warn(`[Track: ${trackInfo['name']}][${msg}] Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`)
      }
    })
  },

  modifyLyric(str, type = 0) {
    const regex = /\[(\w+):(\w+)[.:](\w+)\]/gm
    const modified = []
    const lines = `${str}`.split('\n')

    for (const line of lines) {
      const result = regex.exec(line)
      if (!result) continue
      modified.push({
        time: parseInt(result[1]) * 60 + parseInt(result[2]) + parseFloat('0.' + result[3]),
        type,
        content: line.replace(regex, '').trim()
      })
    }

    return modified
  }
}

let __root = ''
logger.level = config('logLevel', 'info')

if (fs.existsSync(__dirname + '/MUSIC')) __root = __dirname + '/MUSIC/'
else __root = __dirname + '/../MUSIC/'

if (!fs.existsSync(__root = __root + 'CloudMan/MUSIC/')) {
  fs.mkdirSync(__root, {
    recursive: true
  })
}

// Get downloaded list
{
  const dirlist = fs.readdirSync(__root)
  for (const dirname of dirlist) {
    const filelist = fs.readdirSync(__root + dirname + '/')
    for (const filename of filelist) {
      if (filename.startsWith('._')) continue
      const trackId = parseInt(filename.split('.')[0])
      if (filename.endsWith('.lrc')) that.downloaded.add(trackId)
      if (filename.endsWith('.mp3')) that.downloadedFormat[trackId] = 'mp3'
      else if (filename.endsWith('.flac')) that.downloadedFormat[trackId] = 'flac'
    }
  }
}

(async () => {
  // Login to Cloudmusic
  {
    logger.info('Login to Cloudmusic')
    let login = await fetch(config('api') + `/login/cellphone?phone=${config('phone')}&password=${config('password')}`)
    login = await login.json()
    logger.debug(login)
    if (login.code === 200) {
      logger.info('Login success!')
      that.uid = login['profile']['userId']
    } else {
      logger.error('Login failed!')
      throw new Error(login.msg)
    }
  }

  // Playlist list genreating
  let playlist = new Set()
  {
    logger.info('Requesting user\'s playlists')
    let plist = await fetch(config('api') + '/user/playlist?uid=' + that.uid)
    plist = await plist.json()
    logger.debug(plist)
    for (const i in plist['playlist']) {
      playlist.add(plist['playlist'][i].id)
    }

    const extraPlaylist = config('extraPlaylist', '').split(',')
    extraPlaylist.forEach((item) => playlist.add(parseInt(item.trim())))

    const excludePlaylist = config('excludePlaylist', '').split(',')
    excludePlaylist.forEach((item) => playlist.delete(parseInt(item.trim())))

    logger.info('Playlists', playlist)
  }

  // Playlists processing
  {
    for (const playlistId of playlist) {
      const queue = new PQueue({concurrency: config('playlistConcurrency', 2)})
      logger.info('Requesting details of playlist', playlistId)

      let listData = await fetch(config('api') + '/playlist/detail?id=' + playlistId)
      listData = await listData.json()

      const trackList = []
      const trackListPath = __root + '../' + that.replaceChar(listData['playlist']['name']) + '.m3u'
      const intervalId = setInterval(() => {
        const filecontent = '#EXTM3U\n\n' + trackList.join('\n')
        fs.writeFileSync(trackListPath, filecontent)
      }, 1000)

      listData = listData['playlist']['trackIds']

      for (let trackId of listData) {
        queue.add(async () => {
          trackId = parseInt(trackId['id'])
          const savePath = __root + sha1(trackId).substr(0, 2) + '/'

          if (that.downloaded.has(trackId)) {
            logger.info(`Track ${trackId} existed!`)
            trackList.push(savePath + trackId + '.' + that.downloadedFormat[trackId])
            return
          }

          logger.debug('Requesting details of track', trackId)

          let trackInfo = await fetch(config('api') + '/song/detail?ids=' + trackId)
          trackInfo = await trackInfo.json()
          logger.debug(trackInfo)

          if (trackInfo['songs'].length === 0) {
            logger.warn(`Track ${trackId} not found`)
            return
          }
          trackInfo = trackInfo['songs'][0]

          let filetype = 'flac'
          let hasCover = false
          if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true })

          // Download files
          {
            logger.debug('Requesting URL of track', trackInfo['name'])
            let trackURL = await fetch(config('api') + `/song/url?id=${trackId}&br=${config('bitRate', 9900000)}`)
            trackURL = await trackURL.json()
            logger.debug(trackURL)

            trackURL = trackURL['data'][0]
            if (!trackURL || !trackURL['url']) {
              logger.info(`Track ${trackInfo['name']} is not available due to copyright issue!`)
              return
            }
            trackURL = `${trackURL['url']}`
            if (trackURL.endsWith('mp3')) filetype = 'mp3'
          
            logger.info(`[Track: ${trackInfo['name']}][Music file] Start downloading...`)
            await that.downloadFile(trackInfo, trackURL, savePath)

            const coverURL = trackInfo['al']['picUrl'] || null
            if (coverURL) {
              logger.info(`[Track: ${trackInfo['name']}][Cover] Start downloading...`)
              await that.downloadFile(trackInfo, coverURL + '?param=640y640', savePath)
              hasCover = true
            }
          }

          // Metadata processing
          {
            const filepath = savePath + trackId + '.' + filetype

            const info = {
              title: trackInfo['name'],
              album: trackInfo['al']['name'],
              artist: trackInfo['ar'].map(v => v['name']).join('/'),
              cover: (hasCover) ? savePath + trackId + '.jpg' : null,
              year: (new Date(parseInt(trackInfo['publishTime']))).getFullYear(),
              no: `${trackInfo['no']}` || '',
            }

            if (filetype === 'mp3') {
              const tags = {
                title: info.title,
                album: info.album,
                artist: info.artist,
                year: info.year,
                date: info.year,
                TRCK: info.no,
              }
              if (hasCover) tags.APIC = info.cover
              logger.debug('MP3 meatadata', tags)

              const result = nodeID3.write(tags, filepath)
              if (result) {
                logger.debug('Metadata writed.')
              } else {
                logger.warn('Write metadata failed.')
              }
            } else {
              const flac = new Metaflac(filepath)

              flac.setTag('TITLE=' + info.title)
              flac.setTag('ALBUM=' + info.album)
              flac.setTag('ARTIST=' + info.artist)
              flac.setTag('DATE=' + info.year)
              flac.setTag('YEAR=' + info.year)
              flac.setTag('TRCK=' + info.no)
              
              if (hasCover) flac.importPicture(info.cover)

              for (let i = 0; i < 3; i++) flac.save()
            }

            fs.unlinkSync(info.cover)
          }

          // Lyric processing
          {
            logger.debug('Requesting lyric of track', trackInfo['name'])
            let result = await fetch(config('api') + `/lyric?id=${trackId}`)
            result = await result.json()

            if (!result['lrc'] || !result['lrc']['lyric']) {
              logger.debug('No lyric for track', trackInfo['name'])
            } else {
              let lyricModified = []

              lyricModified = lyricModified.concat(that.modifyLyric(result['lrc']['lyric']))
              if (result['tlyric'] && result['tlyric']['lyric']) 
                lyricModified = lyricModified.concat(that.modifyLyric(result['tlyric']['lyric'], 1))
            
              lyricModified = _.sortBy(lyricModified, ['time', 'type'])

              for (let i in lyricModified) {
                i = parseInt(i)
                const lyric = lyricModified[i]
                if (lyric.type === 0 || i === 0 || lyricModified[i - 1].type === 1
                || lyricModified[i - 1].time !== lyric.time) continue

                if (i === (lyricModified.length - 1)) {
                  if (lyric.content !== '') lyric.time += 100
                } else {
                  lyric.time = lyricModified[i + 1].time
                }

                lyricModified[i] = lyric
              }

              let lyric = []
              for (const info of lyricModified) {
                let hour = `${Math.floor(info.time / 60)}`
                if (hour.length === 1) hour = '0' + hour

                let sec = `${Math.floor(info.time % 60)}`
                if (sec.length === 1) sec = '0' + sec

                let micsec = `${parseFloat((info.time).toFixed(2))}`
                micsec = micsec.split('.')[1] || '00'
                if (micsec.length === 1) micsec = micsec + '0'

                const time = `[${hour}:${sec}.${micsec}]`
                lyric.push(time + info.content)
              }

              fs.writeFileSync(savePath + trackId + '.lrc', lyric.join('\n'))
            }
          }

          trackList.push(savePath + trackId + '.' + filetype)
          that.downloadedFormat[trackId] = filetype
          that.downloaded.add(trackId)
        })
      }

      await queue.onIdle()
      await queue.onEmpty()

      setTimeout(() => {
        clearInterval(intervalId)
      }, 1500)
    }
  }
})()

