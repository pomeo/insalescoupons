const gulp = require('gulp');
const imagemin = require('gulp-imagemin');
const pngcrush = require('imagemin-pngcrush');
const babel = require('gulp-babel');
const uglify = require('gulp-uglify');
const stylus = require('gulp-stylus');
const prefix = require('gulp-autoprefixer');
const minifyCSS = require('gulp-minify-css');
const plumber = require('gulp-plumber');
const notify = require('gulp-notify');
const nib = require('nib');
const sourcemaps = require('gulp-sourcemaps');
const concat = require('gulp-concat');
const browserSync = require('browser-sync');
const reload = browserSync.reload;

gulp.task('images', () => {
  return gulp.src('src/img/**/*')
    .pipe(plumber({
      errorHandler: notify.onError("Error: <%= error.message %>"),
    }))
    .pipe(imagemin({
      progressive: true,
      svgoPlugins: [{
        removeViewBox: false,
      }],
      use: [pngcrush()],
    }))
    .pipe(gulp.dest('public/img'))
    .pipe(reload({
      stream: true,
    }))
    .pipe(notify('Update images <%= file.relative %>'));
});

gulp.task('libs', () => {
  return gulp.src(['node_modules/jquery/dist/jquery.js',
                   'node_modules/jquery-validation/dist/jquery.validate.js',
                   'node_modules/jquery-validation/dist/additional-methods.js',
                   'node_modules/jquery-form/jquery.form.js',
                   'node_modules/jquery.threedubmedia/event.drag/jquery.event.drag.js',
                   'node_modules/uikit/dist/js/uikit.js',
                   'node_modules/uikit/dist/js/components/notify.js',
                   'node_modules/uikit/dist/js/components/form-select.js',
                   'node_modules/uikit/dist/js/components/upload.js',
                   'node_modules/uikit/dist/js/components/datepicker.js',
                   'node_modules/uikit/dist/js/components/autocomplete.js',
                   'node_modules/uikit/dist/js/components/tooltip.js',
                   'node_modules/SlickGrid/slick.core.js',
                   'node_modules/SlickGrid/slick.dataview.js',
                   'node_modules/SlickGrid/slick.grid.js',
                   'src/js/ui.js'])
    .pipe(plumber({
      errorHandler: notify.onError("Error: <%= error.message %>"),
    }))
    .pipe(sourcemaps.init())
    .pipe(uglify())
    .pipe(concat('libs.js'))
    .pipe(sourcemaps.write('maps', {
      sourceMappingURLPrefix: '/js/',
    }))
    .pipe(gulp.dest('public/js'))
    .pipe(reload({
      stream: true,
    }))
    .pipe(notify({
      onLast: true,
      message: 'Update libs.js',
    }));
});

gulp.task('compress', () => {
  return gulp.src(['src/js/ui.js'])
    .pipe(plumber({
      errorHandler: notify.onError("Error: <%= error.message %>"),
    }))
    .pipe(sourcemaps.init())
    .pipe(babel())
    .pipe(uglify())
    .pipe(concat('app.js'))
    .pipe(sourcemaps.write('maps', {
      sourceMappingURLPrefix: '/js/',
    }))
    .pipe(gulp.dest('public/js'))
    .pipe(reload({
      stream: true,
    }))
    .pipe(notify({
      onLast: true,
      message: 'Update app.js',
    }));
});

gulp.task('stylus', () => {
  return gulp.src(['node_modules/uikit/dist/css/uikit.css',
                   'node_modules/uikit/dist/css/uikit.gradient.css',
                   'node_modules/uikit/dist/css/components/notify.gradient.css',
                   'node_modules/uikit/dist/css/components/notify.css',
                   'node_modules/uikit/dist/css/components/tooltip.css',
                   'node_modules/uikit/dist/css/components/tooltip.gradient.css',
                   'node_modules/uikit/dist/css/components/form-select.css',
                   'node_modules/uikit/dist/css/components/form-select.gradient.css',
                   'node_modules/uikit/dist/css/components/upload.css',
                   'node_modules/uikit/dist/css/components/upload.gradient.css',
                   'node_modules/uikit/dist/css/components/placeholder.css',
                   'node_modules/uikit/dist/css/components/placeholder.gradient.css',
                   'node_modules/uikit/dist/css/components/form-file.css',
                   'node_modules/uikit/dist/css/components/form-file.gradient.css',
                   'node_modules/uikit/dist/css/components/progress.css',
                   'node_modules/uikit/dist/css/components/progress.gradient.css',
                   'node_modules/uikit/dist/css/components/datepicker.css',
                   'node_modules/uikit/dist/css/components/datepicker.gradient.css',
                   'node_modules/uikit/dist/css/components/autocomplete.css',
                   'node_modules/uikit/dist/css/components/autocomplete.gradient.css',
                   'src/css/styles.styl'])
    .pipe(plumber({
      errorHandler: notify.onError("Error: <%= error.message %>"),
    }))
    .pipe(sourcemaps.init())
    .pipe(stylus({
      compress: false,
      use: nib(),
    }))
    .pipe(prefix())
    .pipe(minifyCSS())
    .pipe(concat('styles.css'))
    .pipe(sourcemaps.write('maps'), {
      sourceMappingURLPrefix: '/css/',
    })
    .pipe(gulp.dest('public/css'))
    .pipe(reload({
      stream: true,
    }))
    .pipe(notify({
      onLast: true,
      message: 'Update stylus',
    }));
});

gulp.task('build', ['libs', 'compress', 'stylus']);

gulp.task('browser-sync', () => {
  browserSync.init(null, {
    proxy: 'localhost:3000',
    open: false,
    port: 8081,
    notify: false,
  });
});

gulp.task('default', ['build', 'images', 'browser-sync'], () => {
  gulp.watch(['views/**/*.jade'], reload);
  gulp.watch(['src/**/*.styl'], ['stylus']);
  gulp.watch(['src/**/*.js'], ['compress']);
  gulp.watch(['src/img/*'], ['images']);
});
