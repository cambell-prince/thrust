var gulp = require('gulp');
var gutil = require('gulp-util');
var child_process = require('child_process');
var exec2 = require('child_process').exec;
var async = require('async');
var template = require('lodash.template');
var rename = require("gulp-rename");

var execute = function(command, options, callback) {
  if (options == undefined) {
    options = {};
  }
  command = template(command, options);
  if (!options.silent) {
    gutil.log(gutil.colors.green(command));
  }
  if (!options.dryRun) {
    if (options.env == undefined) {
      exec2(command, function(err, stdout, stderr) {
        gutil.log(stdout);
        gutil.log(gutil.colors.yellow(stderr));
        callback(err);
      });
    } else {
      exec2(command, {env: options.env}, function(err, stdout, stderr) {
        gutil.log(stdout);
        gutil.log(gutil.colors.yellow(stderr));
        callback(err);
      });
    }
  } else {
    callback(null);
  }
};

var paths = {
  src: ['js/thrust.js', 'assets/*', 'index.html']
};

// livereload
var livereload = require('gulp-livereload');
var lr = require('tiny-lr');
var server = lr();

gulp.task('default', function() {
  // place code for your default task here
});

gulp.task('do-reload', function() {
  return gulp.src('index.html').pipe(livereload(server));
});

gulp.task('reload', function() {
  server.listen(35729, function(err) {
    if (err) {
      return console.log(err);
    }
    gulp.watch(paths.src, [ 'do-reload' ]);
  });
});

gulp.task('package', function(cb) {
  var options = {
    dryRun: false,
    silent: false,
    src: "./",
    name: "thrust",
    version: "0.1.0",
    release: "-alpha"
  };
  execute(
    'cd <%= src %> && tar -cvzf ../<%= name %>-<%= version %><%= release %>.tgz -X ../upload-exclude.txt *',
    options,
    cb
  );
});

gulp.task('upload', function(cb) {
  var options = {
    dryRun: false,
    silent : false,
    src : ".",
    dest : "root@saygoweb.com:/var/www/virtual/saygoweb.com/demo/htdocs/thrust/"
  };
  execute(
    'rsync -rzlt --chmod=Dug=rwx,Fug=rw,o-rwx --delete --exclude-from="upload-exclude.txt" --stats --rsync-path="sudo -u vu2006 rsync" --rsh="ssh" <%= src %>/ <%= dest %>',
    options,
    cb
  );
});

gulp.task('tasks', function(cb) {
  var command = 'grep gulp\.task gulpfile.js';
  execute(command, null, function(err) {
    cb(null); // Swallow the error propagation so that gulp doesn't display a nodejs backtrace.
  });
});

gulp.task('watch', function() {
//  gulp.watch([paths.src, paths.testE2E], ['test-current']);
//  gulp.watch([paths.testUnit, paths.src], ['test-php']);
});
