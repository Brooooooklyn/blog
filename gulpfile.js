const gulp = require('gulp')
const replace = require('gulp-replace')

gulp.task('default', () => {
  gulp.src([
    './public/**/*.html'
  ])
    .pipe(replace('"../images', '"http://vvlyn.xyz/images'))
    .pipe(gulp.dest('./public'))
})