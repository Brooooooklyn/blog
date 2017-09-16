const process = require('child_process')

process.exec('./node_modules/.bin/hexo server', function (error, stdout, stderr) {
  if (error) console.log('exec error: ' + error)
})
