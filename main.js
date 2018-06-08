// main.js
var path = require('path');
var fs = require('fs');
var archiver = require('archiver');

function onBeforeBuildFinish(options, callback) {
    Editor.log('Building cpk' + options.platform + ' to ' + options.dest); // 你可以在控制台输出点什么

    var mainName = 'main.js';
    var resName = 'res/';
    var srcName = 'src/';
    var targetName = 'runtime-tests.2.cpk';

    var dirTarget = path.join(options.dest, targetName);

    var fileMain = path.join(options.dest, mainName);
    var dirRes = path.join(options.dest, resName);
    var dirSrc = path.join(options.dest, srcName);

    // create a file to stream archive data to.
    var output = fs.createWriteStream(dirTarget);
    var archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level.
    });
    // listen for all archive data to be written
    // 'close' event is fired only when a file descriptor is involved
    output.on('close', function () {
        callback();
    });
    // good practice to catch this error explicitly
    archive.on('error', function (err) {
        Editor.log("build cpk error occurred");
        Editor.log(err);
        callback();
    });
    // pipe archive data to the file
    archive.pipe(output);
    // append a file from stream
    archive.append(fs.createReadStream(fileMain), { name: mainName });
    archive.directory(dirRes, resName);
    archive.directory(dirSrc, srcName);
    archive.finalize();
}

module.exports = {
    load() {
        Editor.Builder.on('before-change-files', onBeforeBuildFinish);
    },

    unload() {
        Editor.Builder.removeListener('before-change-files', onBeforeBuildFinish);
    }
};