const fs = require('fs')
const requireFromString = require('require-from-string')

const configData = requireFromString(fs.readFileSync(process.cwd() + '/config.js').toString())

module.exports = (name, defaultValue = '') => {
  if (configData[name]) return configData[name]
  else return defaultValue
}
