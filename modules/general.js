const fs = require('fs')
const path = require('path')
const pRetry = require('p-retry')
const logger = require('./logger')
const Downloader = require('nodejs-file-downloader')

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

    return pRetry(() => {
      const dl = new Downloader({
        url: fileURL,
        directory: path.resolve(savePath),
        fileName: filename,
        cloneFiles: false,
        timeout: (isPhoto) ? 10000 : 60000
      })

      return dl.download().then(() => {
        logger.debug(`[Track: ${trackInfo.title}][${msg}] Download completed!`)
      }).catch((error) => {
        logger.warn(`[Track: ${trackInfo.title}][${msg}]`, error)
        throw error
      })
    }, {
      retries: 3,
      onFailedAttempt: (error) => {
        logger.error(error)
        logger.warn(`[Track: ${trackInfo.title}][${msg}] ${error.attemptNumber} times failed. ${error.retriesLeft} times left.`)
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
        audioFile.endsWith('wma') ||
        audioFile.endsWith('flac') ||
        audioFile.endsWith('wav') ||
        audioFile.endsWith('mp4') ||
        audioFile.endsWith('m4a') ||
        audioFile.endsWith('aif') ||
        audioFile.endsWith('dsf') ||
        audioFile.endsWith('dff') ||
        audioFile.endsWith('ape'))) audioList.push(dirn + '/' + audioFile)
      }
      fs.writeFileSync(path.resolve(dirname, dirn + '.m3u'), '#EXTM3U\n\n' + audioList.join('\n'))
    }
  }
}
