const fs = require('fs')
const path = require('path')
const fetch = require('./fetch')
const pRetry = require('p-retry')
const logger = require('./logger')
const config = require('./config')
const MultipartDownload = require('multipart-download')

module.exports = {
  replaceChar (str) {
    // eslint-disable-next-line no-useless-escape
    return `${str}`.replace(/[\\\/:\*\?"<>\|\t]/gm, ' ')
  },

  downloadFile (trackInfo, fileURL, savePath) {
    fileURL = fileURL.replace('https', 'http')
    logger.debug('File URL', fileURL)
    let isPhoto = false
    let msg = 'Music file'
    if (fileURL.endsWith('640')) {
      isPhoto = true
      msg = 'Cover'
    }

    const filename = trackInfo.id + ((isPhoto) ? '.jpg' : ((fileURL.endsWith('mp3')) ? '.mp3' : '.flac'))

    return pRetry(async () => {
      return await new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Timeout')), (isPhoto) ? 5000 : 20000)

        if (isPhoto) {
          fetch(fileURL).then((res) => {
            const fileStream = fs.createWriteStream(path.resolve(savePath, filename))
            res.body.pipe(fileStream)

            res.body.on('error', (error) => {
              logger.warn(`[Track: ${trackInfo.title}][${msg}]`, error)
              reject(error)
            })

            fileStream.on('finish', () => {
              logger.info(`[Track: ${trackInfo.title}][${msg}] Download completed!`)
              resolve()
            })
          })
        } else {
          new MultipartDownload()
            .start(fileURL, {
              numOfConnections: config('downloadThreads', 4),
              saveDirectory: path.resolve(savePath),
              fileName: filename
            })
            .on('error', (error) => {
              logger.warn(`[Track: ${trackInfo.title}][${msg}]`, error)
              reject(error)
            })
            .on('end', () => {
              logger.info(`[Track: ${trackInfo.title}][${msg}] Download completed!`)
              resolve()
            })
        }
      })
    }, {
      retries: 3,
      onFailedAttempt: (error) => {
        logger.error(error)
        logger.warn(`[Track: ${trackInfo.title}][${msg}] Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`)
      }
    })
  },

  genUserPlaylistFile (__root) {
    const dirname = path.resolve(__root, '../../')
    const dirlist = fs.readdirSync(dirname)
    for (const dirn of dirlist) {
      const userDirname = path.resolve(dirname, dirn)

      if (dirn === 'CloudMan') continue
      if (!fs.existsSync(userDirname) || !fs.lstatSync(userDirname).isDirectory()) continue

      const audioList = []
      const filelist = fs.readdirSync(userDirname)

      for (const audioFile of filelist) {
        if (!audioFile.startsWith('._') &&
      (audioFile.endsWith('mp3') ||
        audioFile.endsWith('flac') ||
        audioFile.endsWith('pcm') ||
        audioFile.endsWith('wav') ||
        audioFile.endsWith('aac'))) audioList.push(dirn + '/' + audioFile)
      }
      fs.writeFileSync(path.resolve(dirname, dirn + '.m3u'), '#EXTM3U\n\n' + audioList.join('\n'))
    }
  }
}
