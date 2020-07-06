const config = require('./config')
const colors = require('colors')
const ProgressBar = require('progress')

let logLevel = config('logLevel', 'info')

switch (logLevel) {
case 'debug':
  logLevel = 0
  break
case 'info':
  logLevel = 1
  break
case 'warn':
  logLevel = 2
  break
case 'error':
  logLevel = 3
  break
}

const generatePrefix = (level = 'info') => {
  let color
  switch (level) {
  case 'debug':
    color = 'green'
    break
  case 'info':
    color = 'blue'
    break
  case 'warn':
    color = 'yellow'
    break
  case 'error':
    color = 'red'
  }

  return [
    colors.gray(`[${(new Date()).toISOString()}]`),
    colors[color](`[${level.toUpperCase()}]`)
  ]
}

module.exports = {
  _log () {
    if (this._bar) {
      this._bar.interrupt([...arguments].join(' '))
    } else {
      console.log.apply(null, [...arguments])
    }
  },

  debug () {
    if (logLevel > 0) return
    this._log(...generatePrefix('debug'), ...arguments)
  },

  info () {
    if (logLevel > 1) return
    this._log(...generatePrefix('info'), ...arguments)
  },
  warn () {
    if (logLevel > 2) return
    this._log(...generatePrefix('warn'), ...arguments)
  },
  error () {
    if (logLevel > 3) return
    this._log(...generatePrefix('error'), ...arguments)
  },

  initBar (trackNum = 0) {
    this._bar = new ProgressBar('Progress [:bar] :current/:total :percent ETA :etas', {
      width: 40,
      total: trackNum,
      head: '>',
      callback: () => {
        console.log('\n')
      }
    })

    return this._bar
  }
}
