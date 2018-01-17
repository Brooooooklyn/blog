const gulp = require('gulp')
const replace = require('gulp-replace')

gulp.task('default', () => {
  gulp.src([
    './public/**/*.html'
  ])
    .pipe(replace('"../images', '"https://blog.lynvv.xyz/images'))
    .pipe(gulp.dest('./public'))
})
