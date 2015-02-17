var gulp = require('gulp'),
    imagemin = require('gulp-imagemin'),
    pngcrush = require('imagemin-pngcrush'),
    uglify = require('gulp-uglify'),
    stylus = require('gulp-stylus'),
    prefix = require('gulp-autoprefixer'),
    minifyCSS = require('gulp-minify-css'),
    grep = require('gulp-grep-stream'),
    mocha = require('gulp-mocha'),
    plumber = require('gulp-plumber'),
    nib = require('nib'),
    watch = require('gulp-watch'),
    sourcemaps = require('gulp-sourcemaps'),
    browserSync = require('browser-sync'),
    reload = browserSync.reload;

gulp.task('images', function () {
  watch({glob: 'src/img/**/*'},
        function(files) {
          files
          .pipe(plumber())
          .pipe(imagemin({
            progressive: true,
            svgoPlugins: [{removeViewBox: false}],
            use: [pngcrush()]
          }))
          .pipe(gulp.dest('public/img'))
          .pipe(reload({stream:true}));
        });
});

gulp.task('compress', function() {
  watch({glob: 'src/js/**/*.js'},
        function(files) {
          files
          .pipe(plumber())
          .pipe(sourcemaps.init())
          .pipe(uglify())
          .pipe(sourcemaps.write('maps', {
            sourceMappingURLPrefix: '/js/'
          }))
          .pipe(gulp.dest('public/js'))
          .pipe(reload({stream:true}));
        });
});

gulp.task('copy-json', function() {
  watch({glob: 'src/js/**/*.json'},
        function(files) {
          files
          .pipe(plumber())
          .pipe(gulp.dest('public/js'))
          .pipe(reload({stream:true}));
        });
});

gulp.task('minify-css', function() {
  watch({glob: 'src/css/**/*.css'},
        function(files) {
          files
          .pipe(plumber())
          .pipe(sourcemaps.init())
          .pipe(minifyCSS())
          .pipe(sourcemaps.write('maps'), {
            sourceMappingURLPrefix: '/css/'
          })
          .pipe(gulp.dest('public/css'))
          .pipe(reload({stream:true}));
        });
});

gulp.task('stylus', function () {
  watch({glob: 'src/css/**/*.styl'},
        function(files) {
          files
          .pipe(plumber())
          .pipe(sourcemaps.init())
          .pipe(stylus({compress: true, use: nib()}))
          .pipe(prefix())
          .pipe(sourcemaps.write('maps', {
            sourceMappingURLPrefix: '/css/'
          }))
          .pipe(gulp.dest('public/css'))
          .pipe(reload({stream:true}));
        });
});

gulp.task('mocha', function() {
  gulp.src(['test/*.js'], {read: false})
  .pipe(watch({ emit: 'all' }, function(files) {
          files
          .pipe(mocha({ reporter: 'spec' }))
          .on('error', function() {
            if (!/tests? failed/.test(err.stack)) {
              console.log(err.stack);
            }
          })
        }));
});

gulp.task('browser-sync', function() {
  browserSync.init(null, {
    proxy: 'localhost:3000',
    open: false,
    port: 8080,
    notify: false
  });
});

gulp.task('default', ['minify-css', 'stylus', 'images', 'compress', 'copy-json', 'browser-sync'], function () {
    gulp.watch(['views/**/*.jade'], reload);
});
