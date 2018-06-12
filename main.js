// main.js
var path = require('path');
var fs = require('fs');
var JSZip = require('./lib/jszip.min.js');
var jsZip = new JSZip();

walk = function (dir, callback, complete) {
    var dirList = [dir];
    do {
        var dirItem = dirList.pop();
        var list = fs.readdirSync(dirItem);
        list.forEach(function (file) {
            file = dirItem + '/' + file;
            var stat = fs.statSync(file);
            if (stat && stat.isDirectory()) {
                dirList.push(file);
            } else {
                callback(file)
            }
        });
        if (dirList.length <= 0) {
            complete();
        }
    } while (dirList.length > 0);
}

function onBeforeBuildFinish(options, callback) {
    Editor.log('Building cpk ' + options.platform + ' to ' + options.dest);

    var mainName = 'main.js';
    var resName = 'res';
    var srcName = 'src';

    var fileMain = path.join(options.dest, mainName);
    var dirRes = path.join(options.dest, resName);
    var dirSrc = path.join(options.dest, srcName);

    //判断 res 与 src 是否遍历完成
    var isResComplete;
    var isSrcComplete;

    //生成压缩文件
    var zip = function () {
        var targetName = 'runtime-tests.2.cpk';
        var dirTarget = path.join(options.dest, targetName);

        jsZip.generateNodeStream({ type: "nodebuffer" })
            .pipe(fs.createWriteStream(dirTarget))
            .on('finish', function () {
                let outTips = Editor.T('EXPORT_ASSET.export_tips', { outPath: dirTarget });
                Editor.log(outTips);
                callback()
            });
    }

    //添加main.js 文件
    jsZip.file(mainName, fs.readFileSync(fileMain));
    //添加 res 目录中的文件
    walk(dirRes, function (file) {
        var name = file.slice(options.dest.length, file.length);
        jsZip.file(name, fs.readFileSync(file));
    }, function () {
        isResComplete = true;
        if (isSrcComplete) {
            zip();
        }
    });
    //添加 src 目录中的文件
    walk(dirSrc, function (file) {
        var name = file.slice(options.dest.length, file.length);
        jsZip.file(name, fs.readFileSync(file));
    }, function () {
        isSrcComplete = true;
        if (isResComplete) {
            zip();
        }
    });
}

module.exports = {
    load() {
        Editor.Builder.on('before-change-files', onBeforeBuildFinish);
    },

    unload() {
        Editor.Builder.removeListener('before-change-files', onBeforeBuildFinish);
    }
};