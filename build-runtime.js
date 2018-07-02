// main.js
var path = require('path');
var fs = require('fs');
var JSZip = require('./lib/jszip.min.js');
var jsZip = new JSZip();

var rootPath;

function walk(dir, complete) {
    var dirList = [dir];
    var parentPathList = [rootPath];
    var parentZip = [jsZip];
    do {
        var dirItem = dirList.pop();
        var dirParentPath = parentPathList.pop();
        var dirZip = parentZip.pop();
        var folder = dirZip.folder(dirItem.slice(dirParentPath.length + 1, dirItem.length));
        var list = fs.readdirSync(dirItem);
        list.forEach(function (file) {
            file = path.join(dirItem, file);
            var stat = fs.statSync(file);
            if (stat && stat.isDirectory()) {
                dirList.push(file);
                parentPathList.push(dirItem);
                parentZip.push(folder);
            } else {
                folder.file(file.slice(dirItem.length + 1, file.length), fs.readFileSync(file));
            }
        });
        if (dirList.length <= 0) {
            complete();
        }
    } while (dirList.length > 0);
}

function onBeforeBuildFinish(event, options) {
    Editor.log('Building cpk ' + options.platform + ' to ' + options.dest);
    rootPath = options.dest;

    var mainName = 'main.js';
    var cfgName = 'game.config.json';
    var resName = 'res';
    var srcName = 'src';

    var fileMain = path.join(options.dest, mainName);
    var fileCfg = path.join(__dirname, cfgName);
    var dirRes = path.join(options.dest, resName);
    var dirSrc = path.join(options.dest, srcName);

    // var polyFilePath = path.join(__dirname, 'jsb_polyfill.js');
    // var srcPolyFilePath = path.join(dirSrc, 'jsb_polyfill.js');
    // fs.writeFileSync(srcPolyFilePath, fs.readFileSync(polyFilePath));

    //判断 res 与 src 是否遍历完成
    var isResComplete;
    var isSrcComplete;

    //生成压缩文件
    var zip = function () {
        var targetName = options.title + '.6.cpk';
        var dirTarget = path.join(options.dest, targetName);

        jsZip.generateNodeStream({ type: "nodebuffer" })
            .pipe(fs.createWriteStream(dirTarget))
            .on('finish', function () {
                let outTips = Editor.T('EXPORT_ASSET.export_tips', { outPath: dirTarget });
                Editor.log(outTips);
                event.reply()
            });
    };

    //添加 main.js 文件
    jsZip.file(mainName, fs.readFileSync(fileMain));
    //添加 game.config.json 文件
    jsZip.file(cfgName, fs.readFileSync(fileCfg));
    //添加 res 目录中的文件
    walk(dirRes, function () {
        isResComplete = true;
        if (isSrcComplete) {
            zip();
        }
    });
    //添加 src 目录中的文件
    walk(dirSrc, function () {
        isSrcComplete = true;
        if (isResComplete) {
            zip();
        }
    });
}

module.exports = {
    name: 'Runtime',
    extends: Editor.isWin32 ? 'win32' : 'mac',
    messages: {
        'build-finished': onBeforeBuildFinish,
    },
};