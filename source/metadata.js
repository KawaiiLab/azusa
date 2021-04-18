const fs = require('fs')
const path = require('path')
const logger = require('./logger')
const nodeID3 = require('node-id3')
const Metaflac = require('metaflac-js2')

module.exports = {
  generateTrackMetadata (data, publishTime = 0) {
    const metadata = {
      id: data.id,
      artist: '',
      artists: [],
      album: '',
      albumImg: null,
      albumNo: null,
      discNo: null,
      title: '',
      year: null
    }
    for (const artist of data.ar) metadata.artists.push(artist.name)

    metadata.album = data.al.name
    metadata.albumImg = data.al.picUrl || null
    metadata.albumNo = data.no
    metadata.discNo = data.cd
    if (data.publishTime || publishTime) {
      metadata.year = (new Date(parseInt(data.publishTime || publishTime, 10))).getFullYear()
    }

    metadata.title = data.name

    metadata.artist = metadata.artists.join('/')

    return metadata
  },

  writeMetadata (trackInfo, trackPath = '', coverPath = '') {
    if (trackPath.endsWith('mp3')) {
      const tags = {
        title: trackInfo.title,
        album: trackInfo.album,
        artist: trackInfo.artist,
        year: trackInfo.year,
        date: trackInfo.year,
        TRCK: trackInfo.albumNo,
        MCDI: trackInfo.discNo
      }
      if (trackInfo.albumImg) tags.APIC = path.resolve(coverPath)

      logger.debug('MP3 meatadata', tags)
      const result = nodeID3.write(tags, trackPath)
      if (result) {
        logger.debug('Metadata written.')
      } else {
        logger.warn('Write metadata failed.')
      }
    } else {
      const flac = new Metaflac(trackPath)

      flac.setTag('TITLE=' + trackInfo.title)
      flac.setTag('ALBUM=' + trackInfo.album)
      flac.setTag('ARTIST=' + trackInfo.artist)
      flac.setTag('DATE=' + trackInfo.year)
      flac.setTag('YEAR=' + trackInfo.year)
      flac.setTag('TRACKNUMBER=' + trackInfo.albumNo)
      flac.setTag('DISCNUMBER=' + trackInfo.discNo)

      if (trackInfo.albumImg) flac.importPicture(coverPath)

      flac.save()
    }

    if (trackInfo.albumImg) {
      fs.unlink(coverPath, (error) => {
        if (error) throw error
      })
    }
  }
}
