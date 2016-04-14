const process = require('child_process');

process.exec('hexo server', function (error, stdout, stderr) {
  if (error) console.log('exec error: ' + error);
});
