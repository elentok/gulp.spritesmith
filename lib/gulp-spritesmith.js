var assert = require('assert');
var path = require('path');
var Readable = require('stream').Readable;
var through2 = require('through2');
var _ = require('underscore');
var gutil = require('gulp-util');
var json2css = require('json2css');
var spritesmith = require('spritesmith');
var url = require('url2');
var fs = require('fs');

function ExtFormat() {
  this.formatObj = {};
}
ExtFormat.prototype = {
  'add': function (name, val) {
    this.formatObj[name] = val;
  },
  'get': function (filepath) {
    // Grab the extension from the filepath
    var ext = path.extname(filepath),
        lowerExt = ext.toLowerCase();

    // Look up the file extenion from our format object
    var formatObj = this.formatObj,
        format = formatObj[lowerExt];
    return format;
  }
};

// Create img and css formats
var imgFormats = new ExtFormat();
var cssFormats = new ExtFormat();

// Add our img formats
imgFormats.add('.png', 'png');
imgFormats.add('.jpg', 'jpeg');
imgFormats.add('.jpeg', 'jpeg');

// Add our css formats
cssFormats.add('.styl', 'stylus');
cssFormats.add('.stylus', 'stylus');
cssFormats.add('.sass', 'sass');
cssFormats.add('.scss', 'scss');
cssFormats.add('.less', 'less');
cssFormats.add('.json', 'json');
cssFormats.add('.css', 'css');

// Create a gulp-spritesmith function
function gulpSpritesmith(params) {
  var imgName = params.imgName;
  var cssName = params.cssName;
  assert(imgName, 'An `imgName` parameter was not provided to `gulp.spritesmith` (required)');
  assert(cssName, 'A `cssName` parameter was not provided to `gulp.spritesmith` (required)');

  // Define our output streams
  var imgStream = new Readable({objectMode: true});
  imgStream._read = function imgRead () {
    // Do nothing, let the `finish` handler take care of this
  };
  var cssStream = new Readable({objectMode: true});
  cssStream._read = function cssRead () {
    // Do nothing, let the `finish` handler take care of this
  };

  // Create a stream to take in images
  var images = [];
  var onData = function (file, encoding, cb) {
    var filepath = file.path;
    if (filepath) {
      images.push(filepath);
    }
    cb();
  };

  // When we have completed our input
  var onEnd = function (cb) {
    // Determine the format of the image
    var imgOpts = params.imgOpts || {};
    var imgFormat = imgOpts.format || imgFormats.get(imgName) || 'png';

    // Set up the defautls for imgOpts
    imgOpts = _.defaults({}, imgOpts, {'format': imgFormat});

    // Run through spritesmith
    var spritesmithParams = {
      'src': images,
      'engine': params.engine || 'auto',
      'algorithm': params.algorithm || 'top-down',
      'padding': params.padding || 0,
      'algorithmOpts': params.algorithmOpts || {},
      'engineOpts': params.engineOpts || {},
      'exportOpts': imgOpts
    };
    var that = this;
    spritesmith(spritesmithParams, function (err, result) {
      // If an error occurred, emit it
      if (err) {
        return cb(err);
      }

      // Otherwise, write out the image
      var imgFile = new gutil.File({
        path: imgName,
        contents: new Buffer(result.image, 'binary')
      });
      that.push(imgFile);
      imgStream.push(imgFile);
      imgStream.push(null);

      // START OF BARELY MODIFIED SECTION FROM grunt-spritesmith@1.22.0
      // Generate a listing of CSS variables
      var coordinates = result.coordinates;
      var properties = result.properties;
      var spritePath = params.imgPath || url.relative(cssName, imgName);
      var cssVarMap = params.cssVarMap || function noop () {};
      var cleanCoords = [];

      // Clean up the file name of the file
      Object.getOwnPropertyNames(coordinates).sort().forEach(function (file) {
        // Extract the image name (exlcuding extension)
        var fullname = path.basename(file);
        var nameParts = fullname.split('.');

        // If there is are more than 2 parts, pop the last one
        if (nameParts.length >= 2) {
          nameParts.pop();
        }

        // Extract out our name
        var name = nameParts.join('.');
        var coords = coordinates[file];

        // Specify the image for the sprite
        coords.name = name;
        coords.source_image = file;
        coords.image = spritePath;
        coords.total_width = properties.width;
        coords.total_height = properties.height;

        // Map the coordinates through cssVarMap
        coords = cssVarMap(coords) || coords;

        // Save the cleaned name and coordinates
        cleanCoords.push(coords);
      });

      // Render the variables via json2css
      var cssFormat = params.cssFormat || cssFormats.get(cssName) || 'json';
      var cssTemplate = params.cssTemplate;

      // If there's a custom template, use it
      if (cssTemplate) {
        cssFormat = 'spritesmith-custom';
        if (typeof cssTemplate === 'function') {
          json2css.addTemplate(cssFormat, cssTemplate);
        } else {
          json2css.addMustacheTemplate(cssFormat, fs.readFileSync(cssTemplate, 'utf8'));
        }
      }

      var cssStr = json2css(cleanCoords, {'format': cssFormat, 'formatOpts': params.cssOpts || {}});
      // END OF BARELY MODIFIED SECTION FROM grunt-spritesmith@1.22.0

      // Output the CSS
      var cssFile = new gutil.File({
        path: cssName,
        contents: new Buffer(cssStr)
      });
      that.push(cssFile);
      cssStream.push(cssFile);
      cssStream.push(null);
      cb();
    });
  };

  // Return output stream with two sub-streams:
  // - master stream includes all files
  // - 'css' stream for css only
  // - 'img' stream for images only
  var retStream = through2.obj(onData, onEnd);
  retStream.css = cssStream;
  retStream.img = imgStream;
  return retStream;
}

module.exports = gulpSpritesmith;
