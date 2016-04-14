const process = require('child_process');

process.exec(' hexo g -d', function (error, stdout, stderr) {
  if (error) console.log('exec error: ' + error);
});
