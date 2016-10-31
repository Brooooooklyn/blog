'use strict'

const config = require('config')

const USER = config.remote.USER
const PORT = config.remote.PORT
const HOST = config.remote.HOST
const OVERWRITE = true
const NOCHDIR = true
const FILTERS = [
  '+ package.json',
  '+ lib',
  '+ lib**',
  '+ pm2',
  '+ pm2**',
  '+ public',
  '+ app.js',
  '+ public**',
  '- **'
]

sneaky('release', function () {
  let path = `/app/Blog`

  this.user = USER
  this.port = PORT
  this.host = HOST
  this.filter = FILTERS.join('\n')
  this.overwrite = OVERWRITE
  this.nochdir = NOCHDIR

  this.description = `Deploy Blog`
  this.path = path
  this.before([
    'hexo generate',
    'gulp'
  ].join(' && '))
  this.after([
    `cd ${path}/source`,
    'npm install --production',
    'pm2 restart blog-app'
  ].join(' && '))
})
