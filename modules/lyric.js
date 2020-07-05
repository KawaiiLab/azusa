const _ = require('lodash')
const config = require('./config')

module.exports = {
  modifyLyric (str, type = 0) {
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
  },

  generateLyric (trackId, lyridData) {
    let lyricModified = []

    lyricModified = lyricModified.concat(this.modifyLyric(lyridData.lrc.lyric))
    if (lyridData.tlyric && lyridData.tlyric.lyric) {
      lyricModified = lyricModified.concat(this.modifyLyric(lyridData.tlyric.lyric, 1))
    }

    lyricModified = _.sortBy(lyricModified, ['time', 'type'])

    for (let i in lyricModified) {
      i = parseInt(i)
      const lyric = lyricModified[i]
      if (lyric.type === 0 || i === 0 || lyricModified[i - 1].type === 1 ||
              lyricModified[i - 1].time !== lyric.time) continue

      if (config('mergeTranslation', false)) {
        lyricModified[i - 1].content += ' - ' + lyric.content
      } else if (i === (lyricModified.length - 1)) {
        if (lyric.content !== '') lyric.time += 100
      } else {
        lyric.time = lyricModified[i + 1].time
      }

      lyricModified[i] = lyric
    }

    if (config('mergeTranslation', false)) {
      _.remove(lyricModified, (v) => {
        return v.type === 1
      })
    }

    const lyric = []
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

    return lyric.join('\n')
  }
}
