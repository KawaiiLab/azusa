const configFile = require('../config')

module.exports = (name, defaultValue = '') => {
  if (configFile[name]) return configFile[name]
  else return defaultValue
}
