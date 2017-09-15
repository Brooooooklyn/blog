const process = require('child_process')

process.exec('yarn server', function (error, stdout, stderr) {
  if (error) console.log('exec error: ' + error)
})
