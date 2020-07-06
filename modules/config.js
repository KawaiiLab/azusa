require('dotenv').config()
const _ = require('lodash')

module.exports = (name, defaultValue = '') => {
  if (process.env['cm_' + name]) {
    const value = `${process.env['cm_' + name]}`.trim()
    if (_.isNumber(defaultValue)) return parseInt(value, 10)
    else if (_.isBoolean(defaultValue)) return value === 'true'
    else return value
  } else return defaultValue
}
