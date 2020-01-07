const gulp = require('gulp')
const replace = require('gulp-replace')
const rev = require('gulp-rev')
const concat = require('gulp-concat')
const postcss = require('gulp-postcss')
const cssnano = require('cssnano')

gulp.task('rev', () => 
  gulp.src([
    './public/css/style.css',
    './source/custom.css',
  ])
    .pipe(concat('style.css'))
    .pipe(postcss([cssnano()]))
    .pipe(rev())
    .pipe(gulp.dest('public/css'))
    .pipe(rev.manifest())
    .pipe(gulp.dest('public/css'))
)

gulp.task('replace-image', () =>
  gulp.src([
    './public/**/*.html'
  ])
    .pipe(replace('"../images', '"https://blog.lynvv.xyz/images'))
    .pipe(gulp.dest('./public'))
)

gulp.task('replace-css', () => {
  const manifest = require('./public/css/rev-manifest.json')

  return gulp.src([
    './public/**/*.html'
  ])
    .pipe(replace('/css/style.css', `/css/${manifest['style.css']}`))
    .pipe(gulp.dest('./public'))
})

gulp.task('replace', gulp.series('replace-image', 'replace-css'))

exports.default = gulp.series('rev', 'replace')
