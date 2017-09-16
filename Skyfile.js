'use strict'

const config = require('config')

const USER = config.remote.USER
const PORT = config.remote.PORT
const HOST = config.remote.HOST
const OVERWRITE = true
const NOCHDIR = true
const FILTERS = [
  '+ package.json',
  '+ yarn.lock',
  '+ pm2',
  '+ pm2**',
  '+ app.js',
  '+ favicon.png',
  '+ gulpfile.js',
  '+ _config.yml',
  '+ scaffolds**',
  '+ source**',
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

  this.after([
    `cd ${path}/source`,
    'rm -rf themes',
    'git clone https://github.com/pinggod/hexo-theme-apollo.git themes/apollo --depth 1',
    'yarn',
    'yarn build',
    'pm2 restart blog-app || pm2 start ./pm2/app.json'
  ].join(' && '))
})
